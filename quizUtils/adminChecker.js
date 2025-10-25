const bot = require("../utils/telegramBot");
const Chat = require("../models/chats");
const connectDB = require("../utils/db");
const fs = require("fs");
const path = require("path");
const isBotAdmin = require("../utils/isBotAdmin");

// 🔹 Check and handle admin status for a single chat
async function checkAndNotifyAdminStatus(chat, botId) {
  const { chatId, chatTitle } = chat;
  const groupName = chatTitle || chatId;
  const result = { chatId, chatTitle: groupName };

  try {
    // ✅ Skip non-group chats
    if (chatId > 0) {
      console.log(`⏭️ Skipping non-group chat: ${groupName}`);
      result.skipped = true;
      return result;
    }

    // Check if bot is admin
    const botIsAdmin = await isBotAdmin(chatId);

    if (!botIsAdmin) {
      console.log(`🚫 [NOT ADMIN] Bot is NOT admin in: "${groupName}"`);

      chat.quizEnabled = false;
      chat.canSend = false;
      chat.nextQuizTime = null;
      await chat.save();

      try {
        await bot.telegram.sendMessage(
          chatId,
          `<b>⚠️ Attention!</b>\n` +
            `<blockquote>@EnglishByLoukyaBot isn’t an admin in this group 🤖💬</blockquote>\n\n` +
            `❌ <b>Quizzes are paused.</b>\n\n` +
            `<blockquote>✅ Make me an admin and run /startquiz@EnglishByLoukyaBot to resume.</blockquote>\n\n` +
            `<b>⚙️ Once I’m admin, use</b> /settings@EnglishByLoukyaBot <b>to manage features like:</b>\n` +
            `<blockquote>` +
            `• Auto quiz intervals ⏱️\n` +
            `• Auto-delete old quizzes 🗑\n` +
            `• Show /myscore in group 📊\n` +
            `• Daily leaderboard 📈` +
            `</blockquote>`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        if (
          err.message.includes("not enough rights") ||
          err.message.includes("kicked") ||
          err.message.includes("chat not found")
        ) {
          chat.quizEnabled = false;
          chat.canSend = false;
          await chat.save();
          console.warn(
            `🚷 Disabled restricted or removed group: "${groupName}"`
          );
        } else {
          console.warn(
            `⚠️ Failed to send message to "${groupName}": ${err.message}`
          );
        }
      }

      result.isAdmin = false;
      result.quizEnabled = chat.quizEnabled;
      return result;
    }

    // ✅ Bot is admin
    console.log(`✅ [ADMIN] Bot is admin in: "${groupName}"`);
    result.isAdmin = true;
    result.quizEnabled = chat.quizEnabled;
    return result;
  } catch (err) {
    console.error(`❌ Error checking "${groupName}": ${err.message}`);
    result.error = err.message;
    return result;
  }
}

// 🔹 Weekly full admin check with JSON report
async function runWeeklyAdminCheck() {
  try {
    await connectDB();

    console.log("🔍 Starting full admin status check for all groups...\n");

    const botInfo = await bot.telegram.getMe();
    const botId = botInfo.id;

    // ✅ Select all group chats (exclude private messages)
    const chats = await Chat.find({ chatId: { $lt: 0 } });

    console.log(`📊 Found ${chats.length} groups to check.\n`);

    const results = [];

    for (const chat of chats) {
      console.log(`🔎 Checking: ${chat.chatTitle || chat.chatId}`);
      const res = await checkAndNotifyAdminStatus(chat, botId);
      results.push(res);

      // 🕒 Add delay to avoid rate limits
      await new Promise((res) => setTimeout(res, 2000));
    }

    // Save results
    const outputPath = path.join(__dirname, "admin_report.json");
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\n📦 Admin report saved to ${outputPath}`);
    console.log(`✅ Total groups checked: ${results.length}`);
  } catch (err) {
    console.error("❌ Error during weekly admin check:", err.message);
  }
}

module.exports = { checkAndNotifyAdminStatus, runWeeklyAdminCheck };
