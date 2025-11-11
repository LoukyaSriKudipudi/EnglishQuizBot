const bot = require("../utils/telegramBot");
const Chat = require("../models/chats");
const ChatSettings = require("../models/chatSettingsModel");
const User = require("../models/userModel");
const { Markup } = require("telegraf");
const os = require("os");
const Score = require("../models/scores");
const QuizStats = require("../models/quizStats");
const mongoose = require("mongoose");

// Developer info
bot.command("developer", async (ctx) => {
  try {
    await ctx.replyWithHTML(
      "👩‍💻 <b>Developer Information</b>\n\n" +
        "<blockquote>" +
        "<b>Name:</b> <code>Loukya Sri Kudipudi</code>\n" +
        "<b>Telegram:</b> <a href='https://t.me/LoukyaSri'>@LoukyaSri</a>\n" +
        "<b>Website:</b> <a href='https://loukyasri.netlify.app/'>loukyasri.netlify.app</a>\n" +
        "</blockquote>\n" +
        "🌐 <b>Official Quiz Bots</b>\n" +
        "<blockquote>" +
        "• <a href='https://t.me/LoukyaSriBot'>@LoukyaSriBot</a> — General Studies (EN)\n" +
        "• <a href='https://t.me/APPSCQuizBot'>@APPSCQuizBot</a> — Andhra Pradesh (TE)\n" +
        "• <a href='https://t.me/TGPSCQuizBot'>@TGPSCQuizBot</a> — Telangana (TE)\n" +
        "• <a href='https://t.me/EnglishByLoukyaBot'>@EnglishByLoukyaBot</a> — English Grammar\n" +
        "• <a href='https://t.me/AptitudeByLoukyaBot'>@AptitudeByLoukyaBot</a> — Aptitude & Reasoning" +
        "</blockquote>\n\n" +
        "💡 <i>Want a custom Telegram bot or educational tool?</i>\n" +
        "Reach out directly at <a href='https://t.me/LoukyaSri'>@LoukyaSri</a>\n\n" +
        "💖 <b>Support the Project:</b> You can help maintain the bots and hosting by donating below 👇",
      {
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🌐 Visit Website",
                url: "https://loukyasri.netlify.app/",
              },
            ],
            [
              {
                text: "💝 Donate / Support",
                url: "https://loukyasri.netlify.app/#support",
              },
            ],
            [
              {
                text: "📞 Contact Developer",
                url: "https://t.me/LoukyaSri",
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("Failed to send developer info:", err.message);
  }
});

// Delete user and chat data, including chat settings
bot.command("deletemydata", async (ctx) => {
  if (ctx.chat.type !== "private") {
    try {
      await ctx.deleteMessage();
    } catch (err) {}
    return;
  }
  try {
    const telegramId = ctx.from.id;

    // Delete user data
    const deletedUser = await User.findOneAndDelete({ telegramId });

    // Delete chat data
    const deletedChat = await Chat.findOneAndDelete({ chatId: telegramId });

    // Delete chat settings
    const deletedSettings = await ChatSettings.findOneAndDelete({
      chatId: telegramId,
    });

    if (deletedUser || deletedChat || deletedSettings) {
      await ctx.reply(
        "✅ Your user data, chat data, and chat settings have been deleted successfully."
      );
    } else {
      await ctx.reply("⚠️ No data found for your account.");
    }
  } catch (error) {
    console.error("Error deleting data:", error);
    await ctx.reply("⚠️ Something went wrong while deleting your data.");
  }
});

// Track bot start time
const botStartTime = Date.now();

// Helper: Format uptime nicely
function formatUptime(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const d = Math.floor(hr / 24);

  const days = d > 0 ? `${d}d ` : "";
  const hours = hr % 24 > 0 ? `${hr % 24}h ` : "";
  const mins = min % 60 > 0 ? `${min % 60}m ` : "";
  const secs = sec % 60 > 0 ? `${sec % 60}s` : "";
  return (days + hours + mins + secs).trim();
}

// Function to get current IST date
function getISTDate() {
  const now = new Date();
  const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(istString);
}

async function getStats() {
  // General counts
  const groupsCount = await Chat.countDocuments();
  const usersCount = await User.countDocuments();
  const quizEnabledCount = await Chat.countDocuments({ quizEnabled: true });
  const quizParticipants = await Score.countDocuments();

  // Quiz performance
  const quizStats = await QuizStats.findOne();
  const totalQuizzesSent = quizStats?.total || 0;
  const todayQuizzesSent = quizStats?.today || 0;
  const thisWeekQuizzesSent = quizStats?.thisWeek || 0;
  const thisMonthQuizzesSent = quizStats?.thisMonth || 0;

  // Score performance
  const totalAttemptsAgg = await Score.aggregate([
    {
      $group: {
        _id: null,
        totalAttempted: { $sum: "$totalAttempted" },
        totalCorrect: { $sum: "$totalCorrect" },
      },
    },
  ]);
  const totalAttempted = totalAttemptsAgg[0]?.totalAttempted || 0;
  const totalCorrect = totalAttemptsAgg[0]?.totalCorrect || 0;
  const accuracy =
    totalAttempted > 0 ? ((totalCorrect / totalAttempted) * 100).toFixed(1) : 0;

  return {
    groupsCount,
    usersCount,
    quizEnabledCount,
    quizParticipants,
    totalQuizzesSent,
    todayQuizzesSent,
    thisWeekQuizzesSent,
    thisMonthQuizzesSent,
    totalAttempted,
    totalCorrect,
    accuracy,
  };
}

// /stats command
bot.command("stats", async (ctx) => {
  // const adminId = 7665398753;
  // if (ctx.from.id !== adminId) return ctx.reply("❌ Unauthorized Access");

  const start = Date.now();
  const stats = await getStats();
  const ping = Date.now() - start;

  const memoryUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  const uptime = formatUptime(Date.now() - botStartTime);
  const dbStatus =
    mongoose.connection.readyState === 1 ? "🟢 Connected" : "🔴 Disconnected";

  const nowIST = getISTDate().toLocaleString("en-IN", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const msg =
    `👩‍💻 <b>Bot Performance Report</b>\n\n` +
    `<b>Date & Time</b>: <code>${nowIST}</code>\n\n` +
    `<blockquote>` +
    `👥 <b>Total Users:</b> ${stats.usersCount.toLocaleString()}\n` +
    `👑 <b>Active Groups:</b> ${(
      stats.quizEnabledCount - 1
    ).toLocaleString()}\n` +
    `💬 <b>Quiz Participants:</b> ${stats.quizParticipants.toLocaleString()}\n` +
    `📚 <b>Total Quizzes Sent:</b> ${stats.totalQuizzesSent.toLocaleString()}\n` +
    `   🗓️ <b>Today:</b> ${stats.todayQuizzesSent.toLocaleString()}\n` +
    `   📅 <b>This Week:</b> ${stats.thisWeekQuizzesSent.toLocaleString()}\n` +
    `   📆 <b>This Month:</b> ${stats.thisMonthQuizzesSent.toLocaleString()}\n` +
    `</blockquote>` +
    "\n" +
    `<code>⚡ System is running smoothly and efficiently!</code>`;

  await ctx.reply(msg, { parse_mode: "HTML" });
});

async function sendMyScore(ctx) {
  if (ctx.chat.type !== "private") {
    // Fetch group settings
    const chat = await Chat.findOne({ chatId: ctx.chat.id });

    // If setting not enabled, delete message and exit
    if (!chat?.showMyScoreInGroup) {
      try {
        await ctx.deleteMessage();
      } catch (err) {}
      return;
    }
  }

  try {
    const userId = ctx.from.id;
    const scores = await Score.find({ userId });

    if (!scores.length) {
      return ctx.reply(
        "⚠️ You haven’t answered any quiz yet.\n\n💬 Join any quiz group and start your journey today!",
        { parse_mode: "HTML" }
      );
    }

    // Aggregate totals
    const totals = scores.reduce(
      (acc, s) => {
        acc.totalCorrect += s.totalCorrect || 0;
        acc.totalAttempted += s.totalAttempted || 0;
        acc.totalDailyScore += s.score || 0;
        acc.totalTodayAttempted += s.attempted || 0;
        acc.totalScore += s.totalscore || 0;
        return acc;
      },
      {
        totalCorrect: 0,
        totalAttempted: 0,
        totalDailyScore: 0,
        totalScore: 0,
        totalTodayAttempted: 0,
      }
    );

    const accuracy =
      totals.totalAttempted > 0
        ? ((totals.totalCorrect / totals.totalAttempted) * 100).toFixed(1)
        : 0;
    const todayAccuracy =
      totals.totalTodayAttempted > 0
        ? ((totals.totalDailyScore / totals.totalTodayAttempted) * 100).toFixed(
            1
          )
        : 0;

    const groupsPlayed = scores.length;

    // Options for formatting current time in IST
    const options = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    };

    // Current time in IST
    const now = new Date();
    const nowFormatted = now.toLocaleTimeString("en-US", options);

    // Hardcoded start of quiz day
    const quizStart = "09:00 PM";
    const displayName = scores[0].username || "Anonymous";

    const message = `
<blockquote>
🏆 <b>Your Quiz Performance</b>

👤 <b>User:</b> ${displayName}

📊 <b>Overall Stats</b>
• Groups Participated: <b>${groupsPlayed}</b>
• Questions Attempted: <b>${totals.totalAttempted}</b>
• Correct Answers: <b>${totals.totalCorrect}</b>
• Accuracy: <b>${accuracy}%</b>

📅 <b>Today's Performance</b> \n (Y’day ${quizStart} → Today ${nowFormatted})\n
• Questions Attempted: <b>${totals.totalTodayAttempted}</b>
• Correct Answers: <b>${totals.totalDailyScore}</b>
• Accuracy: <b>${todayAccuracy}%</b>

💡 <i>Keep learning, keep improving!</i>
</blockquote>
`;

    await ctx.reply(message, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🌐 Visit Website",
              url: `https://loukyasri.netlify.app/`,
            },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("❌ Error showing score:", err);
    ctx.reply(
      "⚠️ Couldn't fetch your score right now. Please try again later."
    );
  }
}

bot.command("myscore", sendMyScore);
module.exports = { sendMyScore };

bot.command("resetscore", async (ctx) => {
  try {
    if (ctx.chat.type !== "private") {
      try {
        await ctx.deleteMessage();
      } catch (err) {}
      return;
    }

    await ctx.reply(
      "⚠️ Are you sure you want to reset all your quiz data?\nThis will permanently delete your scores and stats.",
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Yes, Reset My Score",
              "confirm_reset_yes"
            ),
            Markup.button.callback("❌ Cancel", "confirm_reset_no"),
          ],
        ]),
      }
    );
  } catch (err) {
    console.error("❌ Error showing reset confirmation:", err);
    ctx.reply("⚠️ Something went wrong. Please try again later.");
  }
});

