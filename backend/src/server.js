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

// Simple AI review simulation
function generateAIReview(code, language) {
  const issues = [];
  
  if (code.includes('var ')) {
    issues.push({ type: 'warning', line: 1, message: 'Use let or const instead of var' });
  }
  if (code.includes('console.log')) {
    issues.push({ type: 'info', line: 1, message: 'Remove console.log before production' });
  }
  if (!code.includes('function') && !code.includes('=>')) {
    issues.push({ type: 'info', line: 1, message: 'Consider modularizing your code with functions' });
  }
  if (code.length > 500) {
    issues.push({ type: 'warning', line: 1, message: 'File is getting long. Consider splitting into modules' });
  }
  
  return {
    summary: `Found ${issues.length} suggestion${issues.length !== 1 ? 's' : ''}`,
    issues,
    score: Math.max(0, 100 - issues.length * 15)
  };
}

server.listen(PORT, () => {
  console.log(`CodeSync server running on port ${PORT}`);
});
