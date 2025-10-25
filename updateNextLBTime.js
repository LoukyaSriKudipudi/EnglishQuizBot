const bot = require("./utils/telegramBot");
const Chat = require("./models/chats");
const connectDB = require("./utils/db");

// -------------------- Generate Random Time (8:30–9:30 PM IST) --------------------
function getRandomLeaderboardTimeIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
  const nowIST = new Date(now.getTime() + istOffset);

  // Random minute between 0–59 → covers 8:30–9:29 PM
  const randomMinutes = Math.floor(Math.random() * 60);
  const baseHour = 20; // start from 8 PM
  const baseMinute = 30 + randomMinutes;

  const timeIST = new Date(nowIST);
  timeIST.setHours(
    baseHour + Math.floor(baseMinute / 60),
    baseMinute % 60,
    0,
    0
  );

  // If the time has already passed today → schedule for tomorrow
  if (timeIST < nowIST) timeIST.setDate(timeIST.getDate() + 1);

  // Convert back to UTC for storing in MongoDB
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
