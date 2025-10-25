const Score = require("../models/scores");
const Chat = require("../models/chats");
const quizQuestions = require("../localDB/quizQuestions.json");
const bot = require("../utils/telegramBot");
const cron = require("node-cron");
const eventRecordBot = require("../utils/eventRecordBot");
const { getRandomLeaderboardTimeIST } = require("../utils/saveChat");

let isProcessingScores = false;

// Escape HTML to prevent Telegram parse errors
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Record event to logging bot
async function recordEvent(message) {
  try {
    const groupId = Number(process.env.EVENT_RECORD_GROUP_ID);
    const topicId = Number(process.env.EVENT_RECORD_TOPIC_ID || 0);
    const MAX_LENGTH = 4000;
    const parts = [];
    for (let i = 0; i < message.length; i += MAX_LENGTH) {
      parts.push(message.slice(i, i + MAX_LENGTH));
    }

    for (const [index, part] of parts.entries()) {
      await new Promise((res) => setTimeout(res, 2000));
      await eventRecordBot.telegram.sendMessage(
        groupId,
        parts.length > 1
          ? `📄 Part ${index + 1}/${parts.length}\n\n${escapeHTML(part)}`
          : escapeHTML(part),
        {
          ...(topicId ? { message_thread_id: topicId } : {}),
          parse_mode: "HTML",
        }
      );
    }
  } catch (err) {
    if (err.response?.error_code === 429) {
      const wait = (err.response.parameters?.retry_after || 5) * 1000;
      console.log(`⏳ Rate limited. Waiting ${wait} ms...`);
      await new Promise((res) => setTimeout(res, wait));
      return recordEvent(message);
    }
    console.error("⚠ Failed to record event:", err.message);
  }
}

