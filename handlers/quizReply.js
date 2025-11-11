// handlers/quizReplyHandler.js
// English-only: uses localDB/quizQuestions.json
// Reacts only to replies to the active quiz message (lastQuizMessageId).
// - "don't" => clear lastQuizMessageId and reply randomly "I won't delete this question."
// - "answer" => reply with question + answer (plain text)
// - "explanation" => reply with question + explanation (AI-powered)

const fs = require("fs");
const path = require("path");
const bot = require("../utils/telegramBot"); // telegraf bot instance
const Chat = require("../models/chats"); // mongoose model for chats
const isBotAdmin = require("../utils/isBotAdmin"); // used by ensureAdmin helper below
const { Markup } = require("telegraf");

// Load questions once
const DB_DIR = path.join(__dirname, "..", "localDB");
const QUESTIONS_FILE = path.join(DB_DIR, "quizQuestions.json");

let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, "utf8"));
  if (!Array.isArray(questions)) {
    console.warn(
      "localDB/quizQuestions.json loaded but is not an array — treating as empty."
    );
    questions = [];
  }
} catch (err) {
  console.error("Failed to load localDB/quizQuestions.json:", err);
  questions = [];
}

// Triggers
const DONT_REGEX = /\bdon['`‛’]?t\b/i;
const ANSWER_REGEX =
  /\b(answer|ans|solution|soln|what(?:'|’)?s the answer|what is the answer)\b/i;
const EXPLAIN_REGEX = /\b(explain|explanation|why|how|describe)\b/i;

// Random humorous "don't delete" replies (20)
const DONT_RESPONSES = [
  "Alright, alright — I’ll behave! This question stays. 😇",
  "No worries! I’ve glued this question to the chat. 🧲",
  "Okay boss, not deleting it. Cross my circuits. 🤖✋",
  "Copy that — the question is now in witness protection. 🕶️",
  "Sure thing! I’ll guard it with my digital life. 🛡️",
  "Got it — deletion mode deactivated. But just this once. ⚙️❌",
  "Roger that! The question is safe and sound. 📘",
  "Okay okay… I’ll leave it alone. 😌",
  "Alright, I’ll let it stay. It looks comfy here anyway. 🛋️",
  "Sure! I’ll act like this question doesn’t even exist. 🤫",
  "Keeping it right where it is. Don’t tell anyone. 🤐",
  "Noted — the question survives another day. 🕊️",
  "No delete? Fine. I’ll just stare at it dramatically. 👀",
  "Okay, I’ll keep it safe... but it owes me cookies. 🍪",
  "As you wish! This question is now sacred. 🙏",
  "Okay chief, deletion cancelled. ✅",
  "Alright, I’m locking it in the vault. 🔐",
  "Sure! This one’s officially too precious to delete. 💎",
  "Fine… I’ll let it live. But just this once. 😏",
];

let lastDontReply = null;
function getRandomDontReply() {
  if (DONT_RESPONSES.length === 0)
    return "Alright — I won’t delete this question.";
  let r = DONT_RESPONSES[Math.floor(Math.random() * DONT_RESPONSES.length)];
  if (r === lastDontReply && DONT_RESPONSES.length > 1) {
    const alt =
      DONT_RESPONSES[Math.floor(Math.random() * DONT_RESPONSES.length)];
    r = alt === r ? DONT_RESPONSES[0] : alt;
  }
  lastDontReply = r;
  return r;
}

/* ---------------------------
   Gemini (Google GenAI) helpers
   --------------------------- */

// rotate API keys by hour (from your sample)
function getAPIKey() {
  const time = new Date().getHours();

  if (time >= 9 && time < 11) return process.env.GEMINI_API_KEY1;
  else if (time >= 11 && time < 13) return process.env.GEMINI_API_KEY2;
  else if (time >= 13 && time < 16) return process.env.GEMINI_API_KEY3;
  else if (time >= 16 && time < 19) return process.env.GEMINI_API_KEY4;
  else if (time >= 19 && time < 22) return process.env.GEMINI_API_KEY1;
  else if (time >= 22 || time < 2) return process.env.GEMINI_API_KEY2;
  else if (time >= 2 && time < 5) return process.env.GEMINI_API_KEY3;
  else if (time >= 5 && time < 9) return process.env.GEMINI_API_KEY4;
  else return process.env.GEMINI_API_KEY1;
}

function getAI() {
  const { GoogleGenAI } = require("@google/genai");
  return new GoogleGenAI({ apiKey: getAPIKey() });
}

function splitMessage(text, limit = 3000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + limit));
    start += limit;
  }
  return chunks;
}

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/^\s*\*\s+/gm, "• ") // lists
    .replace(/\*\*(.*?)\*\*/g, "$1") // bold
    .replace(/\*/g, "") // stray stars
    .trim();
}

