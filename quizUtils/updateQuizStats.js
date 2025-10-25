// utils/updateQuizStats.js
const QuizStats = require("../models/quizStats");

function getISTDate() {
  // Current date/time in IST
  const now = new Date();
  const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(istString);
}

async function updateQuizStats() {
  const now = getISTDate();

  // Start of day/week/month in IST
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay() // Sunday = 0
  );
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // There should be only one stats document
  let stats = await QuizStats.findOne();
  if (!stats) {
    stats = new QuizStats({
      date: now,
      total: 0,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
    });
  }

  // Reset if day/week/month changed
  if (!stats.date || stats.date < startOfDay) stats.today = 0;
  if (!stats.date || stats.date < startOfWeek) stats.thisWeek = 0;
  if (!stats.date || stats.date < startOfMonth) stats.thisMonth = 0;

  // Increment counters
  stats.total += 1;
  stats.today += 1;
  stats.thisWeek += 1;
  stats.thisMonth += 1;

  // Update last updated time
  stats.date = now;

  await stats.save();
}

module.exports = { updateQuizStats };
