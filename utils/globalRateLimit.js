// rateLimiter.js
const bot = require("./telegramBot");
const cron = require("node-cron");

const RATE_LIMIT_MS = 2000;
const COMMAND_LIMIT = 15;
const WINDOW_MS = 60 * 1000;
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000;

// userLastCommandTime keyed by `${chatId}:${userId}` -> timestamp
const userLastCommandTime = {};

// groupHistory: { [chatId]: { [userId]: [timestamps] } }
const groupHistory = {};

// privateHistory: { [userId]: [timestamps] }
const privateHistory = {};

// blocked globally for private abuse: userId -> unblockTs
const blockedUsersGlobal = {};

// blocked by chat: { [chatId]: { [userId]: unblockTs } }
const blockedUsersByChat = {};

// Robust bot / non-user-source detector
function isFromBot(ctx) {
  try {
    if (!ctx) return false;

    // direct sender is a bot account
    if (ctx.from && ctx.from.is_bot) return true;

    // messages posted on behalf of a channel (sender_chat exists)
    if (ctx.update?.message?.sender_chat) return true;

    // message forwarded from a user/bot account
    if (
      ctx.update?.message?.forward_from &&
      ctx.update.message.forward_from.is_bot
    )
      return true;

    // message forwarded from a chat (channel/group)
    if (ctx.update?.message?.forward_from_chat) return true;

    // inline bot usage: via_bot exists when an inline bot was used to post
    if (ctx.update?.message?.via_bot) return true;

    // callback_query initiated by a bot (rare)
    if (
      ctx.update?.callback_query?.from &&
      ctx.update.callback_query.from.is_bot
    )
      return true;

    // inline_query / chosen_inline_result sent by a bot
    if (ctx.update?.inline_query?.from && ctx.update.inline_query.from.is_bot)
      return true;
    if (
      ctx.update?.chosen_inline_result?.from &&
      ctx.update.chosen_inline_result.from.is_bot
    )
      return true;

    return false;
  } catch (err) {
    console.error("Error in isFromBot check:", err);
    return false;
  }
}

// helper: check if user is blocked globally or in this chat
function isBlocked(userId, chatId) {
  const now = Date.now();
  if (!userId) return false;

  // global private block
  if (blockedUsersGlobal[userId] && now < blockedUsersGlobal[userId])
    return true;

  // per-chat block
  if (
    chatId &&
    blockedUsersByChat[chatId] &&
    blockedUsersByChat[chatId][userId] &&
    now < blockedUsersByChat[chatId][userId]
  )
    return true;

  return false;
}

