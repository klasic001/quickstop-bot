/**
 QuickStop Cyber Cafe — WasenderAPI Node.js Bot
 Fully CommonJS, persistent queue & ticket IDs, multi-admin support
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

/* ========== CONFIG ========== */
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN || "YOUR_TOKEN_HERE";

const ADMINS = [
  normalizeNumber(process.env.ADMIN_NUMBER || "2348057703948"),
  normalizeNumber("2348166008021")
];

const DATA_FILE = path.join(__dirname, "data.json");

// Initialize persistent data file
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ queue: [], sessions: {}, nextJobId: 1 }, null, 2));
}

function readData() {
  const raw = fs.readFileSync(DATA_FILE);
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Normalize phone number
function normalizeNumber(n) {
  return ("" + n).replace(/\D/g, "");
}

// Send message via Wasender API
async function sendText(toNumber, text) {
  try {
    const to = normalizeNumber(toNumber);
    await axios.post(
      "https://wasenderapi.com/api/send-message",
      { to, text },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error("sendText error:", err?.response?.data || err.message || err);
  }
}

// Notify all admins
async function notifyAdmins(message) {
  for (const admin of ADMINS) {
    await sendText(admin, message);
  }
}

// Queue helper
function queuePosition(queue, jobId) {
  const waiting = queue.filter(j => j.status === "waiting");
  waiting.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const pos = waiting.findIndex(j => j.jobId === jobId);
  return pos >= 0 ? pos + 1 : -1;
}

// Create new job
function createJob(number, serviceName, data) {
  const store = readData();
  const job = {
    jobId: store.nextJobId++,
    number,
    shortService: serviceName,
    details: { messages: [] },
    createdAt: Date.now(),
    paid: false,
    status: "waiting",
    agent: null
  };
  store.queue.push(job);
  store.sessions[number] = store.sessions[number] || { lastMenu: "main", currentJobId: job.jobId, mode: "bot" };
  writeData(store);
  return job;
}

/* ========== SERVICE MESSAGES ========== */
const TESTING_NOTICE = "⚠️ QuickStop bot in testing phase.";
const WELCOME_MENU = `👋 Welcome to QuickStop Cyber Cafe!
${TESTING_NOTICE}
Reply with a number:
1️⃣ New Student Registration
2️⃣ School Fees Payment
3️⃣ Online Courses Registration
4️⃣ JAMB Result & Admission Letter
5️⃣ Typing, Printing & Photocopy
6️⃣ Graphic Design
7️⃣ Web Design
8️⃣ Speak to an Agent`;

const SERVICE_MESSAGES = {
  schoolFees: `🟦 SCHOOL FEES PAYMENT
Send your details (Name, Matric/Reg Number, Level, School)
Bank Account: 3002896343 (KUDA)
${TESTING_NOTICE}`
};

/* ========== WEBHOOK ========== */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const text = (body?.text || body?.message || "").toString().trim();
    const fromRaw = (body?.from || "").toString();
    const from = normalizeNumber(fromRaw);

    if (!text || !from) return res.sendStatus(200);

    const store = readData();
    store.sessions = store.sessions || {};
    const session = store.sessions[from] || { lastMenu: "main", currentJobId: null, mode: "bot" };

    const isAdmin = ADMINS.includes(from);
    const lower = text.toLowerCase();

    // --- Admin Commands ---
    if (isAdmin && /^(admin|agent):/i.test(lower)) {
      const parts = text.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();
      const job = store.queue.find(j => j.jobId === jobId);
      if (!job) { await sendText(from, `Ticket ${jobId} not found.`); return res.sendStatus(200); }

      if (cmd === "admin") {
        await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.`);
        await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
      } else if (cmd === "agent") {
        if (payload.toLowerCase() === "done") {
          job.status = "done"; job.closedAt = Date.now(); writeData(store);
          await sendText(job.number, `✅ Your request (Ticket ${jobId}) is completed.`);
          await notifyAdmins(`✅ Ticket ${jobId} closed by admin ${from}.`);
          if (store.sessions[job.number]) {
            store.sessions[job.number].mode = "bot";
            store.sessions[job.number].currentJobId = null;
            store.sessions[job.number].lastMenu = "main";
          }
          writeData(store);
          return res.sendStatus(200);
        }
        job.details.agentMessages = job.details.agentMessages || [];
        job.details.agentMessages.push({ admin: from, msg: payload, time: Date.now() });
        if (!job.agent) job.agent = from;
        store.sessions[job.number] = store.sessions[job.number] || { mode: "agent_chat", currentJobId: job.jobId };
        store.sessions[job.number].mode = "agent_chat";
        store.sessions[job.number].currentJobId = job.jobId;
        writeData(store);
        await sendText(job.number, `💬 Message from agent:\n${payload}`);
        await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        return res.sendStatus(200);
      }
    }

    // --- User in agent chat ---
    if (session.mode === "agent_chat") {
      const jobId = session.currentJobId;
      await notifyAdmins(`📨 Message from user (Ticket ${jobId || "N/A"}) [${from}]:\n${text}`);
      await sendText(from, `📤 Your message has been forwarded to our agent(s). (Ticket ${jobId || "N/A"})`);
      return res.sendStatus(200);
    }

    // --- Menu navigation ---
    if (lower === "0" || /^menu$/i.test(lower) || /^main$/i.test(lower)) {
      session.lastMenu = "main"; session.mode = "bot"; store.sessions[from] = session; writeData(store);
      await sendText(from, WELCOME_MENU);
      return res.sendStatus(200);
    }

    // --- Main menu ---
    if (session.lastMenu === "main") {
      if (/^1$/i.test(lower)) {
        session.lastMenu = "new_student"; store.sessions[from] = session; writeData(store);
        await sendText(from, "📘 NEW STUDENT REGISTRATION menu (options 1–5).");
        return res.sendStatus(200);
      }
      if (/^2$/i.test(lower)) {
        const job = createJob(from, "School Fees Payment", {});
        session.lastMenu = null; session.mode = "bot"; store.sessions[from] = session; writeData(store);
        await sendText(from, `${SERVICE_MESSAGES.schoolFees}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(store.queue, job.jobId)}`);
        return res.sendStatus(200);
      }
      if (/^8$/i.test(lower)) {
        const job = createJob(from, "Speak to Agent", {});
        session.lastMenu = null; session.mode = "awaiting_agent"; session.currentJobId = job.jobId; store.sessions[from] = session; writeData(store);
        await notifyAdmins(`📥 New agent request. Ticket ${job.jobId} from ${from}`);
        await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: ${job.jobId}.\nQueue position: ${queuePosition(store.queue, job.jobId)}.`);
        return res.sendStatus(200);
      }
      await sendText(from, `Invalid main menu option. Press 0 for menu.`);
      return res.sendStatus(200);
    }

    // --- Collect details ---
    if (session.currentJobId && session.mode === "bot") {
      const job = store.queue.find(j => j.jobId === session.currentJobId);
      if (!job) { return res.sendStatus(200); }
      if (lower === "done") {
        session.currentJobId = null; session.mode = "bot"; store.sessions[from] = session; writeData(store);
        const collected = (job.details.messages || []).map(m => m.msg).join("\n");
        await notifyAdmins(`📝 User details for Ticket ${job.jobId} from ${from}\nService: ${job.shortService}\nDetails:\n${collected}`);
        await sendText(from, `✅ All details saved for Ticket ${job.jobId}. Admin will provide your fee shortly.`);
        return res.sendStatus(200);
      }
      job.details.messages.push({ msg: text, time: Date.now() });
      store.sessions[from] = session; writeData(store);
      await sendText(from, `📌 Details received for Ticket ${job.jobId}. Send more or type *done* when finished.`);
      return res.sendStatus(200);
    }

    // Fallback
    await sendText(from, `Sorry, I didn't understand. Type *menu* for main menu or 8 to speak to agent.`);
    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

app.get("/", (req, res) => res.send("QuickStop Bot running."));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