// If user confirms reset
bot.action("confirm_reset_yes", async (ctx) => {
  try {
    const userId = ctx.from.id;
    await Score.deleteMany({ userId });
    await ctx.editMessageText(
      "✅ All your quiz data has been successfully reset.\n\nYou can start fresh in any quiz group!",
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("❌ Error resetting score:", err);
    await ctx.editMessageText(
      "⚠️ Failed to reset your score. Try again later."
    );
  }
});

// If user cancels
bot.action("confirm_reset_no", async (ctx) => {
  await ctx.editMessageText("❎ Reset cancelled. Your data is safe!");
});

bot.command("delete", async (ctx) => {
  try {
    const allowedIds = [7665398753];
    if (!allowedIds.includes(ctx.from.id)) {
      return ctx.reply("⚠️ You are not authorized to use this command.");
    }

    const args = ctx.message.text.split(" ").slice(1);
    if (!args.length) {
      return ctx.reply("❌ Please provide a Telegram message link.");
    }

    const link = args[0].trim();

    // Regex patterns
    const publicRegex = /https?:\/\/t\.me\/([\w\d_]+)\/(\d+)/;
    const privateRegex = /https?:\/\/t\.me\/c\/(\d+)\/(\d+)/;

    let chatId, messageId;

    if (publicRegex.test(link)) {
      const [, username, msgId] = link.match(publicRegex);
      chatId = `@${username}`;
      messageId = parseInt(msgId, 10);
    } else if (privateRegex.test(link)) {
      const [, internalId, msgId] = link.match(privateRegex);
      chatId = `-100${internalId}`;
      messageId = parseInt(msgId, 10);
    } else {
      return ctx.reply("⚠️ Invalid Telegram message link format.");
    }

    // Ask for confirmation
    await ctx.reply(
      `⚠️ Confirm deletion of message <code>${messageId}</code> from <code>${chatId}</code>?`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Confirm",
              `confirm_delete:${chatId}:${messageId}`
            ),
            Markup.button.callback("❌ Cancel", `cancel_delete`),
          ],
        ]),
      }
    );
  } catch (err) {
    console.error("❌ Delete command error:", err);
    ctx.reply(
      `❌ Failed to process delete request.\n<code>${
        err.description || err.message
      }</code>`,
      { parse_mode: "HTML" }
    );
  }
});

