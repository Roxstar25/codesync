require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

 const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'CodeSync API is running',
    endpoints: ['/health', '/socket.io'],
    version: '1.0.0'
  });
});

// Store rooms and their code
const rooms = new Map();

// Socket.io for real-time collaboration
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        code: '// Start coding here...\n',
        language: 'javascript',
        users: new Set()
      });
    }
    rooms.get(roomId).users.add(socket.id);
    
    // Send current code to new user
    socket.emit('code-update', rooms.get(roomId).code);
    socket.emit('language-update', rooms.get(roomId).language);
    
    // Notify others
    socket.to(roomId).emit('user-joined', socket.id);
  });

  // Code changes
  socket.on('code-change', ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
      socket.to(roomId).emit('code-update', code);
    }
  });

  // Language changes
  socket.on('language-change', ({ roomId, language }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).language = language;
      socket.to(roomId).emit('language-update', language);
    }
  });

  // Cursor position
  socket.on('cursor-move', ({ roomId, position, userId }) => {
    socket.to(roomId).emit('cursor-update', { position, userId });
  });

  // Chat messages
  socket.on('chat-message', ({ roomId, message, userId }) => {
    io.to(roomId).emit('chat-message', { message, userId, timestamp: new Date() });
  });

  // AI Review request
  socket.on('request-ai-review', ({ roomId, code, language }) => {
    // Simulate AI review (replace with actual AI API call)
    const review = generateAIReview(code, language);
    socket.emit('ai-review', review);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Clean up rooms
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', socket.id);
      }
    });
  });
});

// Smart AI review simulation
function generateAIReview(code, language) {
  const issues = [];
  let score = 100;
  
  // Check for var usage
  const varCount = (code.match(/\bvar\b/g) || []).length;
  if (varCount > 0) {
    issues.push({ 
      type: 'warning', 
      line: 1, 
      message: `Found ${varCount} use(s) of 'var'. Use 'let' or 'const' instead.` 
    });
    score -= varCount * 5;
  }
  
  // Check for console.log
  const logCount = (code.match(/console\.log/g) || []).length;
  if (logCount > 0) {
    issues.push({ 
      type: 'info', 
      line: 1, 
      message: `Found ${logCount} console.log statement(s). Remove before production.` 
    });
    score -= logCount * 3;
  }
  
  // Check for functions
  const functionCount = (code.match(/function\s+\w+/g) || []).length;
  if (functionCount === 0 && code.length > 50) {
    issues.push({ 
      type: 'warning', 
      line: 1, 
      message: 'No functions found. Consider modularizing your code.' 
    });
    score -= 10;
  }
  
  // Check code length
  const lines = code.split('\n').length;
  if (lines > 50) {
    issues.push({ 
      type: 'info', 
      line: 1, 
      message: `File is ${lines} lines long. Consider splitting into modules.` 
    });
    score -= 5;
  }
  
  // Check for comments
  const commentCount = (code.match(/\/\/|\/\*|\*/g) || []).length;
  if (commentCount === 0 && lines > 10) {
    issues.push({ 
      type: 'info', 
      line: 1, 
      message: 'No comments found. Add documentation for clarity.' 
    });
    score -= 5;
  }
  
  // Check for semicolons (JS/TS)
  if (language === 'javascript' || language === 'typescript') {
    const linesWithoutSemicolons = code.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && 
             !trimmed.endsWith(';') && 
             !trimmed.endsWith('{') && 
             !trimmed.endsWith('}') &&
             !trimmed.startsWith('//') &&
             !trimmed.startsWith('/*') &&
             !trimmed.startsWith('*') &&
             !trimmed.startsWith('import') &&
             !trimmed.startsWith('export');
    }).length;
    
    if (linesWithoutSemicolons > 5) {
      issues.push({ 
        type: 'info', 
        line: 1, 
        message: 'Inconsistent semicolon usage. Choose a style and stick to it.' 
      });
      score -= 3;
    }
  }
  
  // Ensure score is between 0-100
  score = Math.max(0, Math.min(100, score));
  
  return {
    summary: `Found ${issues.length} suggestion${issues.length !== 1 ? 's' : ''}`,
    issues,
    score,
    metrics: {
      lines,
      functions: functionCount,
      comments: commentCount
    }
  };
}

