const bot = require("../utils/telegramBot");
const Chat = require("../models/chats");
const { Markup } = require("telegraf");
const isBotAdmin = require("../utils/isBotAdmin");
const { getRandomLeaderboardTimeIST } = require("../utils/saveChat");

const intervalOptions = [
  { label: "1 hr", minutes: 60 },
  { label: "1:30 hr", minutes: 90 },
  { label: "2 hr", minutes: 120 },
  { label: "3 hr", minutes: 180 },
];

// -------------------- Leaderboard time buttons (English Bot: 8 PM to 10 PM) --------------------
function generateLeaderboardTimeButtons() {
  const times = [];
  const hours = [16, 19]; // 8 PM and 9 PM
  hours.forEach((h) => {
    [0, 30].forEach((m) => {
      times.push({ hour: h, minute: m });
    });
  });

  const buttons = times.map((t) => [
    {
      text: `${t.hour.toString().padStart(2, "0")}:${t.minute
        .toString()
        .padStart(2, "0")}`,
      callback_data: `leaderboard_${t.hour}_${t.minute}`,
    },
  ]);

  return buttons;
}

// -------------------- Migration-safe helper --------------------
// -------------------- Migration-safe helper (non-blocking) --------------------
async function getChatMemberSafe(chatId, userId) {
  try {
    return await bot.telegram.getChatMember(chatId, userId);
  } catch (err) {
    // Handle known Telegram errors gracefully
    if (err.response?.error_code === 400) {
      const desc = err.response.description?.toLowerCase() || "";

      // Group upgraded → update chatId in DB
      if (desc.includes("group chat was upgraded to a supergroup chat")) {
        const migrateId = err.response.parameters?.migrate_to_chat_id;
        if (migrateId) {
          console.log(`♻️ Group migrated: ${chatId} → ${migrateId}`);
          await Chat.updateOne({ chatId }, { chatId: migrateId });
          try {
            return await bot.telegram.getChatMember(migrateId, userId);
          } catch (e) {
            console.error("Failed after migration:", e.message);
            return null; // return null, don’t throw
          }
        }
      }

      // Chat not found / deleted
      if (desc.includes("chat not found")) {
        console.log(`🗑 Chat not found: ${chatId}`);
        return null;
      }

      // Bot not in chat or blocked
      if (desc.includes("bot was kicked") || desc.includes("bot was blocked")) {
        console.log(`🚫 Bot cannot access chat: ${chatId}`);
        return null;
      }

      // Chat write forbidden
      if (
        desc.includes("chat_write_forbidden") ||
        desc.includes("not enough rights")
      ) {
        console.log(`⚠️ Bot cannot write in chat: ${chatId}`);
        return null;
      }
    }

    // Unknown errors
    console.error("⚠️ getChatMemberSafe unexpected error:", err.message);
    return null;
  }
}

// -------------------- Admin check --------------------
async function isUserAdmin(ctx) {
  try {
    const chatId = ctx.chat.id;

    // ✅ Anonymous Admin
    if (ctx.from?.username === "GroupAnonymousBot") return true;

    // ✅ Message sent as group/channel
    if (ctx.message?.sender_chat) {
      const sender = ctx.message.sender_chat;
      const chat = await ctx.getChat();
      if (sender.id === chat.id) return true;
    }

    // ✅ Callback query sent by anonymous admin
    if (ctx.callbackQuery?.message?.sender_chat) {
      const sender = ctx.callbackQuery.message.sender_chat;
      const chat = await ctx.getChat();
      if (sender.id === chat.id) return true;
    }

    // ✅ Normal admins
    if (ctx.from) {
      const member = await getChatMemberSafe(chatId, ctx.from.id);
      if (!member) return false; // cannot fetch → treat as non-admin
      if (["creator", "administrator"].includes(member.status)) return true;
    }

    return false;
  } catch (err) {
    console.error("⚠️ Admin check failed:", err.message);
    return false;
  }
}

// -------------------- Settings command --------------------
bot.command("settings", async (ctx) => {
  if (ctx.chat.type === "private")
    return ctx.reply("This command works only in groups!");

  const botIsAdmin = await isBotAdmin(ctx.chat.id);
  if (!botIsAdmin)
    return ctx.reply(
      `⚠️ @EnglishByLoukyaBot isn’t an admin!\n✅ Make me admin to access settings.`
    );

  const userIsAdmin = await isUserAdmin(ctx);
  if (!userIsAdmin)
    return ctx.reply("🚫 Unauthorized. Only group admins can change settings.");

  try {
    const chatId = ctx.chat.id;
    const chat = await Chat.findOne({ chatId });
    if (!chat) return ctx.reply("This chat is not registered for quizzes yet.");

    await ctx.reply("⚙️ Quiz Bot Settings\n\nSelect an option to change:", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Change Quiz Interval ⏱️",
              callback_data: "change_interval",
            },
          ],
          [
            {
              text: `🗑 Delete Old Quizzes: ${
                chat.deleteOldQuizzes ? "✅ Enabled" : "❌ Disabled"
              }`,
              callback_data: "toggle_delete_old",
            },
          ],
          [
            {
              text: `📊 Show /myscore in group: ${
                chat.showMyScoreInGroup ? "✅ Enabled" : "❌ Disabled"
              }`,
              callback_data: "toggle_show_score",
            },
          ],
          [
            {
              text: `👤 Send Anonymous Quizzes: ${
                chat.anonymousQuizzes ? "✅ Enabled" : "❌ Disabled"
              }`,
              callback_data: "toggle_anonymous_quizzes",
            },
          ],
          [
            {
              text: `📈 Daily (Evening) Leaderboard: ${
                chat.sendLeaderboard ? "✅ Enabled" : "❌ Disabled"
              }`,
              callback_data: "toggle_leaderboard",
            },
          ],
          [
            {
              text: "Set Leaderboard Time ⏰",
              callback_data: "set_leaderboard_time",
            },
          ],
        ],
      },
    });
  } catch (err) {
    console.error(err);
    ctx.reply("⚠️ Something went wrong while opening settings.");
  }
});

