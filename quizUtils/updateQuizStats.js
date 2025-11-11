const QuizStats = require("../models/quizStats");

// ✅ Always get current date/time in IST
function getISTDate() {
  const nowUTC = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // +5:30 hours
  return new Date(nowUTC.getTime() + istOffset);
}

// ✅ Start of the day in IST
function getStartOfISTDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ✅ Start of the week in IST (Monday as first day)
function getStartOfISTWeek(date) {
  const d = getStartOfISTDay(date);
  const day = d.getDay(); // Sunday=0
  const diff = (day + 6) % 7; // shift to Monday
  d.setDate(d.getDate() - diff);
  return d;
}

// ✅ Start of the month in IST
function getStartOfISTMonth(date) {
  const d = getStartOfISTDay(date);
  d.setDate(1);
  return d;
}

async function updateQuizStats() {
  const now = getISTDate();

  const startOfDay = getStartOfISTDay(now);
  const startOfWeek = getStartOfISTWeek(now);
  const startOfMonth = getStartOfISTMonth(now);

  // There should be only one document
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

  // Reset daily, weekly, monthly counters based on IST
  if (!stats.date || stats.date < startOfDay) stats.today = 0;
  if (!stats.date || stats.date < startOfWeek) stats.thisWeek = 0;
  if (!stats.date || stats.date < startOfMonth) stats.thisMonth = 0;

  // Increment counters
  stats.total += 1;
  stats.today += 1;
  stats.thisWeek += 1;
  stats.thisMonth += 1;

  stats.date = now;
  await stats.save();
}

module.exports = { updateQuizStats };
