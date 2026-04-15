const Timer = require('./Timer');
const Player = require('./Player');
const Question = require('./Question');

const GAME_STATES = {
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting'
};

const DEFAULT_TIMER = 60;
const MAX_ATTEMPTS = 3;
const MIN_PLAYERS_TO_START = 3;

class GameSessionEvent {
  constructor({ data, eventName, message }) {
    this.data = data;
    this.eventName = eventName;
    this.message = message;
  }
}

class GameSession {
  constructor({ io }) {
    this.io = io;
    this.players = [];
    this.question = null;
    this.events = [];
    this.timer = new Timer({ gameSession: this });
    this.state = GAME_STATES.WAITING;
    this.gameMaster = null;
    this.playersIndex = {};
    this.roundLocked = false;
  }

  createGameEvent({ message, data, eventName }) {
    const event = new GameSessionEvent({ message, data, eventName });
    this.events.push(event);
    return event;
  }

  emitEvent(event) {
    this.io.emit(event.eventName, event);
  }

  emitGameEvent({ message, data, eventName }) {
    const event = this.createGameEvent({ message, data, eventName });
    this.emitEvent(event);
  }

  getPlayerList() {
    return this.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isGameMaster: p.isGameMaster,
      attempts: p.attempts || 0
    }));
  }

  _isGameMaster(socket) {
    return this.playersIndex[socket.id] === this.gameMaster;
  }

  createQuestion({ event, socket }) {
    if (!this._isGameMaster(socket)) {
      return socket.emit('error', { message: 'Only the Game Master can set questions.' });
    }

    if (this.state === GAME_STATES.IN_PROGRESS) {
      return socket.emit('error', { message: 'Cannot set question while game is in progress.' });
    }

    const { question, answer } = event;
    if (!question?.trim() || !answer?.trim()) {
      return socket.emit('error', { message: 'Question and answer cannot be empty.' });
    }

    this.question = new Question({ question, answer });
    
    this.emitGameEvent({
      message: `📝 Question set by Game Master: "${this.question.question}"`,
      eventName: 'question_created',
      data: { question: this.question.question }   // ✅ ADDED
    });
  }

  startGame({ socket }) {
    if (!this._isGameMaster(socket)) {
      return socket.emit('error', { message: 'Only the Game Master can start the game.' });
    }

    if (this.state === GAME_STATES.IN_PROGRESS) {
      return socket.emit('error', { message: 'Game is already in progress.' });
    }

    if (!this.question) {
      return socket.emit('error', { message: 'Please set a question first.' });
    }

    if (this.players.length < MIN_PLAYERS_TO_START) {
      return socket.emit('error', { 
        message: `Need at least ${MIN_PLAYERS_TO_START} players to start. Current: ${this.players.length}` 
      });
    }

    this.players.forEach(p => p.attempts = 0);
    
    this.state = GAME_STATES.IN_PROGRESS;
    this.roundLocked = false;
    this.timer.start();

    this.emitGameEvent({
      message: `🚀 GAME STARTED! Question: ${this.question.question}`,
      eventName: 'game_started',
      data: { question: this.question.question }   // ✅ ADDED
    });
  }

  guessAnswer({ event, socket }) {
    if (this.state !== GAME_STATES.IN_PROGRESS || this.roundLocked) {
      return;
    }

    const player = this.playersIndex[socket.id];
    if (!player) return;

    player.attempts = player.attempts || 0;
    
    if (player.attempts >= MAX_ATTEMPTS) {
      return socket.emit('error', { 
        message: `You have used all ${MAX_ATTEMPTS} attempts for this round.` 
      });
    }

    const guess = event.answer?.trim();
    if (!guess) return;

    player.attempts++;
    const isCorrect = this.question.isAnswer(guess);

    this.emitGameEvent({
      message: `💬 ${player.name} guessed "${guess}" (${MAX_ATTEMPTS - player.attempts} attempts left)`,
      eventName: 'guess'
    });

    if (isCorrect) {
      this.handleCorrectGuess(player);
    }
  }

  handleCorrectGuess(player) {
    this.roundLocked = true;
    this.timer.stop();
    this.state = GAME_STATES.WAITING;

    player.score += 10;
    
    this.emitGameEvent({
      message: `🏆 ${player.name} got it right! Answer: "${this.question.answer}". +10 points!`,
      eventName: 'round_ended'
    });

    this.io.to(player.id).emit('you_won', { 
      message: '🎉 You have won this round! +10 points.' 
    });

    this.assignNewGameMaster();
  }

  handleTimeExpired() {
    this.roundLocked = true;
    this.state = GAME_STATES.WAITING;

    this.emitGameEvent({
      message: `⏱️ Time's up! No winner this round. The answer was: "${this.question.answer}"`,
      eventName: 'round_ended'
    });

    this.assignNewGameMaster();
  }

  assignNewGameMaster() {
    if (this.gameMaster) {
      this.gameMaster.isGameMaster = false;
    }
    this.gameMaster = null;

    if (this.players.length === 0) return;

    const currentIndex = this.players.findIndex(p => p.id === (this.gameMaster?.id || -1));
    const nextIndex = (currentIndex + 1) % this.players.length;
    
    this.players[nextIndex].isGameMaster = true;
    this.gameMaster = this.players[nextIndex];

    this.emitGameEvent({
      message: `👑 New Game Master: ${this.gameMaster.name}`,
      data: this.getPlayerList(),
      eventName: 'new_game_master'
    });

    this.question = null;
  }

  join({ event, socket }) {
    if (this.state === GAME_STATES.IN_PROGRESS) {
      return socket.emit('join_error', { 
        message: 'Game is in progress. Please wait for the next round.' 
      });
    }

    const name = event.data?.name?.trim();
    if (!name || name.length < 2) {
      return socket.emit('join_error', { 
        message: 'Name must be at least 2 characters.' 
      });
    }

    if (this.playersIndex[socket.id]) {
      return socket.emit('join_error', { 
        message: 'You are already in the game.' 
      });
    }

    const isGM = this.players.length === 0;
    const player = new Player({ name, id: socket.id, isGameMaster: isGM });
    
    this.players.push(player);
    this.playersIndex[socket.id] = player;
    
    if (isGM) {
      this.gameMaster = player;
    }

    this.emitGameEvent({
      message: `✨ ${name} joined the game!`,
      data: { players: this.getPlayerList(), gameMaster: this.gameMaster },
      eventName: 'player_joined'
    });

    // Send current question to new player if exists
    if (this.question) {
      socket.emit('question_created', {
        message: `Current question: "${this.question.question}"`,
        data: { question: this.question.question }
      });
    }
  }

  exit({ socket }) {
    const player = this.playersIndex[socket.id];
    if (!player) return;

    this.players = this.players.filter(p => p.id !== socket.id);
    delete this.playersIndex[socket.id];

    this.emitGameEvent({
      message: `👋 ${player.name} left the game.`,
      data: this.getPlayerList(),
      eventName: 'player_left'
    });

    if (this.players.length === 0) {
      this.cleanup();
      return;
    }

    if (player === this.gameMaster) {
      this.assignNewGameMaster();
    }
  }

  cleanup() {
    this.players = [];
    this.playersIndex = {};
    this.timer.stop();
    this.state = GAME_STATES.WAITING;
    this.gameMaster = null;
    this.question = null;
    this.roundLocked = false;
    this.events = [];
    console.log('🧹 Game session cleared. Waiting for new players...');
  }
}

module.exports = GameSession;