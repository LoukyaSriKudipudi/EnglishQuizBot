function validateQuiz({ question, options, explanation }) {
  if (question.length > 300) {
    return `Question too long (${question.length}/300)`;
  }
  if (explanation && explanation.length > 200) {
    return `Explanation too long (${explanation.length}/200)`;
  }
  if (options.length > 10) {
    return `Too many options (${options.length}/10)`;
  }
  for (const opt of options) {
    if (opt.length > 100) {
      return `Option too long (${opt.length}/100)`;
    }
  }
  return null;
}

module.exports = validateQuiz;
