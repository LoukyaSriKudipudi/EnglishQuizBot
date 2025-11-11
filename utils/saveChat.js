const Chat = require("../models/chats");

function getRandomLeaderboardTimeIST(chat = null) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffset);

  let hour, minute;

  if (
    chat &&
    chat.leaderboardHour !== undefined &&
    chat.leaderboardMinute !== undefined &&
    chat.leaderboardHour !== null &&
    chat.leaderboardMinute !== null
  ) {
    hour = chat.leaderboardHour;
    minute = chat.leaderboardMinute;
  } else {
    // ✅ Random time between 16:00 and 19:00 IST
    hour = 16 + Math.floor(Math.random() * 4); // 16, 17, 18, or 19
    minute = Math.floor(Math.random() * 60); // 0–59 minutes
  }

  const timeIST = new Date(nowIST);
  timeIST.setHours(hour, minute, 0, 0);

  // If the chosen time already passed today, schedule it for tomorrow
  if (timeIST < nowIST) timeIST.setDate(timeIST.getDate() + 1);

  // Convert back to UTC before saving
  return new Date(timeIST.getTime() - istOffset);
}

// -------------------- Save Chat --------------------
async function saveChat(
  chatId,
  topicId,
  chatTitle,
  lastFactMessageId = null,
  chatType = "private"
) {
  try {
    const existing = await Chat.findOne({ chatId });

    if (existing) {
      existing.topicId = topicId ?? existing.topicId;
      existing.chatTitle = chatTitle ?? existing.chatTitle;

      if (lastFactMessageId !== null)
        existing.lastFactMessageId = lastFactMessageId;

      // Force enable for groups/channels
      if (["group", "supergroup", "channel"].includes(chatType)) {
        existing.factsEnabled = true;
        existing.canSend = true;

        // Fix next quiz time if missed
        if (!existing.nextQuizTime || existing.nextQuizTime < new Date()) {
          existing.nextQuizTime = new Date(Date.now() + 5 * 60 * 1000);
        }

        // ✅ Set leaderboard time if not already set
        if (!existing.nextLeaderboardTime) {
          existing.nextLeaderboardTime = getRandomLeaderboardTimeIST(existing);
        } else {
          // Extend by 24 hours if it's already past
          if (existing.nextLeaderboardTime < new Date()) {
            existing.nextLeaderboardTime = new Date(
              existing.nextLeaderboardTime.getTime() + 24 * 60 * 60 * 1000
            );
          }
        }
      }

      await existing.save();
    } else {
      const isGroupOrChannel = ["group", "supergroup", "channel"].includes(
        chatType
      );

      const chat = new Chat({
        chatId,
        topicId,
        chatTitle,
        lastFactMessageId,
        factsEnabled: isGroupOrChannel,
        canSend: isGroupOrChannel,
        nextQuizTime: isGroupOrChannel
          ? new Date(Date.now() + 5 * 60 * 1000)
          : null,
        nextLeaderboardTime: isGroupOrChannel
          ? getRandomLeaderboardTimeIST()
          : null,
        quizIndex: Math.floor(Math.random() * 150),
      });

      await chat.save();
    }
  } catch (err) {
    console.error("❌ Error saving chat:", err);
  }
}

// -------------------- Fetch Chats Batch --------------------
async function getChatsBatch(skip = 0, limit = 100) {
  try {
    return await Chat.find({ factsEnabled: true }).skip(skip).limit(limit);
  } catch (err) {
    console.error("❌ Error fetching chat batch:", err);
    return [];
  }
}

module.exports = { saveChat, getChatsBatch, getRandomLeaderboardTimeIST };