// ensureAdmin: (copied lightly) AI features are intended for groups and require the bot to be admin
async function ensureAdmin(ctx) {
  if (ctx.chat.type === "private") {
    try {
      await ctx.reply(
        "⚠ AI features work only in groups. Add me to a group to use my AI powers!"
      );
      return false;
    } catch (err) {}
  }

  try {
    const isAdmin = await isBotAdmin(ctx.chat.id);
    if (!isAdmin) {
      try {
        await ctx.reply(
          `I’m not an admin yet, so I don’t have permission to send generated messages. My AI features won’t work in this chat.`
        );
        return false;
      } catch (err) {}
    }
    return true;
  } catch (err) {
    console.log(`⚠ Could not check admin in ${ctx.chat.id}: ${err.message}`);
    return false;
  }
}

/* ---------------------------
   Main handler registration
   --------------------------- */

module.exports = function registerQuizReplyHandler() {
  bot.on("message", async (ctx) => {
    try {
      if (!ctx.message) return;
      if (ctx.from?.is_bot) return;

      // must be a reply
      const replyTo = ctx.message.reply_to_message;
      if (!replyTo) return;

      const chatId = ctx.chat?.id;
      if (!chatId) return;

      const text = (ctx.message.text || ctx.message.caption || "")
        .toString()
        .trim();
      if (!text) return;

      const wantDont = DONT_REGEX.test(text);
      const wantAnswer = ANSWER_REGEX.test(text);
      const wantExplain = EXPLAIN_REGEX.test(text);

      if (!wantDont && !wantAnswer && !wantExplain) return; // nothing to do

      // fetch chat record
      const chat = await Chat.findOne({ chatId });
      if (!chat) return;

      // must be replying to the bot's active quiz message
      if (
        !chat.lastQuizMessageId ||
        replyTo.message_id !== chat.lastQuizMessageId
      ) {
        return; // silent per requirement
      }

      // handle "don't" -> clear tracking first and reply randomly
      if (wantDont) {
        try {
          await Chat.updateOne(
            { chatId },
            { $set: { lastQuizMessageId: null } }
          );
        } catch (e) {
          console.error("Failed to clear lastQuizMessageId:", e);
        }

        const randomReply = getRandomDontReply();
        try {
          await ctx.reply(randomReply, {
            reply_to_message_id: ctx.message.message_id,
          });
        } catch (e) {
          // ignore send errors
        }
        return;
      }

      // handle answer/explanation
      // compute 0-based index from chat.quizIndex (safe defaults)
      let qIndex = 0;
      if (typeof chat.quizIndex === "number")
        qIndex = Math.max(0, chat.quizIndex - 1);
      else if (
        typeof chat.quizIndex === "string" &&
        /^\d+$/.test(chat.quizIndex)
      )
        qIndex = Math.max(0, parseInt(chat.quizIndex, 10) - 1);

      if (!Array.isArray(questions) || questions.length === 0) {
        try {
          await ctx.reply("Question bank is empty.", {
            reply_to_message_id: ctx.message.message_id,
          });
        } catch (e) {}
        return;
      }

      if (qIndex < 0 || qIndex >= questions.length) {
        try {
          await ctx.reply(
            "Couldn't find the current question (index out of range).",
            {
              reply_to_message_id: ctx.message.message_id,
            }
          );
        } catch (e) {}
        return;
      }

      const q = questions[qIndex];
      if (!q) {
        try {
          await ctx.reply("Question missing in DB.", {
            reply_to_message_id: ctx.message.message_id,
          });
        } catch (e) {}
        return;
      }

      // expected shape: { question, options: [...], correct: <index>, explanation }
      let correctIndex = q.correct;
      if (typeof correctIndex !== "number") {
        if (typeof correctIndex === "string" && /^\d+$/.test(correctIndex))
          correctIndex = parseInt(correctIndex, 10);
        else correctIndex = 0;
      }

      // handle possible 1-based correct index
      if (
        Array.isArray(q.options) &&
        correctIndex > 0 &&
        correctIndex >= q.options.length
      ) {
        correctIndex = correctIndex - 1;
      }

      const optionText =
        Array.isArray(q.options) && q.options[correctIndex]
          ? q.options[correctIndex]
          : null;
      const question = q.question ?? null;
      const explanation = q.explanation ?? null;

      // reply target: attach to original quiz message for context
      const replyTarget = replyTo.message_id;

      if (wantAnswer) {
        const resp = optionText
          ? `Question:\n${question}\n\nAnswer:\n${optionText}`
          : "Answer not available for this question.";
        try {
          await ctx.reply(resp, { reply_to_message_id: replyTarget });
        } catch (e) {}
      }

      if (wantExplain) {
        // Use Gemini AI to generate explanation. If AI fails, fall back to local DB explanation.
        // Do NOT clear lastQuizMessageId here (intentional).
        try {
          // Try to ensure AI features are allowed (group/admin). If ensureAdmin fails, we still attempt AI,
          // but ensureAdmin will have already notified the chat in many cases.
          const canUseAI = await ensureAdmin(ctx).catch(() => {});
          if (!canUseAI) return;
          await Chat.updateOne(
            { chatId },
            { $set: { lastQuizMessageId: null } }
          );
          // Build a compact prompt for the question
          let optionsText = "";
          if (Array.isArray(q.options) && q.options.length > 0) {
            optionsText = q.options
              .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
              .join("\n");
          }

          let prompt = `Explain this English Grammar question briefly. Clarify the rule or pattern behind the correct answer and give short examples if useful. Use very simple English.

Question:
${question}

${optionsText ? "Options:\n" + optionsText + "\n\n" : ""}Correct answer: ${
            optionText || "unknown"
          }

Keep the explanation brief (<= 1200 characters).`;

          const ai = getAI();
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents: prompt,
          });

          let data = response?.text || "";
          data = cleanText(data);

          if (!data || data.trim().length === 0) {
            // fallback to local explanation if AI returned empty
            throw new Error("Empty AI response");
          }

          // Send AI response in chunks
          const chunks = splitMessage(data);
          for (const chunk of chunks) {
            try {
              await ctx.reply(`${chunk}`, {
                reply_to_message_id: replyTarget,
                protect_content: true,
                disable_web_page_preview: true,
                parse_mode: "Markdown",
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.url(
                      "🌐 Visit Website",
                      "https://loukyasri.netlify.app/"
                    ),
                  ],
                ]),
              });
            } catch (sendErr) {
              console.error(
                "Failed to send AI explanation chunk:",
                sendErr.message
              );
            }
          }

          // Log AI usage
          try {
            const userId = ctx.from?.id || "unknown";
            const userName = (ctx.from && ctx.from.first_name) || "unknown";
            const fileName = `user_${userId}.txt`;
            const logDir = path.join(__dirname, "..", "localDB", "AI");
            if (!fs.existsSync(logDir))
              fs.mkdirSync(logDir, { recursive: true });
            const filePath = path.join(logDir, fileName);
            fs.appendFileSync(
              filePath,
              `\n=== ${new Date().toISOString()} ===\nChat: ${chatId}\nUser: ${userName} (${userId})\nPrompt: ${prompt}\nAI Response: ${data}\n`
            );
          } catch (logErr) {
            console.error("Failed to log AI response:", logErr);
          }
        } catch (aiErr) {
          console.error(
            "AI explanation failed, falling back to local DB:",
            aiErr
          );
          // Fallback to local explanation if available
          const resp = explanation
            ? `Question:\n${question}\n\nExplanation:\n${explanation}`
            : "Explanation not available for this question.";
          try {
            await ctx.reply(resp, { reply_to_message_id: replyTarget });
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error("quizReplyHandler error:", err);
    }
  });
};
