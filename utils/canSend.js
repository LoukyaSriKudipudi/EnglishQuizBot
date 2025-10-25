const bot = require("./telegramBot");
const Chat = require("../models/chats");
const eventRecordBot = require("./eventRecordBot");

async function recordEvent(message) {
  try {
    const groupId = Number(process.env.EVENT_RECORD_GROUP_ID);
    const topicId = Number(process.env.EVENT_RECORD_GROUP_TOPIC_ID);

    await eventRecordBot.telegram.sendMessage(groupId, message, {
      ...(topicId ? { message_thread_id: topicId } : {}),
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("⚠ Failed to send event record:", err.message);
  }
}

async function checkAndUpdateCanSend(chatId = null) {
  try {
    if (chatId) {
      return await updateChatPermissions(chatId);
    } else {
      const lockedChats = await Chat.find({
        quizEnabled: { $in: [null, undefined] },
      });

      for (const chat of lockedChats) {
        const updated = await updateChatPermissions(chat.chatId);
        if (updated) {
          await recordEvent(
            `✅ Permissions updated for ${chat.chatTitle || chat.chatId}`
          );
        }
      }
    }
  } catch (err) {
    console.error("⚠ Error in permission check:", err.message);
    await recordEvent(`⚠ Error in permission check: ${err.message}`);
  }
}

async function updateChatPermissions(chatId) {
  try {
    const botInfo = await bot.telegram.getMe();
    const member = await bot.telegram.getChatMember(chatId, botInfo.id);

    let canSend = false;
    let hasPollPermission = false;

    if (member.status === "administrator" || member.status === "creator") {
      canSend = true;
      hasPollPermission = true;
    } else if (member.status === "member") {
      const chatInfo = await bot.telegram.getChat(chatId);
      const perms = chatInfo.permissions || {};
      hasPollPermission =
        perms.can_send_polls !== false || chatInfo.permissions == null;
      canSend = hasPollPermission;
    }

    const chatDoc = await Chat.findOne({ chatId });
    if (!chatDoc) return false;

    let updated = false;

    if (chatDoc.canSend !== canSend) {
      chatDoc.canSend = canSend;
      updated = true;
    }

    if (chatDoc.quizEnabled == null && hasPollPermission) {
      chatDoc.quizEnabled = true;
      chatDoc.nextQuizTime = new Date(Date.now() + 15 * 60 * 1000);
      updated = true;
    }

    if (updated) {
      await chatDoc.save();
      await recordEvent(
        `✅ Updated chat ${chatDoc.chatTitle || chatId} → canSend=${
          chatDoc.canSend
        }, quizEnabled=${chatDoc.quizEnabled}, nextQuizTime=${
          chatDoc.nextQuizTime
        }`
      );
    }

    return hasPollPermission;
  } catch (err) {
    const msg = `⚠ Failed to update permissions for ${chatId}: ${err.message}`;
    console.log(msg);
    await recordEvent(msg);
    return false;
  }
}

module.exports = checkAndUpdateCanSend;
