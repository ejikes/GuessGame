class Question {
  constructor({ question, answer }) {
    this.question = question.trim();
    this.answer = answer.trim().toLowerCase();
  }

  isAnswer(guess) {
    return this.answer === guess.trim().toLowerCase();
  }
}

module.exports = Question;