// Handle confirmation callback
bot.action(/^confirm_delete:(.+):(\d+)$/, async (ctx) => {
  const chatId = ctx.match[1];
  const messageId = parseInt(ctx.match[2], 10);

  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
    await ctx.editMessageText(
      `✅ Message <code>${messageId}</code> deleted from <code>${chatId}</code>.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("❌ Deletion error:", err);
    await ctx.editMessageText(
      `❌ Failed to delete message.\n<code>${
        err.description || err.message
      }</code>`,
      { parse_mode: "HTML" }
    );
  }
});

// Handle cancel button
bot.action("cancel_delete", async (ctx) => {
  await ctx.editMessageText("🚫 Deletion cancelled.");
});

bot.command("leave", async (ctx) => {
  try {
    const allowedIds = [7665398753]; // Only you can use it
    if (!allowedIds.includes(ctx.from.id)) {
      return ctx.reply("⚠️ You are not authorized to use this command.");
    }

    const args = ctx.message.text.split(" ").slice(1);
    if (!args.length) {
      return ctx.reply(
        "❌ Please provide a chat ID.\nExample: /leave -1002632307699"
      );
    }

    const chatId = args[0].trim();

    // Ask for confirmation before leaving
    await ctx.reply(
      `⚠️ Confirm that the bot should leave the group <code>${chatId}</code>?`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Confirm", `confirm_leave:${chatId}`),
            Markup.button.callback("❌ Cancel", `cancel_leave`),
          ],
        ]),
      }
    );
  } catch (err) {
    console.error("❌ Leave command error:", err);
    ctx.reply(
      `❌ Failed to process leave request.\n<code>${
        err.description || err.message
      }</code>`,
      { parse_mode: "HTML" }
    );
  }
});

// Handle confirmation callback
bot.action(/^confirm_leave:(.+)$/, async (ctx) => {
  const chatId = ctx.match[1];

  try {
    await ctx.telegram.leaveChat(chatId);
    await ctx.editMessageText(`🚪 Bot left group <code>${chatId}</code>.`, {
      parse_mode: "HTML",
    });
    console.log(`✅ Bot left group ${chatId}`);
  } catch (err) {
    console.error("❌ Leave group error:", err);
    await ctx.editMessageText(
      `❌ Failed to leave group.\n<code>${
        err.description || err.message
      }</code>`,
      { parse_mode: "HTML" }
    );
  }
});

// Handle cancel button
bot.action("cancel_leave", async (ctx) => {
  await ctx.editMessageText("🚫 Leave request cancelled.");
});