// Record special error
async function recordSpecialError(message) {
  try {
    const SPECIAL_ERROR_GROUP_ID = Number(
      process.env.EVENT_RECORD_SPECIAL_ERROR_GROUP_ID
    );
    const MAX_LENGTH = 4000;
    const parts = [];
    for (let i = 0; i < message.length; i += MAX_LENGTH) {
      parts.push(message.slice(i, i + MAX_LENGTH));
    }

    for (const [index, part] of parts.entries()) {
      await new Promise((res) => setTimeout(res, 500));
      await eventRecordBot.telegram.sendMessage(
        SPECIAL_ERROR_GROUP_ID,
        parts.length > 1
          ? `📄 Part ${index + 1}/${parts.length}\n\n${escapeHTML(part)}`
          : escapeHTML(part),
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("⚠ Failed to record special error event:", err.message);
  }
}

// Record score for a user
async function recordScore(
  chatId,
  userId,
  username,
  firstName,
  lastName,
  chatTitle,
  isCorrect
) {
  const displayName = username
    ? "@" + escapeHTML(username)
    : [firstName, lastName].filter(Boolean).map(escapeHTML).join(" ") ||
      "Anonymous";

  const updateData = {
    $inc: {
      totalAttempted: 1,
      attempted: 1,
      todayAttempted: 1,
      score: isCorrect ? 1 : 0,
      totalscore: isCorrect ? 1 : 0,
      totalCorrect: isCorrect ? 1 : 0,
      todayscore: isCorrect ? 1 : 0,
    },
    $set: {
      username: displayName,
      firstName: firstName || "",
      lastName: lastName || "",
      chatTitle: chatTitle || "",
    },
  };

  try {
    await Score.findOneAndUpdate({ chatId, userId }, updateData, {
      upsert: true,
      new: true,
    });
  } catch (err) {
    console.error(
      `❌ Failed to record score for ${displayName} in chat ${chatId}:`,
      err.message
    );
    await recordSpecialError(
      `🚨 Failed to record score for ${displayName} in chat ${escapeHTML(
        chatTitle
      )} (ID: ${chatId})\nError: ${escapeHTML(err.stack || err.message)}`
    );
  }
}

// Handle poll answers
bot.on("poll_answer", async (ctx) => {
  try {
    const { poll_id, user, option_ids } = ctx.update.poll_answer;
    const chat = await Chat.findOne({ lastQuizPollId: poll_id });
    if (!chat) return;

    const quizIndex =
      (chat.quizIndex - 1 + quizQuestions.length) % quizQuestions.length;
    const questionData = quizQuestions[quizIndex];
    if (!questionData) return;

    const isCorrect = option_ids.includes(questionData.correct);
    await recordScore(
      chat.chatId,
      user.id,
      user.username,
      user.first_name,
      user.last_name,
      chat.chatTitle,
      isCorrect
    );
  } catch (err) {
    console.error("❌ Error handling poll answer:", err);
    await recordSpecialError(
      `🚨 Poll answer handling error: ${escapeHTML(err.stack || err.message)}`
    );
  }
});

// Cron: Check every minute for chats ready to send leaderboard
cron.schedule(
  "* 16-19 * * *",
  async () => {
    if (isProcessingScores) return;
    isProcessingScores = true;

    try {
      const now = new Date();
      const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

      const chats = await Chat.find({
        quizEnabled: true,
        sendLeaderboard: true,
        leaderboardSentToday: false,
        nextLeaderboardTime: { $lte: now },
        createdAt: { $lte: eightHoursAgo },
      });

      for (const chat of chats) {
        try {
          const topScores = await Score.find({
            chatId: chat.chatId,
            score: { $gte: 3 },
          })
            .sort({ score: -1 })
            .limit(10);

          const safeChatTitle = escapeHTML(chat.chatTitle);

          let message =
            "<blockquote>" +
            "🏅 <b>Today's Top English Quiz Participants</b> 🏅\n\n" +
            "💬 <b>Group:</b> <code>" +
            safeChatTitle +
            "</code>\n\n" +
            (topScores.length
              ? topScores
                  .map(
                    (user, idx) =>
                      `${idx + 1}. <b>${escapeHTML(
                        user.username || "Anonymous"
                      )}</b>`
                  )
                  .join("\n") +
                "\n\n📊 <i>Check your full stats in bot using the myscore command.</i>"
              : "⚠️ <i>No participants today!</i>") +
            "</blockquote>" +
            "\n" +
            "<blockquote>" +
            "⚡<i>Learn, Compete, and Excel in English Grammar Quizzes</i>" +
            "</blockquote>";

          let sent = false;
          while (!sent) {
            try {
              await bot.telegram.sendMessage(chat.chatId, message, {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              });
              sent = true;

              await recordEvent(
                `🏆 Leaderboard sent to group "${safeChatTitle}" (ID: ${chat.chatId})\n` +
                  `Top participants:\n` +
                  (topScores.length
                    ? topScores
                        .map(
                          (user, idx) =>
                            `${idx + 1}. ${escapeHTML(
                              user.username || "Anonymous"
                            )} — ${user.score} pts`
                        )
                        .join("\n")
                    : "⚠️ No participants today")
              );
            } catch (err) {
              if (err.response?.error_code === 429) {
                const wait = (err.response.parameters?.retry_after || 5) * 1000;
                console.log(
                  `⏳ Rate limited for ${chat.chatTitle}, waiting ${
                    wait / 1000
                  }s`
                );
                await new Promise((res) => setTimeout(res, wait));
              } else {
                console.error(
                  `❌ Error sending leaderboard to ${chat.chatTitle}:`,
                  err.message
                );
                sent = true;
              }
            }
          }

          chat.leaderboardSentToday = true;
          // Set nextLeaderboardTime exactly 24 hours later
          if (chat.nextLeaderboardTime) {
            const nextTime = new Date(
              chat.nextLeaderboardTime.getTime() + 24 * 60 * 60 * 1000
            );
            chat.nextLeaderboardTime = nextTime;
          } else {
            chat.nextLeaderboardTime = getRandomLeaderboardTimeIST();
          }
          await chat.save();

          await Score.updateMany(
            { chatId: chat.chatId },
            { $set: { todayscore: 0, todayAttempted: 0 } }
          );

          await new Promise((res) => setTimeout(res, 2000));
        } catch (err) {
          console.error(
            `❌ Unexpected error for ${chat.chatTitle}:`,
            err.message
          );
          await recordSpecialError(
            `🚨 Leaderboard error for ${escapeHTML(
              chat.chatTitle
            )}: ${escapeHTML(err.stack || err.message)}`
          );
        }
      }
    } catch (err) {
      console.error("❌ Unexpected error in leaderboard cron:", err.message);
      await recordSpecialError(
        `🚨 Leaderboard cron error: ${escapeHTML(err.stack || err.message)}`
      );
    } finally {
      isProcessingScores = false;
    }
  },
  { timezone: "Asia/Kolkata" }
);

// Daily reset cron at midnight
cron.schedule(
  "1 0 * * *",
  async () => {
    try {
      await Chat.updateMany({}, { $set: { leaderboardSentToday: false } });
      await Score.updateMany({}, [
        {
          $set: {
            score: "$todayscore",
            attempted: "$todayAttempted",
            todayscore: 0,
            todayAttempted: 0,
          },
        },
      ]);
    } catch (err) {
      console.error("❌ Failed to reset leaderboard or scores:", err.message);
      await recordSpecialError(
        `🚨 Failed to reset leaderboard or scores: ${escapeHTML(
          err.stack || err.message
        )}`
      );
    }
  },
  { timezone: "Asia/Kolkata" }
);
