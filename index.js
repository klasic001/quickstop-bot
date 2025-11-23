/**
 QuickStop Cyber — WasenderAPI Node.js bot
 - Menu + UNICAL/UICROSS flows
 - Persistent queue & sessions (data.json)
 - Admin endpoints: view queue, take chat, mark done, verify payment
 - Replace INSTANCE_ID and TOKEN before use
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());

/* ========== CONFIG - EDIT THESE ========== */
const INSTANCE_ID = process.env.INSTANCE_ID || "YOUR_INSTANCE_ID";
const TOKEN = process.env.TOKEN || "YOUR_API_TOKEN";
const ADMIN_KEY = process.env.ADMIN_KEY || "change_this_to_a_secret";
const PORT = process.env.PORT || 3000;
/* ========================================= */

// WasenderAPI base URL (adjust if provider's docs differ)
const BASE_API = `https://api.wasenderapi.com/${INSTANCE_ID}/messages`;

// persistence file
const DATA_FILE = path.join(__dirname, "data.json");

// ensure data file exists
const defaultData = { queue: [], sessions: {}, nextJobId: 1 };
if (!fs.existsSync(DATA_FILE)) fs.writeJsonSync(DATA_FILE, defaultData, { spaces: 2 });

// helpers for persistence
function readData() { return fs.readJsonSync(DATA_FILE); }
function writeData(d) { fs.writeJsonSync(DATA_FILE, d, { spaces: 2 }); }

