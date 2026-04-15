class Player {
  constructor({ name, isGameMaster = false, id }) {
    this.id = id;
    this.name = name.trim();
    this.isGameMaster = isGameMaster;
    this.score = 0;
    this.attempts = 0;
  }

  setGameMaster(bool) { this.isGameMaster = bool; }
  
  resetRound() { this.attempts = 0; }
  
  guessAnswer(question, guess) {
    return question.isAnswer(guess);
  }
}

module.exports = Player;