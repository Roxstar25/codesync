// CodeSync - Real-time AI Code Review & Pair Programming
const SOCKET_URL = 'https://codesync-production-4a7a.up.railway.app';
let socket;
let editor;
let currentRoom = 'room-1';
let userId = 'user-' + Math.random().toString(36).substr(2, 9);

// Initialize app
function init() {
  renderApp();
  initSocket();
  initMonaco();
}

// Render main app layout
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="container">
      <header>
        <h1>CodeSync</h1>
        <div style="display:flex;gap:1rem;align-items:center;">
          <span style="color:var(--text-light);font-size:0.875rem;">Room: ${currentRoom}</span>
          <div style="width:8px;height:8px;background:var(--success);border-radius:50%;" id="connection-status"></div>
        </div>
      </header>
      
      <aside class="sidebar">
        <h3>Files</h3>
        <ul class="file-tree">
          <li class="active" onclick="selectFile(this)">📄 main.js</li>
          <li onclick="selectFile(this)">📄 utils.js</li>
          <li onclick="selectFile(this)">📄 styles.css</li>
          <li onclick="selectFile(this)">📄 README.md</li>
        </ul>
      </aside>
      
      <div class="editor-area">
        <div class="toolbar">
          <select id="language-select" onchange="changeLanguage()">
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
          </select>
          <button onclick="requestAIReview()">🤖 AI Review</button>
          <button onclick="shareRoom()">🔗 Share</button>
        </div>
        <div id="editor"></div>
      </div>
      
      <aside class="right-panel">
        <div class="panel-tabs">
          <div class="panel-tab active" onclick="switchTab('chat')">Chat</div>
          <div class="panel-tab" onclick="switchTab('review')">AI Review</div>
        </div>
        <div class="panel-content" id="panel-content">
          ${renderChatPanel()}
        </div>
      </aside>
    </div>
  `;
}

// Initialize Socket.io
function initSocket() {
  socket = io(SOCKET_URL);
  
  socket.on('connect', () => {
    document.getElementById('connection-status').style.background = 'var(--success)';
    socket.emit('join-room', currentRoom);
  });
  
  socket.on('disconnect', () => {
    document.getElementById('connection-status').style.background = 'var(--danger)';
  });
  
  socket.on('code-update', (code) => {
    if (editor && editor.getValue() !== code) {
      editor.setValue(code);
    }
  });
  
  socket.on('language-update', (language) => {
    document.getElementById('language-select').value = language;
  });
  
  socket.on('chat-message', ({ message, userId: senderId, timestamp }) => {
    addChatMessage(message, senderId, timestamp);
  });
  
  socket.on('ai-review', (review) => {
    displayAIReview(review);
  });
  
  socket.on('user-joined', (id) => {
    addSystemMessage(`User ${id.substr(0, 6)} joined`);
  });
  
  socket.on('user-left', (id) => {
    addSystemMessage(`User ${id.substr(0, 6)} left`);
  });
}

// Initialize Monaco Editor
// Initialize Code Editor (textarea-based for reliability)
function initMonaco() {
  const editorDiv = document.getElementById('editor');
  editorDiv.innerHTML = '<textarea id="code-editor" style="width:100%;height:100%;background:var(--bg);color:var(--text);border:none;padding:1rem;font-family:monospace;font-size:14px;resize:none;outline:none;" spellcheck="false">// Welcome to CodeSync!\n// Start coding here...\n\nfunction hello() {\n  console.log("Hello, World!");\n}\n\nhello();</textarea>';
  
  editor = {
    getValue: () => document.getElementById('code-editor').value,
    setValue: (val) => { document.getElementById('code-editor').value = val; }
  };
  
  // Send code changes to server
  document.getElementById('code-editor').addEventListener('input', () => {
    if (socket) {
      socket.emit('code-change', {
        roomId: currentRoom,
        code: editor.getValue()
      });
    }
  });
}

// Change language
window.changeLanguage = function() {
  const language = document.getElementById('language-select').value;
  if (editor) {
    monaco.editor.setModelLanguage(editor.getModel(), language);
  }
  if (socket) {
    socket.emit('language-change', { roomId: currentRoom, language });
  }
};

// Request AI review
window.requestAIReview = function() {
  if (!editor || !socket) return;
  
  const code = editor.getValue();
  const language = document.getElementById('language-select').value;
  
  socket.emit('request-ai-review', {
    roomId: currentRoom,
    code,
    language
  });
  
  // Show loading
  document.getElementById('panel-content').innerHTML = `
    <div style="text-align:center;padding:2rem;">
      <div style="font-size:2rem;margin-bottom:1rem;">🤖</div>
      <div>Analyzing your code...</div>
    </div>
  `;
  switchTab('review');
};

// Display AI review
function displayAIReview(review) {
  const issuesHtml = review.issues.map(issue => `
    <div class="issue ${issue.type}">
      <div class="issue-type">${issue.type}</div>
      <div>${issue.message}</div>
    </div>
  `).join('');
  
  document.getElementById('panel-content').innerHTML = `
    <div class="review-summary">
      <div class="review-score">${review.score}</div>
      <div style="color:var(--text-light);">Code Quality Score</div>
    </div>
    <div style="margin-bottom:1rem;font-weight:600;">${review.summary}</div>
    <div class="review-issues">
      ${issuesHtml || '<div style="color:var(--success);">No issues found! Great job!</div>'}
    </div>
  `;
}

// Chat panel
function renderChatPanel() {
  return `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div class="chat-messages" id="chat-messages">
        <div class="chat-message">
          <div class="user">System</div>
          <div>Welcome to CodeSync! Start collaborating.</div>
        </div>
      </div>
      <div class="chat-input">
        <input type="text" id="chat-input" placeholder="Type a message..." onkeypress="if(event.key==='Enter')sendChat()">
        <button onclick="sendChat()">Send</button>
      </div>
    </div>
  `;
}

// Send chat message
window.sendChat = function() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !socket) return;
  
  socket.emit('chat-message', {
    roomId: currentRoom,
    message,
    userId
  });
  
  input.value = '';
};

// Add chat message
function addChatMessage(message, senderId, timestamp) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `
    <div class="user">${senderId === userId ? 'You' : 'User ' + senderId.substr(0, 6)}</div>
    <div>${message}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Add system message
function addSystemMessage(message) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.style.opacity = '0.7';
  div.innerHTML = `<div style="font-style:italic;color:var(--text-light);">${message}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Switch tab
window.switchTab = function(tab) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  if (tab === 'chat') {
    document.getElementById('panel-content').innerHTML = renderChatPanel();
  }
};

// Select file
window.selectFile = function(element) {
  document.querySelectorAll('.file-tree li').forEach(li => li.classList.remove('active'));
  element.classList.add('active');
};

// Share room
window.shareRoom = function() {
  const url = `${window.location.origin}?room=${currentRoom}`;
  navigator.clipboard.writeText(url);
  alert('Room link copied to clipboard!');
};

// Start app
init();
