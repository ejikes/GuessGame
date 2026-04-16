const socket = io();

// DOM Elements
const elements = {
  statusDot: document.querySelector('.dot'),
  statusText: document.getElementById('statusText'),
  playerCount: document.getElementById('playerCount'),
  playerList: document.getElementById('playerList'),
  gmName: document.getElementById('gmName'),
  joinCard: document.getElementById('joinCard'),
  joinForm: document.getElementById('joinForm'),
  playerName: document.getElementById('playerName'),
  gmPanel: document.getElementById('gmPanel'),
  questionInput: document.getElementById('questionInput'),
  answerInput: document.getElementById('answerInput'),
  setQuestionBtn: document.getElementById('setQuestionBtn'),
  startGameBtn: document.getElementById('startGameBtn'),
  startHint: document.getElementById('startHint'),
  gameStateBadge: document.getElementById('gameStateBadge'),
  timerValue: document.getElementById('timerValue'),
  currentQuestion: document.getElementById('currentQuestion'),
  guessArea: document.getElementById('guessArea'),
  guessForm: document.getElementById('guessForm'),
  guessInput: document.getElementById('guessInput'),
  guessMessage: document.getElementById('guessMessage'),
  attemptsUsed: document.getElementById('attemptsUsed'),
  maxAttempts: document.getElementById('maxAttempts'),
  winnerToast: document.getElementById('winnerToast'),
  chatMessages: document.getElementById('chatMessages'),
  togglePlayerListBtn: document.getElementById('togglePlayerListBtn')
};

const playerTemplate = document.getElementById('playerTemplate');

// State
let localPlayer = { id: null, name: null, isGM: false, joined: false };
let gameState = 'waiting';
let questionSet = false;
let maxAttempts = 3;
let attemptsLeft = maxAttempts;
let playerListCollapsed = false;

