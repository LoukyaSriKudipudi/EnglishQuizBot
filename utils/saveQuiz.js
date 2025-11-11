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

// -------------------- Save Quiz --------------------
async function saveQuiz(
  chatId,
  topicId,
  chatTitle,
  lastQuizMessageId = null,
  chatType = "private",
  extra = {}
) {
  try {
    const existing = await Chat.findOne({ chatId });

    if (existing) {
      existing.topicId = topicId ?? existing.topicId;
      existing.chatTitle = chatTitle ?? existing.chatTitle;

      if (lastQuizMessageId !== null)
        existing.lastQuizMessageId = lastQuizMessageId;

      if (extra.quizIndex !== undefined) existing.quizIndex = extra.quizIndex;
      if (extra.frequency !== undefined)
        existing.quizFrequencyMinutes = extra.frequency;

      existing.nextQuizTime =
        extra.nextQuizTime ??
        existing.nextQuizTime ??
        new Date(Date.now() + 5 * 60 * 1000);

      existing.quizIndex = existing.quizIndex ?? 0;
      existing.quizFrequencyMinutes = existing.quizFrequencyMinutes ?? 60;

      // ✅ Enable group or channel-specific features
      if (["group", "supergroup", "channel"].includes(chatType)) {
        existing.quizEnabled = true;
        existing.canSend = true;

        // ⏰ Fix next quiz time if expired
        if (!existing.nextQuizTime || existing.nextQuizTime < new Date()) {
          existing.nextQuizTime = new Date(Date.now() + 5 * 60 * 1000);
        }

        // 📊 Ensure leaderboard time set correctly
        if (!existing.nextLeaderboardTime) {
          existing.nextLeaderboardTime = getRandomLeaderboardTimeIST(existing);
        }
      }

      await existing.save();
    } else {
      const isGroupOrChannel = ["group", "supergroup", "channel"].includes(
        chatType
      );

      const initialNextQuizTime =
        extra.nextQuizTime ??
        new Date(Date.now() + (extra.frequency ?? 5) * 60 * 1000);

      const chat = new Chat({
        chatId,
        topicId,
        chatTitle,
        lastQuizMessageId,
        quizEnabled: isGroupOrChannel,
        canSend: isGroupOrChannel,
        quizIndex: extra.quizIndex ?? 0,
        nextQuizTime: initialNextQuizTime,
        quizFrequencyMinutes: extra.frequency ?? 60,
        nextLeaderboardTime: isGroupOrChannel
          ? getRandomLeaderboardTimeIST()
          : null,
        quizIndex: Math.floor(Math.random() * 150),
      });

      await chat.save();
    }
  } catch (err) {
    console.error("❌ Error saving quiz chat:", err);
  }
}

// -------------------- Fetch Quiz Chats Batch --------------------
async function getQuizChatsBatch(skip = 0, limit = 100) {
  try {
    return await Chat.find({ quizEnabled: true }).skip(skip).limit(limit);
  } catch (err) {
    console.error("❌ Error fetching quiz chat batch:", err);
    return [];
  }
}

module.exports = { saveQuiz, getQuizChatsBatch, getRandomLeaderboardTimeIST };