// send text via WasenderAPI
async function sendText(toNumber, text) {
  try {
    await axios.post(
      `${BASE_API}/sendText`,
      { number: toNumber, message: text },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error("sendText error:", err?.response?.data || err.message);
  }
}

// convenience: format phone id in the way WasenderAPI expects (no plus, e.g. 2348...)
// Ensure incoming "from" values are consistent. Adjust if Wasender returns extra suffixes.
function normalizeNumber(n) {
  // remove non-digits
  return (n || "").replace(/\D/g, "");
}

/* ================= BOT CONTENT ================= */
// Put your menu and messages here
const WELCOME_MENU = `👋 Welcome to QuickStop Cyber!
This service supports 🎓 UNICAL & 🎓 UICROSS students.

How can we help you today?
Reply with a number:

1️⃣ New Student Registration
2️⃣ School Fees Payment
3️⃣ Online Courses Registration
4️⃣ JAMB Result & Admission Letter
5️⃣ Typing, Printing & Photocopy
6️⃣ Graphic Design
7️⃣ Web Design
8️⃣ Speak to an Agent
`;

const NEW_STUDENT_MENU = `📘 NEW STUDENT REGISTRATION (UNICAL & UICROSS)
Choose a service:
1. UNICAL Checker Pin
2. Acceptance Fee
3. O'level Verification
4. Online Screening
5. Others (Attestation, Birth Cert, Cert of Origin)
Reply with the number (e.g. 1).`;

// example detailed message for UNICAL CHECKER PIN:
function msgUnicalCheckerPin() {
  return `🟦 UNICAL CHECKER PIN
Price: ₦3500
This service will be processed by an agent shortly after payment has been confirmed.

Send the following details:
- Full Name
- Reg Number
- Email
- Phone Number

Make Payment To:
KUDA
3002896343
QUICKSTOP CYBER CAFE

⚠️ Ensure all details are correct. QuickStop is not liable for incorrect details.`;
}

/* ================ QUEUE & SESSIONS ================ */
/*
 Data structure:
 data = {
   queue: [ { jobId, number, name, service, createdAt, paid:false, status:"waiting" | "assigned" | "done", agent:null } ],
   sessions: { "<number>": { lastMenu: "...", data: {...} } },
   nextJobId: int
 }
*/

function addToQueue(number, shortService, details = {}) {
  const data = readData();
  const job = {
    jobId: data.nextJobId++,
    number,
    shortService,
    details,
    createdAt: Date.now(),
    paid: false,
    status: "waiting",
    agent: null
  };
  data.queue.push(job);
  writeData(data);
  return job;
}

function queuePosition(jobId) {
  const data = readData();
  const idx = data.queue.findIndex(j => j.jobId === jobId);
  if (idx === -1) return -1;
  // position among waiting jobs ahead of this one (1-based)
  const waiting = data.queue.filter(j => j.status === "waiting");
  const pos = waiting.findIndex(j => j.jobId === jobId);
  return pos >= 0 ? pos + 1 : -1;
}

function popNextWaiting() {
  const data = readData();
  const idx = data.queue.findIndex(j => j.status === "waiting");
  if (idx === -1) return null;
  data.queue[idx].status = "assigned";
  writeData(data);
  return data.queue[idx];
}

/* ================ WEBHOOK - Incoming messages from WasenderAPI ================ */
app.post("/webhook", async (req, res) => {
  // WasenderAPI JSON structure may vary. Here we attempt to extract from common fields.
  const body = req.body || {};
  // Adapt based on the actual payload: message.text or message.body etc.
  const rawMsg = (body.message && (body.message.text || body.message.body)) || body.body || "";
  const fromRaw = (body.message && body.message.from) || body.from || body.sender || "";
  const from = normalizeNumber(fromRaw);
  const text = ("" + rawMsg).trim();

  if (!text || !from) return res.sendStatus(200);

  const lower = text.toLowerCase();

  // Sessions: store last menu context for this number
  const data = readData();
  data.sessions = data.sessions || {};
  if (!data.sessions[from]) data.sessions[from] = { lastMenu: null, collected: {} };

  // Simple menu handling:
  if (/(^hi$|^hello$|^menu$|^start$)/i.test(lower)) {
    data.sessions[from].lastMenu = "main";
    writeData(data);
    await sendText(from, WELCOME_MENU);
    return res.sendStatus(200);
  }

  // If user asked to speak to an agent
  if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
    // add to queue
    const job = addToQueue(from, "Speak to Agent", { requestedAt: Date.now() });
    const pos = queuePosition(job.jobId);
    await sendText(from, `🙋‍♂️ You are now in the queue. Your queue number is *${pos}*. An agent will connect soon.\nIf you paid for a service, send payment details now.`);
    // notify admin (simple: you can set an admin number or let admin check /admin/queue)
    // OPTIONAL: send notification to admin number(s) if desired:
    // await sendText(ADMIN_PHONE, `New queue: job ${job.jobId} from ${from}`);
    return res.sendStatus(200);
  }

  // If user chooses 1 - New Student Registration menu
  if (/^1$/i.test(lower)) {
    data.sessions[from].lastMenu = "new_student";
    writeData(data);
    await sendText(from, NEW_STUDENT_MENU);
    return res.sendStatus(200);
  }

  // Handle sub-options under New Student Registration
  if (data.sessions[from].lastMenu === "new_student") {
    if (/^1$/i.test(lower)) {
      // UNICAL CHECKER PIN selected
      // we will create a queue job for the service so admin can verify payment later
      const job = addToQueue(from, "UNICAL Checker Pin", { price: 3500 });
      const pos = queuePosition(job.jobId);
      await sendText(from, msgUnicalCheckerPin() + `\n\nYour request ID: ${job.jobId}\nQueue position: ${pos}\n\nAfter making payment, reply with "paid ${job.jobId}" and send your payment screenshot.`);
      return res.sendStatus(200);
    }
    if (/^2$/i.test(lower)) {
      // Acceptance fee - create job with placeholder price
      const job = addToQueue(from, "Acceptance Fee", { price: null });
      const pos = queuePosition(job.jobId);
      await sendText(from, `🟦 ACCEPTANCE FEE\n(Price will be confirmed)\nSend: Full Name, Reg Number, Department, Email, Phone\nYour request ID: ${job.jobId}\nQueue position: ${pos}`);
      return res.sendStatus(200);
    }
    if (/^3$/i.test(lower)) {
      const job = addToQueue(from, "O'level Verification", { price: null });
      const pos = queuePosition(job.jobId);
      await sendText(from, `🟦 O'LEVEL VERIFICATION\nSend: Full Name, Reg Number, O'level Result (upload), Phone\nYour request ID: ${job.jobId}\nQueue position: ${pos}`);
      return res.sendStatus(200);
    }
    if (/^4$/i.test(lower)) {
      const job = addToQueue(from, "Online Screening", { price: null });
      const pos = queuePosition(job.jobId);
      await sendText(from, `🟦 ONLINE SCREENING\nSend: Full Name, Reg Number, JAMB Score, Olevel Results, Phone, Email\nYour request ID: ${job.jobId}\nQueue position: ${pos}`);
      return res.sendStatus(200);
    }
    if (/^5$/i.test(lower)) {
      const job = addToQueue(from, "Other Documents", { price: null });
      const pos = queuePosition(job.jobId);
      await sendText(from, `🟦 OTHER DOCUMENTS\nA. Attestation Letter\nB. Birth Certificate\nC. Certificate of Origin\nSend which one you want and your details.\nRequest ID: ${job.jobId}\nQueue position: ${pos}`);
      return res.sendStatus(200);
    }
  }

  // Payment notice: user may reply "paid <jobId>" to indicate they paid
  const paidMatch = lower.match(/^paid\s*(\d+)$/);
  if (paidMatch) {
    const jobId = Number(paidMatch[1]);
    const d = readData();
    const job = d.queue.find(j => j.jobId === jobId && j.number === from);
    if (!job) {
      await sendText(from, `I couldn't find a request with ID ${jobId} for your number. Please check and try again.`);
      return res.sendStatus(200);
    }
    job.paid = true;
    writeData(d);
    await sendText(from, `Thanks — we recorded your payment for request ${jobId}. An agent will verify and process it. You are still number ${queuePosition(jobId)} in the queue.`);
    // notify admin? (optional)
    return res.sendStatus(200);
  }

  // Default fallback
  await sendText(from, `Sorry, I didn't understand that. Type *menu* to return to the main menu or *8* to speak to an agent.`);
  return res.sendStatus(200);
});

