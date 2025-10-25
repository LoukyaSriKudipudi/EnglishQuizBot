const mongoose = require("mongoose");

const quizStatsSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    total: { type: Number, default: 0 },
    today: { type: Number, default: 0 },
    thisWeek: { type: Number, default: 0 },
    thisMonth: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizStats", quizStatsSchema);
