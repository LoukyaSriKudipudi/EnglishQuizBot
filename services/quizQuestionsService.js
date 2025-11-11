const bot = require("../utils/telegramBot");
const path = require("path");
const fs = require("fs");
const eventRecordBot = require("../utils/eventRecordBot");
const Chat = require("../models/chats");
const validateQuiz = require("../utils/quizValidator");
const isBotAdmin = require("../utils/isBotAdmin");
const { updateQuizStats } = require("../quizUtils/updateQuizStats");

const quizQuestionsFile = path.join(
  __dirname,
  "..",
  "localDB",
  "quizQuestions.json"
);
const quizQuestions = JSON.parse(fs.readFileSync(quizQuestionsFile));

function getQuizQuestionForGroup(chat) {
  const index = chat.quizIndex || 0;
  return quizQuestions[index % quizQuestions.length];
}

// Helper: escape Markdown special chars
function escapeMarkdown(text = "") {
  return text.replace(/([*_{}\[\]()#+\-=|.!~>])/g, "\\$1");
}

let isBroadcasting = false;

async function recordEvent(message) {
  try {
    const groupId = Number(process.env.EVENT_RECORD_GROUP_ID);
    const topicId = Number(process.env.EVENT_RECORD_GROUP_TOPIC_ID);

    const MAX_LENGTH = 4000;
    const parts = [];
    for (let i = 0; i < message.length; i += MAX_LENGTH) {
      parts.push(message.slice(i, i + MAX_LENGTH));
    }

    for (const [index, part] of parts.entries()) {
      await new Promise((res) => setTimeout(res, 500));

      await eventRecordBot.telegram.sendMessage(
        groupId,
        parts.length > 1
          ? `📄 Part ${index + 1}/${parts.length}\n\n${escapeMarkdown(part)}`
          : escapeMarkdown(part),
        {
          ...(topicId ? { message_thread_id: topicId } : {}),
          parse_mode: "Markdown",
        }
      );
    }
  } catch (err) {
    if (err.response && err.response.error_code === 429) {
      const retryAfter = err.response.parameters.retry_after * 1000;
      console.log(`⏳ Rate limited. Waiting ${retryAfter} ms before retry...`);
      await new Promise((res) => setTimeout(res, retryAfter));
      return recordEvent(message);
    }
    console.error("⚠ Failed to record event:", err.message);
  }
}

const SPECIAL_ERROR_GROUP_ID = Number(
  process.env.EVENT_RECORD_SPECIAL_ERROR_GROUP_ID
);

async function recordSpecialError(message) {
  try {
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
          ? `📄 Part ${index + 1}/${parts.length}\n\n${escapeMarkdown(part)}`
          : escapeMarkdown(part),
        { parse_mode: "Markdown" }
      );
    }
  } catch (err) {
    console.error("⚠ Failed to record special error event:", err.message);
  }
}

async function broadcastQuizQuestion() {
  if (isBroadcasting) {
    console.log("⏳ Previous broadcast still running. Skipping this run.");
    return;
  }
  isBroadcasting = true;

  try {
    const delayPerMessage = 3000;
    const batchSize = 100;

    const allSuccessChats = [];
    const allFailedChats = [];

    while (true) {
      const chats = await Chat.find({
        quizEnabled: true,
        canSend: true,
        nextQuizTime: { $lte: new Date() },
      }).limit(batchSize);

      if (!chats.length) break;

      const successBatch = [];
      const failedBatch = [];
      const logs = [];

      for (const chat of chats) {
        const { chatId, topicId, chatTitle, lastQuizMessageId } = chat;

        try {
          if (chat.deleteOldQuizzes && lastQuizMessageId) {
            try {
              await bot.telegram.deleteMessage(chatId, lastQuizMessageId);
              logs.push(
                `🗑 Deleted previous quiz in \`${escapeMarkdown(chatTitle)}\``
              );
            } catch (err) {
              logs.push(
                `⚠ Could not delete in \`${escapeMarkdown(
                  chatTitle
                )}\`: ${escapeMarkdown(err.message)}`
              );
            }
          } else if (!chat.deleteOldQuizzes && lastQuizMessageId) {
            logs.push(
              `ℹ️ Kept previous quiz in \`${escapeMarkdown(
                chatTitle
              )}\` (deleteOldQuizzes disabled)`
            );
          }

          if (chat.canSend === false) {
            logs.push(
              `🚫 Skipped \`${escapeMarkdown(
                chatTitle
              )}\`: bot has no send rights (canSend=false)`
            );
            continue;
          }

          const { question, options, correct, explanation } =
            getQuizQuestionForGroup(chat);

          const validationError = validateQuiz({
            question,
            options,
            explanation,
          });
          if (validationError) {
            logs.push(
              `❌ Skipped in \`${escapeMarkdown(chatTitle)}\`: ${escapeMarkdown(
                validationError
              )}`
            );
            failedBatch.push(chatTitle);
            allFailedChats.push(chatTitle);

            chat.quizIndex = (chat.quizIndex + 1) % quizQuestions.length;
            chat.nextQuizTime = new Date(
              Date.now() + (chat.quizFrequencyMinutes || 60) * 60 * 1000
            );
            await chat.save();

            continue;
          }

          const sentQuiz = await bot.telegram.sendQuiz(
            chatId,
            question,
            options,
            {
              correct_option_id: correct,
              explanation,
              is_anonymous: chat.anonymousQuizzes,
              ...(topicId ? { message_thread_id: topicId } : {}),
            }
          );

          await updateQuizStats();
          logs.push(`✅ Sent quiz to \`${escapeMarkdown(chatTitle)}\``);
          successBatch.push(chatTitle);
          allSuccessChats.push(chatTitle);

          chat.lastQuizPollId = sentQuiz.poll.id;
          chat.lastQuizMessageId = sentQuiz.message_id;
          chat.quizIndex = (chat.quizIndex + 1) % quizQuestions.length;
          chat.nextQuizTime = new Date(
            Date.now() + (chat.quizFrequencyMinutes || 60) * 60 * 1000
          );
          await chat.save();
        } catch (err) {
          // --- All original error handlers preserved ---
          if (
            err.response?.error_code === 403 ||
            err.message.includes("bot was kicked")
          ) {
            chat.canSend = false;
            chat.quizEnabled = false;
            chat.nextQuizTime = null;
            await chat.save();
            logs.push(
              `❌ Quiz disabled for \`${escapeMarkdown(
                chatTitle
              )}\`: bot was kicked`
            );
          } else if (
            err.response?.error_code === 400 &&
            (err.description?.includes("not enough rights to send") ||
              err.description?.includes("polls") ||
              (err.description &&
                err.description.toLowerCase().includes("chat_write_forbidden")))
          ) {
            chat.canSend = false;
            chat.quizEnabled = null;
            chat.nextQuizTime = null;
            await chat.save();
            logs.push(
              `❌ Quiz auto disabled for \`${escapeMarkdown(
                chatTitle
              )}\`: group is locked (no send rights)`
            );
          } else if (
            err.response?.error_code === 400 &&
            err.description?.toLowerCase().includes("message thread not found")
          ) {
            chat.topicId = null;
            chat.nextQuizTime = new Date(Date.now() + 5000);
            await chat.save();
            logs.push(
              `⚠ Topic deleted in \`${escapeMarkdown(
                chatTitle
              )}\`, sending future quizzes in main chat`
            );
          } else if (
            err.response?.error_code === 400 &&
            err.description?.includes(
              "group chat was upgraded to a supergroup chat"
            )
          ) {
            try {
              const migrateId = err.response.parameters?.migrate_to_chat_id;

              if (migrateId) {
                // 1️⃣ Disable the old chat record
                chat.quizEnabled = false;
                chat.canSend = false;
                chat.nextQuizTime = null;
                await chat.save();

                // 2️⃣ Create a new document for the migrated chat
                const existingNewChat = await Chat.findOne({
                  chatId: migrateId,
                });

                if (!existingNewChat) {
                  const newChat = new Chat({
                    chatId: migrateId,
                    chatTitle: chat.chatTitle,
                    quizEnabled: true,
                    canSend: true,
                    nextQuizTime: new Date(Date.now() + 5 * 60 * 1000),
                    quizIndex: chat.quizIndex || 0,
                    deleteOldQuizzes: chat.deleteOldQuizzes ?? true,
                    quizFrequencyMinutes: chat.quizFrequencyMinutes ?? 60,
                    nextLeaderboardTime: chat.nextLeaderboardTime,
                  });

                  await newChat.save();
                  logs.push(
                    `♻️ Created new migrated chat record for \`${escapeMarkdown(
                      chat.chatTitle
                    )}\` → new ID: ${migrateId}`
                  );
                } else {
                  logs.push(
                    `⚠️ Migration skipped: new chat already exists for \`${escapeMarkdown(
                      chat.chatTitle
                    )}\``
                  );
                }
              } else {
                logs.push(
                  `⚠️ Migration detected for \`${escapeMarkdown(
                    chat.chatTitle
                  )}\` but no migrate_to_chat_id found`
                );
              }
            } catch (e) {
              logs.push(
                `⚠ Failed to process group upgrade for \`${escapeMarkdown(
                  chat.chatTitle
                )}\`: ${escapeMarkdown(e.message)}`
              );
            }
          } else if (
            err.response?.error_code === 400 &&
            err.description?.toLowerCase().includes("chat not found")
          ) {
            chat.quizEnabled = false;
            chat.canSend = false;
            chat.nextQuizTime = null;
            await chat.save();
            logs.push(
              `🗑 Removed \`${escapeMarkdown(
                chatTitle
              )}\`: chat not found (deleted group?)`
            );
          } else if (
            err.response?.error_code === 403 &&
            err.description
              ?.toLowerCase()
              .includes("bot was blocked by the user")
          ) {
            chat.quizEnabled = false;
            chat.canSend = false;
            chat.nextQuizTime = null;
            await chat.save();
            logs.push(
              `🚷 Disabled \`${escapeMarkdown(
                chatTitle
              )}\`: bot blocked by user`
            );
          } else if (err.response?.error_code === 429) {
            const wait = (err.response.parameters?.retry_after || 5) * 1000;
            logs.push(
              `⏳ Rate limited in \`${escapeMarkdown(chatTitle)}\`, waiting ${
                wait / 1000
              }s`
            );
            await new Promise((res) => setTimeout(res, wait));
            chat.nextQuizTime = new Date(Date.now() + wait);
            await chat.save();
          } else if (
            err.response?.error_code === 504 ||
            err.message.includes("504")
          ) {
            logs.push(`⚠️ 504 Timeout in ${chatTitle}, retrying after 10s`);
            await new Promise((res) => setTimeout(res, 20000));
            chat.nextQuizTime = new Date(Date.now() + 60 * 1000); // retry in 1 min
            await chat.save();
          } else if (
            err.type === "request-timeout" ||
            err.message.includes("network timeout") ||
            err.message.includes("ETIMEDOUT")
          ) {
            logs.push(
              `⚠️ Temporary network issue in ${chatTitle}, retrying next cycle`
            );
            chat.nextQuizTime = new Date(Date.now() + 5 * 60 * 1000); // retry in 5 min
            await chat.save();
          } else if (!logs.some((l) => l.includes(err.message))) {
            logs.push(
              `❌ Unexpected error in \`${escapeMarkdown(
                chatTitle
              )}\`: ${escapeMarkdown(err.message)}`
            );
            chat.quizEnabled = false;
            chat.canSend = false;
            chat.nextQuizTime = null;
            await chat.save();

            const now = new Date().toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour12: false,
            });
            await recordSpecialError(
              `🚨 Unexpected quiz error in \`${escapeMarkdown(
                chatTitle
              )}\` at ${now}\n\n` +
                `Error: ${escapeMarkdown(err.stack || err.message)}\n\n` +
                `Chat details: ID=${chatId}, TopicID=${topicId}\n\n` +
                `📝 Logs before error:\n${logs.map(escapeMarkdown).join("\n")}`
            );
          } else {
            logs.push(
              `❌ Failed in \`${escapeMarkdown(chatTitle)}\`: ${escapeMarkdown(
                err.message
              )}`
            );
          }

          failedBatch.push(chatTitle);
          allFailedChats.push(chatTitle);
        }

        await new Promise((res) => setTimeout(res, delayPerMessage));
      }

      if (successBatch.length > 0 || failedBatch.length > 0) {
        const now = new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour12: false,
        });
        await recordEvent(
          `📦 Finished quiz batch at ${now}\n\n` +
            `• ✅ Success: ${escapeMarkdown(
              successBatch.join(", ") || "None"
            )}\n` +
            `• ❌ Failed: ${escapeMarkdown(
              failedBatch.join(", ") || "None"
            )}\n\n` +
            `📝 Logs:\n${logs.map(escapeMarkdown).join("\n")}`
        );
      }
    }

    if (allSuccessChats.length > 0 || allFailedChats.length > 0) {
      const now = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });
      await recordEvent(
        `✅ Finished broadcasting all quizzes at ${now}\n\n` +
          `• Total chats: ${allSuccessChats.length + allFailedChats.length}\n` +
          `• ✅ Success: ${escapeMarkdown(
            allSuccessChats.join(", ") || "None"
          )}\n` +
          `• ❌ Failed: ${escapeMarkdown(allFailedChats.join(", ") || "None")}`
      );
    }
  } catch (err) {
    console.error("❌ Error during quiz broadcast:", err);
  } finally {
    isBroadcasting = false;
  }
}

module.exports = { broadcastQuizQuestion };