// -------------------- Callback query --------------------
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;

  const userIsAdmin = await isUserAdmin(ctx);
  if (!userIsAdmin) {
    await ctx.answerCbQuery(
      "🚫 Unauthorized — only admins can change settings.",
      { show_alert: true }
    );
    return;
  }

  try {
    const chat = await Chat.findOne({ chatId });
    if (!chat) return ctx.reply("⚠️ Chat not found in DB.");

    // ---- Quiz interval ----
    if (data === "change_interval") {
      const buttons = intervalOptions.map((opt) => [
        {
          text:
            chat.quizFrequencyMinutes === opt.minutes
              ? `✅ ${opt.label}`
              : opt.label,
          callback_data: `interval_${opt.minutes}`,
        },
      ]);
      await ctx.editMessageText("⏱️ Select quiz interval:", {
        reply_markup: { inline_keyboard: buttons },
      });
    }
    if (data.startsWith("interval_")) {
      const minutes = parseInt(data.split("_")[1], 10);
      chat.quizFrequencyMinutes = minutes;
      chat.factFrequencyMinutes = minutes;
      await chat.save();
      await ctx.editMessageText(
        `✅ Quiz interval updated to ${minutes / 60} hour(s).`
      );
    }

    // ---- Toggle delete old quizzes ----
    if (data === "toggle_delete_old") {
      chat.deleteOldQuizzes = !chat.deleteOldQuizzes;
      await chat.save();
      await ctx.editMessageText(
        `🗑 Delete Old Quizzes is now: ${
          chat.deleteOldQuizzes ? "✅ Enabled" : "❌ Disabled"
        }`
      );
    }

    // ---- Toggle show score ----
    if (data === "toggle_show_score") {
      chat.showMyScoreInGroup = !chat.showMyScoreInGroup;
      await chat.save();
      await ctx.editMessageText(
        `📊 Show /myscore in group is now: ${
          chat.showMyScoreInGroup ? "✅ Enabled" : "❌ Disabled"
        }`
      );
    }

    // ---- Toggle leaderboard ----
    if (data === "toggle_leaderboard") {
      chat.sendLeaderboard = !chat.sendLeaderboard;
      if (chat.sendLeaderboard) chat.anonymousQuizzes = false;
      await chat.save();
      await ctx.editMessageText(
        `📈 Daily Leaderboard is now: ${
          chat.sendLeaderboard ? "✅ Enabled" : "❌ Disabled"
        }`
      );
    }

    // ---- Toggle anonymous quizzes ----
    if (data === "toggle_anonymous_quizzes") {
      chat.anonymousQuizzes = !chat.anonymousQuizzes;
      if (chat.anonymousQuizzes) {
        chat.sendLeaderboard = false;
        chat.showMyScoreInGroup = false;
      } else {
        chat.sendLeaderboard = true;
      }
      await chat.save();
      await ctx.editMessageText(
        `👤 Send Anonymous Quizzes is now: ${
          chat.anonymousQuizzes ? "✅ Enabled" : "❌ Disabled"
        }\n\n${
          chat.anonymousQuizzes
            ? "📊 Leaderboard and /myscore disabled while anonymous quizzes are on."
            : "📊 Leaderboard enabled; /myscore can be toggled manually."
        }`
      );
    }

    // ---- Set leaderboard time ----
    if (data === "set_leaderboard_time") {
      const buttons = generateLeaderboardTimeButtons();
      await ctx.editMessageText("⏰ Select next leaderboard time:", {
        reply_markup: { inline_keyboard: buttons },
      });
    }
    if (data.startsWith("leaderboard_")) {
      const [_, hour, minute] = data.split("_").map(Number);
      chat.leaderboardHour = hour;
      chat.leaderboardMinute = minute;
      chat.nextLeaderboardTime = getRandomLeaderboardTimeIST(chat);
      await chat.save();
      await ctx.editMessageText(
        `✅ Next leaderboard time updated to ${hour
          .toString()
          .padStart(2, "0")}:${minute.toString().padStart(2, "0")} IST`
      );
    }

    await ctx.answerCbQuery();
  } catch (err) {
    console.error(err);
    ctx.reply("⚠️ Failed to update settings.");
  }
});