// Helpers
function addChatMessage(text, type = 'normal') {
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.textContent = text;
  elements.chatMessages.appendChild(msg);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function updateConnection(connected) {
  elements.statusDot.classList.toggle('connected', connected);
  elements.statusText.textContent = connected ? 'Connected' : 'Disconnected';
}

function renderPlayers(players) {
  elements.playerList.innerHTML = '';
  if (!players?.length) {
    elements.playerList.innerHTML = '<li class="empty-msg">No players yet</li>';
    elements.playerCount.textContent = '0';
    elements.gmName.textContent = '—';
    return;
  }
  elements.playerCount.textContent = players.length;
  players.sort((a,b) => b.score - a.score);
  players.forEach(p => {
    const clone = playerTemplate.content.cloneNode(true);
    const li = clone.querySelector('.player-item');
    li.querySelector('.player-name').textContent = p.name + (p.id === localPlayer.id ? ' (You)' : '');
    li.querySelector('.player-score').textContent = p.score;
    const crown = li.querySelector('.crown');
    if (p.isGameMaster) {
      li.classList.add('is-gm');
      crown.style.display = 'inline';
      elements.gmName.textContent = p.name;
      localPlayer.isGM = (p.id === localPlayer.id);
    } else {
      crown.style.display = 'none';
    }
    elements.playerList.appendChild(li);
  });
  updateUIBasedOnRole();
}

function updateUIBasedOnRole() {
  // Join card visibility
  elements.joinCard.classList.toggle('hidden', localPlayer.joined);
  
  // GM panel visibility and positioning
  const isGM = localPlayer.isGM && localPlayer.joined;
  elements.gmPanel.classList.toggle('hidden', !isGM);
  
  if (isGM) {
    // Move GM panel to the top of sidebar (before player list card)
    const sidebar = document.querySelector('.sidebar');
    const playerCard = elements.playerList.closest('.sidebar-card');
    sidebar.insertBefore(elements.gmPanel, playerCard);
  }
  
  // Guess area
  const showGuess = !localPlayer.isGM && localPlayer.joined && gameState === 'in_progress';
  elements.guessArea.classList.toggle('hidden', !showGuess);
  if (showGuess) {
    elements.guessInput.disabled = false;
    elements.guessForm.querySelector('button').disabled = false;
  } else {
    elements.guessInput.disabled = true;
    elements.guessForm.querySelector('button').disabled = true;
  }
  
  // Start button state
  if (localPlayer.isGM) {
    elements.startGameBtn.disabled = !questionSet || gameState === 'in_progress';
    elements.startHint.textContent = questionSet ? 'Ready to start!' : 'Set a question first';
  }
}

function updateGameState(state) {
  gameState = state;
  elements.gameStateBadge.textContent = state === 'in_progress' ? '🎮 IN PROGRESS' : '⏳ WAITING';
  elements.gameStateBadge.classList.toggle('in-progress', state === 'in_progress');
  
  if (state === 'in_progress') {
    attemptsLeft = maxAttempts;
    elements.attemptsUsed.textContent = '0';
    elements.winnerToast.classList.add('hidden');
    elements.guessMessage.textContent = '';
  }
  updateUIBasedOnRole();
}

function extractQuestionFromMessage(msg) {
  const match = msg.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

// Collapsible player list toggle
elements.togglePlayerListBtn.addEventListener('click', () => {
  playerListCollapsed = !playerListCollapsed;
  elements.playerList.classList.toggle('collapsed', playerListCollapsed);
  elements.togglePlayerListBtn.classList.toggle('collapsed', playerListCollapsed);
  elements.togglePlayerListBtn.textContent = playerListCollapsed ? '▶' : '▼';
});

// Socket Events
socket.on('connect', () => {
  updateConnection(true);
  addChatMessage('🟢 Connected to server', 'system');
});
socket.on('disconnect', () => {
  updateConnection(false);
  addChatMessage('🔴 Disconnected', 'system');
  localPlayer.joined = false;
  updateUIBasedOnRole();
});
socket.on('player_connected', data => { localPlayer.id = data.id; });
socket.on('join_error', data => { 
  alert(data.message); 
  addChatMessage(`❌ ${data.message}`, 'system');
});
socket.on('player_joined', event => {
  addChatMessage(event.message);
  if (event.data) renderPlayers(event.data.players);
  if (event.data?.players?.some(p => p.id === localPlayer.id)) {
    localPlayer.joined = true;
  }
});
socket.on('player_left', event => {
  addChatMessage(event.message);
  if (event.data) {
    renderPlayers(event.data);
    updateUIBasedOnRole();
  }
});
socket.on('question_created', event => {
  addChatMessage(event.message);
  questionSet = true;
  const q = event.data?.question || extractQuestionFromMessage(event.message) || 'Set';
  elements.currentQuestion.textContent = q;
  if (localPlayer.isGM) {
    elements.startGameBtn.disabled = false;
    elements.startHint.textContent = 'Ready to start!';
  }
});
socket.on('game_started', event => {
  addChatMessage(event.message);
  updateGameState('in_progress');
  const q = event.data?.question || extractQuestionFromMessage(event.message);
  if (q) elements.currentQuestion.textContent = q;
});
socket.on('time', event => {
  elements.timerValue.textContent = event.message || '0';
});
socket.on('guess', event => {
  addChatMessage(event.message);
});
socket.on('round_ended', event => {
  addChatMessage(event.message, 'winner');
  updateGameState('waiting');
  questionSet = false;
  elements.currentQuestion.textContent = '—';
  if (localPlayer.isGM) {
    elements.startGameBtn.disabled = true;
    elements.startHint.textContent = 'Set a question first';
    elements.questionInput.value = '';
    elements.answerInput.value = '';
  }
});
socket.on('new_game_master', event => {
  addChatMessage(event.message);
  if (event.data) renderPlayers(event.data);
  setTimeout(() => updateUIBasedOnRole(), 0);
});
socket.on('you_won', data => {
  addChatMessage(`🎉 ${data.message}`, 'winner');
  elements.winnerToast.classList.remove('hidden');
  setTimeout(() => elements.winnerToast.classList.add('hidden'), 4000);
});
socket.on('error', data => {
  alert(data.message);
  addChatMessage(`⚠️ ${data.message}`, 'system');
});

// UI Listeners
elements.joinForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = elements.playerName.value.trim();
  if (name.length < 2) return alert('Name too short');
  socket.emit('join', { data: { name } });
  localPlayer.name = name;
});
elements.setQuestionBtn.addEventListener('click', () => {
  const q = elements.questionInput.value.trim();
  const a = elements.answerInput.value.trim();
  if (!q || !a) return alert('Please fill both fields');
  socket.emit('create_question', { question: q, answer: a });
  elements.currentQuestion.textContent = q;
  addChatMessage(`📝 Question set: "${q}"`);
});
elements.startGameBtn.addEventListener('click', () => socket.emit('start_game'));
elements.guessForm.addEventListener('submit', e => {
  e.preventDefault();
  const guess = elements.guessInput.value.trim();
  if (!guess) return;
  socket.emit('guess_answer', { answer: guess });
  elements.guessInput.value = '';
  attemptsLeft--;
  elements.attemptsUsed.textContent = maxAttempts - attemptsLeft;
  if (attemptsLeft <= 0) {
    elements.guessInput.disabled = true;
    elements.guessForm.querySelector('button').disabled = true;
    elements.guessMessage.textContent = 'No attempts left.';
  }
});
socket.on('game_started', () => {
  attemptsLeft = maxAttempts;
  elements.attemptsUsed.textContent = '0';
  elements.guessInput.disabled = false;
  elements.guessForm.querySelector('button').disabled = false;
  elements.guessMessage.textContent = '';
});

// Init
updateConnection(socket.connected);