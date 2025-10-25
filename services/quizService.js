const fs = require("fs");
const path = require("path");
const Chat = require("../models/chats");
const bot = require("../utils/telegramBot");
// Load quiz questions
const quizFile = fs.readFileSync(
  path.join(__dirname, "..", "localDB", "quiz.json")
);

const quizzes = JSON.parse(quizFile);
let index = 0;

// Get next quiz question cyclically
function getQuestion() {
  const question = quizzes[index];
  index = (index + 1) % quizzes.length;
  return question;
}

// Command to enable quizzes in a chat
bot.command("startquiz", async (ctx) => {
  await Chat.updateOne(
    { chatId: ctx.chat.id },
    { $set: { quizEnabled: true, chatTitle: ctx.chat.title } },
    { upsert: true }
  );

  setTimeout(() => ctx.deleteMessage(ctx.message.message_id), 3000);

  const message = await ctx.reply("✅ Quiz enabled in this chat.");
  setTimeout(
    () => ctx.telegram.deleteMessage(ctx.chat.id, message.message_id),
    30000
  );
});

// Command to disable quizzes in a chat
bot.command("stopquiz", async (ctx) => {
  await Chat.updateOne(
    { chatId: ctx.chat.id },
    { $set: { quizEnabled: false } }
  );

  setTimeout(() => ctx.deleteMessage(ctx.message.message_id), 3000);

  const message = await ctx.reply("🛑 Quiz disabled in this chat.");
  setTimeout(
    () => ctx.telegram.deleteMessage(ctx.chat.id, message.message_id),
    30000
  );
});

module.exports = { getQuestion };
