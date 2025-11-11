const bot = require("./utils/telegramBot");
const Chat = require("./models/chats");
const connectDB = require("./utils/db");

// -------------------- Generate Random Time (8:30–9:30 PM IST) --------------------
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

// -------------------- Main Function --------------------
async function setAllLeaderboardTimes() {
  await connectDB();
  console.log("✅ Connected to MongoDB");

  // Fetch *all* chats (groups + private)
  const chats = await Chat.find({});
  console.log(`🧩 Found ${chats.length} chats to update`);

  for (const chat of chats) {
    chat.nextLeaderboardTime = getRandomLeaderboardTimeIST();
    await chat.save();

    console.log(
      `✅ Updated ${
        chat.chatTitle || chat.chatId
      } → ${chat.nextLeaderboardTime.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })}`
    );

    // Small delay to avoid overloading DB
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n🎯 All chats updated successfully!");
  process.exit(0);
}

// -------------------- Run --------------------
setAllLeaderboardTimes().catch((err) => {
  console.error("❌ Error updating leaderboard times:", err);
  process.exit(1);
});
