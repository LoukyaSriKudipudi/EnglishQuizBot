require("dotenv").config();
const bot = require("./utils/telegramBot");
const connectDB = require("./utils/db");
const cron = require("node-cron");

// 1️⃣ Connect to MongoDB
connectDB()
  .then(() => {
    // 2️⃣ Load essential services first (dependencies)
    const newMember = require("./handlers/newMember");
    newMember();
    require("./services/factsService");
    require("./services/forwardService");
    require("./services/pvtFwdService");
    require("./services/sendTo");

    // 3️⃣ Load update/broadcast services AFTER dependencies
    const { broadcastFact } = require("./services/updateService");
    const {
      broadcastQuizQuestion,
    } = require("./services/quizQuestionsService");

    // 4️⃣ Load handlers after DB and essential services are ready
    const start = require("./handlers/start");
    start();

    const setTopic = require("./handlers/setTopic");
    setTopic();
    require("./handlers/developer");
    require("./handlers/shutdown");
    require("./handlers/storeScores");

    // // 5️⃣ Load controllers
    require("./controllers/helpCommand");
    require("./controllers/settings");

    // 6️⃣ Event record bot
    const eventRecordBot = require("./utils/eventRecordBot");

    // 7️⃣ Launch bots
    bot.launch();
    console.log("---bot is running---");

    eventRecordBot.launch();
    console.log("---event record bot is running---");

    // 8️⃣ Start cron jobs AFTER DB, services, and bots are ready
    cron.schedule("* * * * *", broadcastQuizQuestion, {
      timezone: "Asia/Kolkata",
    });

    const checkAndUpdateCanSend = require("./utils/canSend");

    cron.schedule(
      "0 6-21 * * *",
      async () => {
        await checkAndUpdateCanSend();
      },
      { timezone: "Asia/Kolkata" }
    );

    const { runWeeklyAdminCheck } = require("./quizUtils/adminChecker");
    cron.schedule("45 10 * * 6", runWeeklyAdminCheck, {
      timezone: "Asia/Kolkata",
    });

    console.log("Weekly admin check cron scheduled (Sat 5 PM IST).");
    console.log("---All cron jobs scheduled---");
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// (async () => {
//   try {
//     const chatTitle = "Loukya Personal Test Group";
//     const topScores = [
//       { username: "Durga" },
//       { username: "Ananya" },
//       { username: "Hari Krishna" },
//       { username: "Sri Ram" },
//       { username: "4 Idlies Daily" },
//     ];

//     let message =
//       "<blockquote>" +
//       "🏅 <b>Today's Top Quiz Participants</b>\n\n" +
//       "💬 <b>Group:</b> <code>" +
//       chatTitle +
//       "</code>\n\n" +
//       (topScores.length
//         ? topScores
//             .map(
//               (user, idx) =>
//                 `${idx + 1}. <b>${user.username || "Anonymous"}</b>`
//             )
//             .join("\n") +
//           "\n\n📊 <i>Check your full stats in bot using the /myscore command.</i>"
//         : "⚠️ <i>No participants today!</i>") +
//       "</blockquote>" +
//       "\n" +
//       "<blockquote>" +
//       "⚡<i>Your 24/7 Quiz Companion for Telangana Exams</i>" +
//       "</blockquote>";

//     await bot.telegram.sendMessage("-1002549744543", message, {
//       parse_mode: "HTML",
//       disable_web_page_preview: true,
//     });

//     console.log("✅ Message sent to your test group!");
//   } catch (err) {
//     console.error("❌ Failed to send test message:", err.message);
//   }
// })();