bot.command(/.*/, async (ctx, next) => {
  try {
    const now = Date.now();

    const chat = ctx.chat || ctx.update?.message?.chat;
    const chatType = chat?.type;
    const chatId = chat?.id;
    const chatTitle = chat?.title || "Unknown Group";
    const isGroup = chatType === "group" || chatType === "supergroup";
    const isPrivate = chatType === "private";
    const userId = ctx.from?.id;

    const safeReply = async (message) => {
      try {
        await ctx.reply(message);
      } catch (err) {
        // silent fail to avoid crashing middleware if bot can't reply
        console.error(`⚠️ Failed to send message: ${err.message}`);
      }
    };

    // 1) Ignore bot-originated updates
    if (isFromBot(ctx)) {
      console.log(
        `Ignored command from bot or non-user source in chat ${
          chatId ?? "unknown"
        }`
      );
      return;
    }

    // 2) If we don't know userId or chatId, just continue pipeline (can't rate-limit)
    if (!userId || !chatId) return;

    // 3) If anonymous admin in group (no ctx.from), allow through
    if (isGroup && !ctx.from) {
      console.log(
        `⏭️ Skipping rate limit for anonymous admin in "${chatTitle}" (ID: ${chatId})`
      );
      return next();
    }

    // 4) Respect existing blocks (global or per-chat)
    if (isBlocked(userId, chatId)) {
      console.log(`Ignoring blocked user ${userId} in chat ${chatId}`);
      return;
    }

    // 5) Ensure history buckets exist
    if (isGroup) {
      if (!groupHistory[chatId]) groupHistory[chatId] = {};
      if (!groupHistory[chatId][userId]) groupHistory[chatId][userId] = [];
    } else if (isPrivate) {
      if (!privateHistory[userId]) privateHistory[userId] = [];
    }

    // 6) RATE_LIMIT_MS per user-per-chat spacing
    const lastKey = `${chatId}:${userId}`; // per-chat spacing
    const lastTime = userLastCommandTime[lastKey] || 0;
    const timeDiff = now - lastTime;
    if (timeDiff < RATE_LIMIT_MS) {
      const waitTimeSec = ((RATE_LIMIT_MS - timeDiff) / 1000).toFixed(1);
      await safeReply(
        `⚠ Please wait ${waitTimeSec}s before sending another command`
      );
      return;
    }

    // 7) Sliding window cleanup for the relevant bucket
    if (isGroup) {
      groupHistory[chatId][userId] = groupHistory[chatId][userId].filter(
        (ts) => now - ts < WINDOW_MS
      );
    } else {
      privateHistory[userId] = privateHistory[userId].filter(
        (ts) => now - ts < WINDOW_MS
      );
    }

    // 8) Count commands in window
    const commandCount = isGroup
      ? groupHistory[chatId][userId].length
      : privateHistory[userId].length;

    // 9) If limit exceeded -> block (per-chat for groups, global for private)
    if (commandCount >= COMMAND_LIMIT) {
      const username = ctx.from?.username
        ? `@${ctx.from.username}`
        : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim();

      if (isGroup) {
        await safeReply(
          `🚨 User ${username} is spamming too many commands in ${chatTitle}. Ignoring their commands in this group for 24h.`
        );
        if (!blockedUsersByChat[chatId]) blockedUsersByChat[chatId] = {};
        blockedUsersByChat[chatId][userId] = now + BLOCK_DURATION_MS;
      } else {
        // private chat: global block for this user
        await safeReply(
          `🚨 You have sent too many commands. You will be blocked from using the bot for 24 hours.`
        );
        blockedUsersGlobal[userId] = now + BLOCK_DURATION_MS;
      }

      return;
    }

    // 10) Record this command: timestamp per-chat-user and push into the window array
    userLastCommandTime[lastKey] = now;
    if (isGroup) {
      groupHistory[chatId][userId].push(now);
    } else {
      privateHistory[userId].push(now);
    }

    // 11) proceed to actual command handler
    await next();
  } catch (err) {
    console.error(`❌ Rate Limit Middleware Error: ${err.message}`);
  }
});

// Daily cleanup (runs 00:01 Asia/Kolkata)
cron.schedule(
  "1 0 * * *",
  () => {
    const now = Date.now();

    // Remove expired global blocked users
    for (const uid in blockedUsersGlobal) {
      if (
        Object.prototype.hasOwnProperty.call(blockedUsersGlobal, uid) &&
        now > blockedUsersGlobal[uid]
      ) {
        delete blockedUsersGlobal[uid];
      }
    }

    // Remove expired per-chat blocked users
    for (const chatId in blockedUsersByChat) {
      if (!Object.prototype.hasOwnProperty.call(blockedUsersByChat, chatId))
        continue;
      const map = blockedUsersByChat[chatId];
      for (const uid in map) {
        if (Object.prototype.hasOwnProperty.call(map, uid) && now > map[uid]) {
          delete map[uid];
        }
      }
      if (Object.keys(map).length === 0) delete blockedUsersByChat[chatId];
    }

    // Clean up privateHistory entries older than WINDOW_MS
    for (const uid in privateHistory) {
      if (!Object.prototype.hasOwnProperty.call(privateHistory, uid)) continue;
      privateHistory[uid] = privateHistory[uid].filter(
        (ts) => now - ts < WINDOW_MS
      );
      if (privateHistory[uid].length === 0) delete privateHistory[uid];
    }

    // Clean up groupHistory
    for (const chatId in groupHistory) {
      if (!Object.prototype.hasOwnProperty.call(groupHistory, chatId)) continue;
      const users = groupHistory[chatId];
      for (const uid in users) {
        if (!Object.prototype.hasOwnProperty.call(users, uid)) continue;
        users[uid] = users[uid].filter((ts) => now - ts < WINDOW_MS);
        if (users[uid].length === 0) delete users[uid];
      }
      if (Object.keys(users).length === 0) delete groupHistory[chatId];
    }

    // Optional: prune stale userLastCommandTime keys older than WINDOW_MS (avoid memory growth)
    for (const key in userLastCommandTime) {
      if (!Object.prototype.hasOwnProperty.call(userLastCommandTime, key))
        continue;
      if (now - userLastCommandTime[key] > WINDOW_MS)
        delete userLastCommandTime[key];
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);

/*
Notes:
- This is in-memory. For multi-instance / persistent bots use Redis (recommended).
- If you want to allow specific trusted bots/users, add an allowlist check in isFromBot or before blocking.
- If you prefer the old behavior (bot leaves group instead of blocking the spammer), replace the group block with ctx.leaveChat() logic.
*/
