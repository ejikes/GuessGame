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
  guessPanel: document.getElementById('guessPanel'),
  guessForm: document.getElementById('guessForm'),
  guessInput: document.getElementById('guessInput'),
  guessMessage: document.getElementById('guessMessage'),
  attemptsUsed: document.getElementById('attemptsUsed'),
  maxAttempts: document.getElementById('maxAttempts'),
  winnerMessage: document.getElementById('winnerMessage'),
  eventLog: document.getElementById('eventLog'),
  clearLogBtn: document.getElementById('clearLogBtn')
};

const playerTemplate = document.getElementById('playerTemplate');

// State
let localPlayer = { id: null, name: null, isGM: false, joined: false };
let gameState = 'waiting';
let questionSet = false;
let maxAttempts = 3;
let attemptsLeft = maxAttempts;

// Helpers
function addLog(msg) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = msg;
  elements.eventLog.appendChild(entry);
  elements.eventLog.scrollTop = elements.eventLog.scrollHeight;
}

function updateConnection(connected) {
  if (connected) {
    elements.statusDot.classList.add('connected');
    elements.statusText.textContent = 'Connected';
  } else {
    elements.statusDot.classList.remove('connected');
    elements.statusText.textContent = 'Disconnected';
  }
}

function renderPlayers(players) {
  elements.playerList.innerHTML = '';
  if (!players || players.length === 0) {
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
  if (localPlayer.isGM && localPlayer.joined) {
    elements.gmPanel.classList.remove('hidden');
  } else {
    elements.gmPanel.classList.add('hidden');
  }
  
  if (!localPlayer.isGM && localPlayer.joined && gameState === 'in_progress') {
    elements.guessPanel.classList.remove('hidden');
    elements.guessInput.disabled = false;
    elements.guessForm.querySelector('button').disabled = false;
  } else {
    elements.guessPanel.classList.add('hidden');
    elements.guessInput.disabled = true;
    elements.guessForm.querySelector('button').disabled = true;
  }
  
  if (localPlayer.isGM) {
    elements.startGameBtn.disabled = !questionSet || gameState === 'in_progress';
    elements.startHint.textContent = questionSet ? 'Ready to start!' : 'Set a question first';
  }
}

function updateGameState(state) {
  gameState = state;
  if (state === 'in_progress') {
    elements.gameStateBadge.textContent = '🎮 IN PROGRESS';
    elements.gameStateBadge.classList.add('in-progress');
    attemptsLeft = maxAttempts;
    elements.attemptsUsed.textContent = '0';
    elements.winnerMessage.classList.add('hidden');
    elements.guessMessage.textContent = '';
  } else {
    elements.gameStateBadge.textContent = '⏳ WAITING';
    elements.gameStateBadge.classList.remove('in-progress');
  }
  updateUIBasedOnRole();
}

// Helper to extract question from message (fallback)
function extractQuestionFromMessage(msg) {
  const match = msg.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

// Socket Events
socket.on('connect', () => {
  updateConnection(true);
  addLog('🟢 Connected to server');
});
socket.on('disconnect', () => {
  updateConnection(false);
  addLog('🔴 Disconnected');
  localPlayer.joined = false;
  elements.joinCard.classList.remove('hidden');
});
socket.on('player_connected', data => { localPlayer.id = data.id; });
socket.on('join_error', data => { alert(data.message); addLog(`❌ ${data.message}`); });
socket.on('player_joined', event => {
  addLog(event.message);
  if (event.data) renderPlayers(event.data.players);
  if (event.data?.players?.some(p => p.id === localPlayer.id)) {
    localPlayer.joined = true;
    elements.joinCard.classList.add('hidden');
  }
});
socket.on('player_left', event => {
  addLog(event.message);
  if (event.data) renderPlayers(event.data);
});
socket.on('question_created', event => {
  addLog(event.message);
  questionSet = true;
  
  // Get question from data (server should send it) or fallback to parsing message
  let questionText = event.data?.question || extractQuestionFromMessage(event.message) || 'Set';
  elements.currentQuestion.textContent = questionText;
  
  if (localPlayer.isGM) {
    elements.startGameBtn.disabled = false;
    elements.startHint.textContent = 'Ready to start!';
  }
});
socket.on('game_started', event => {
  addLog(event.message);
  updateGameState('in_progress');
  
  // Update question display from data or fallback
  let questionText = event.data?.question || extractQuestionFromMessage(event.message);
  if (questionText) {
    elements.currentQuestion.textContent = questionText;
  }
});
socket.on('time', event => {
  // FIXED: event is an object with .message containing the seconds string
  elements.timerValue.textContent = event.message || '0';
});
socket.on('guess', event => { addLog(event.message); });
socket.on('round_ended', event => {
  addLog(event.message);
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
  addLog(event.message);
  if (event.data) renderPlayers(event.data);
});
socket.on('you_won', data => {
  addLog(`🎉 ${data.message}`);
  elements.winnerMessage.classList.remove('hidden');
  setTimeout(() => elements.winnerMessage.classList.add('hidden'), 5000);
});
socket.on('error', data => { alert(data.message); addLog(`⚠️ ${data.message}`); });

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
  addLog(`📝 Question set: "${q}"`);
});
elements.startGameBtn.addEventListener('click', () => { socket.emit('start_game'); });
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
elements.clearLogBtn.addEventListener('click', () => { elements.eventLog.innerHTML = ''; addLog('📋 Log cleared'); });

// Init
updateConnection(socket.connected);