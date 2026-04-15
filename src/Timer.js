const { DEFAULT_TIMER } = require('../config/constants');

class Timer {
  constructor({ gameSession }) {
    this.seconds = 0;
    this.intervalId = null;
    this.gameSession = gameSession;
  }

  start() {
    this.seconds = 0;
    this.intervalId = setInterval(() => {
      this.seconds++;
      this.gameSession.emitGameEvent({
        message: String(DEFAULT_TIMER - this.seconds),
        eventName: 'time'
      });

      if (this.seconds >= DEFAULT_TIMER) {
        this.stop();
        this.gameSession.handleTimeExpired();
      }
    }, 1000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.seconds = 0;
  }
}

module.exports = Timer;