/* ================ ADMIN / AGENT ENDPOINTS ================ */
/*
 - /admin/queue?key=ADMIN_KEY            -> view queue
 - /admin/take?key=ADMIN_KEY&job=ID&agent=Name -> assign job to agent (sends notification to customer)
 - /admin/done?key=ADMIN_KEY&job=ID      -> mark as done (notifies customer)
 - /admin/verify_payment?key=ADMIN_KEY&job=ID -> set paid=true and notify customer
*/

function requireAdmin(req, res) {
  const k = (req.query.key || req.headers['x-admin-key'] || "").trim();
  if (!k || k !== ADMIN_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

app.get("/admin/queue", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const d = readData();
  // only return waiting and assigned
  const visible = d.queue.filter(j => j.status === "waiting" || j.status === "assigned");
  res.json({ queue: visible, nextJobId: d.nextJobId });
});

app.post("/admin/take", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const jobId = Number(req.body.job);
  const agent = req.body.agent || "Agent";
  const d = readData();
  const job = d.queue.find(j => j.jobId === jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  job.status = "assigned";
  job.agent = agent;
  writeData(d);
  // notify customer
  await sendText(job.number, `✅ Hi — ${agent} has taken your request (ID ${job.jobId}).\nYou are now connected. How can we help further?`);
  return res.json({ ok: true, job });
});

app.post("/admin/done", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const jobId = Number(req.body.job);
  const d = readData();
  const job = d.queue.find(j => j.jobId === jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  job.status = "done";
  writeData(d);
  await sendText(job.number, `✅ Your request (ID ${job.jobId}) has been completed. Thank you for using QuickStop Cyber.`);
  return res.json({ ok: true, job });
});

app.post("/admin/verify_payment", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const jobId = Number(req.body.job);
  const d = readData();
  const job = d.queue.find(j => j.jobId === jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  job.paid = true;
  writeData(d);
  await sendText(job.number, `✅ Payment for request ${job.jobId} has been verified by our team. We will process your request shortly.`);
  return res.json({ ok: true, job });
});

/* ================ SIMPLE WEB UI FOR AGENTS (OPTIONAL) ================ */
/* Not needed — admin endpoints are enough. You can create a simple HTML page that calls the endpoints with the key. */

app.get("/", (req, res) => {
  res.send("QuickStop Cyber WasenderAPI Bot running.");
});

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
