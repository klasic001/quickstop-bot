/**
 QuickStop Cyber — WasenderAPI Node.js bot
 Fully CommonJS, all services added, detail collection + admin notification
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());

/* ========== CONFIG - EDIT THESE ========== */
const INSTANCE_ID = process.env.INSTANCE_ID || "34742";
const TOKEN = process.env.TOKEN || "1c309d0ee36ceb74c73a60250bdfee602dfea2857de857a6a56d8a29560cdfff";
const ADMIN_KEY = process.env.ADMIN_KEY || "01081711";
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "2348057703948"; // admin WhatsApp number (digits only)
const PORT = process.env.PORT || 3000;
/* ========================================= */

const SEND_MESSAGE_URL = "https://wasenderapi.com/api/send-message";
const DATA_FILE = path.join(__dirname, "data.json");

if (!fs.existsSync(DATA_FILE))
  fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });

function readData() { return fs.readJsonSync(DATA_FILE); }
function writeData(d) { fs.writeJsonSync(DATA_FILE, d, { spaces: 2 }); }

async function sendText(toNumber, text) {
  try {
    const to = ("" + toNumber).replace(/\D/g, "");
    await axios.post(
      SEND_MESSAGE_URL,
      { to: to, text: text },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    console.log(`✅ Message sent to ${to}: ${text}`);
  } catch (err) {
    console.error("sendText error:", err?.response?.data || err.message);
  }
}

function normalizeNumber(n) { return (n || "").toString().replace(/\D/g, ""); }

/* ================= BOT CONTENT ================= */
const TESTING_NOTICE = "⚠️ Note: This is QuickStop bot in testing phase. Our team will assist if anything goes wrong.";

const WELCOME_MENU = `👋 Welcome to QuickStop Cyber Cafe!

This service supports UNICAL & UICROSS students primarily (for now).

${TESTING_NOTICE}

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
Reply with the number (e.g. 1).

${TESTING_NOTICE}
`;

// Service messages
function msgUnicalCheckerPin() { return `🟦 UNICAL CHECKER PIN
Price: ₦3500
Send details: Full Name, Reg Number, Email, Phone Number
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgAcceptanceFee() { return `🟦 ACCEPTANCE FEE
Price: ₦42000
Send details: Full Name, Reg Number, UNICAL Checker Pin, Email, Phone Number
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgOlevelVerification() { return `🟦 O'LEVEL VERIFICATION
Price: ₦10500
Send details: Full Name, Reg Number, Email, Phone Number, O'Level Result, Department, Faculty
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgOnlineScreening() { return `🟦 ONLINE SCREENING
Price: ₦2500
Send details: Full Name, Reg Number, Address, DOB, Phone, Email, State of origin, Local Government, Home town, Sponsor name, Sponsor Address, Sponsor Phone Number, Emergency Contact Name, Emergency Contact Address, Relationship
Send clear photos: Passport, JAMB Admission Letter, O'Level Result, Attestation, Birth Certificate, Certificate of Origin
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgOtherDocuments() { return `🟦 OTHER DOCUMENTS
Options: Attestation Letter (₦1000 each), Birth Certificate (₦4000), Certificate of Origin (₦5000)
Send which one you want + details
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgSchoolFees() { return `🟦 SCHOOL FEES PAYMENT
Please provide:
- Student type (Fresh / Returning / Final)
- School (UNICAL / UICROSS)
- Registration/Matric/JAMB Number

${TESTING_NOTICE}`; }

function msgOnlineCourses() { return `🟦 ONLINE COURSES REGISTRATION
Send: Full Name, Matric Number, Course(s), Level, Email, Phone Number

${TESTING_NOTICE}`; }

function msgJambAdmission() { return `🟦 JAMB RESULT & ADMISSION LETTER
Send: Full Name, JAMB Number, Matric Number, Email, Phone Number

${TESTING_NOTICE}`; }

function msgTypingPrinting() { return `🟦 TYPING, PRINTING & PHOTOCOPY
Send: Full Name, Documents Description, Phone Number

${TESTING_NOTICE}`; }

function msgGraphicDesign() { return `🟦 GRAPHIC DESIGN
Send: Full Name, Description of work, Phone Number

${TESTING_NOTICE}`; }

function msgWebDesign() { return `🟦 WEB DESIGN
Send: Full Name, Description of project, Phone Number

${TESTING_NOTICE}`; }

/* ================ QUEUE & SESSIONS ================ */
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
  const waiting = data.queue.filter(j => j.status === "waiting");
  const pos = waiting.findIndex(j => j.jobId === jobId);
  return pos >= 0 ? pos + 1 : -1;
}

/* ================ WEBHOOK ================= */
app.post("/webhook", async function(req, res) {
  const body = req.body || {};
  console.log("🚀 Incoming payload:", JSON.stringify(body, null, 2));

  const messagesData = body.data && body.data.messages ? body.data.messages : null;
  let text = "";
  let fromRaw = "";
  if (messagesData) {
    text = messagesData.messageBody || "";
    fromRaw = messagesData.remoteJid || "";
    fromRaw = fromRaw.replace(/@s\.whatsapp\.net$/, "");
  }
  const from = normalizeNumber(fromRaw);
  console.log("📨 Parsed:", { from, text });

  if (!text || !from) return res.sendStatus(200);

  const lower = text.trim().toLowerCase();

  // load sessions
  const data = readData();
  data.sessions = data.sessions || {};
  if (!data.sessions[from])
    data.sessions[from] = { lastMenu: null, collected: {}, currentJobId: null, meta: {} };

  const isFromAdmin = (from === normalizeNumber(ADMIN_NUMBER));

  /* ------------------- ADMIN COMMANDS ------------------- */
  if (isFromAdmin) {
    const textTrim = text.trim();
    if (/^(admin|agent):/i.test(textTrim)) {
      const parts = textTrim.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();

      if (!jobId) {
        await sendText(from, "Invalid job ID. Use admin:<jobId>:<amount> or agent:<jobId>:<message>");
        return res.sendStatus(200);
      }

      const d = readData();
      const job = d.queue.find(j => j.jobId === jobId);
      if (!job) {
        await sendText(from, `Job ID ${jobId} not found.`);
        return res.sendStatus(200);
      }

      if (cmd === "admin") {
        const amountText = payload || "Contact support for fee";
        const feeMsg = `🧾 Fee Update for Ticket ${jobId}\nYour school fee for this session is ₦${amountText}.\n\nPlease pay to:\nAccount Name: QuickStop Cyber\nAccount Number: 3002896343\nBank: KUDA\n\nAfter payment, send screenshot and details:\n- Full Name\n- Matric Number\n- Department\n- Level\n${TESTING_NOTICE}`;
        await sendText(job.number, feeMsg);
        await sendText(from, `✅ Sent fee update to ${job.number} for Ticket ${jobId}.`);
        return res.sendStatus(200);
      }

      if (cmd === "agent") {
        if (!payload) {
          await sendText(from, "No message provided. Use agent:<jobId>:<message> or agent:<jobId>:done");
          return res.sendStatus(200);
        }
        if (payload.toLowerCase() === "done" || payload.toLowerCase() === "close") {
          job.status = "done";
          writeData(d);
          await sendText(job.number, `✅ Your request (Ticket ${job.jobId}) has been completed.`);
          await sendText(from, `✅ Ticket ${jobId} closed.`);
          return res.sendStatus(200);
        }
        if (!job.details) job.details = {};
        if (!job.details.agentMessages) job.details.agentMessages = [];
        job.details.agentMessages.push({ fromAdmin: from, msg: payload, time: Date.now() });
        writeData(d);
        await sendText(job.number, `💬 Message from our agent:\n${payload}`);
        await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        return res.sendStatus(200);
      }
    }
    return res.sendStatus(200);
  }

  /* ------------------- USER BOT LOGIC ------------------- */
  // Helper to create job and attach session
  function createJob(userNumber, serviceName, detailsObj = {}) {
    const job = addToQueue(userNumber, serviceName, detailsObj);
    data.sessions[userNumber].currentJobId = job.jobId;
    writeData(data);
    return job;
  }

  // Main menu
  if (/^(hi|hello|menu|start)$/i.test(lower)) {
    data.sessions[from].lastMenu = "main";
    writeData(data);
    await sendText(from, WELCOME_MENU);
    return res.sendStatus(200);
  }

  // Speak to agent
  if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
    const job = createJob(from, "Speak to Agent", { requestedAt: Date.now() });
    const pos = queuePosition(job.jobId);
    await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nQueue number: *${pos}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
    await sendText(ADMIN_NUMBER, `📥 New agent request\nTicket ${job.jobId} from ${from}`);
    return res.sendStatus(200);
  }

  // Top-level menu options
  const serviceMap = {
    "1": { name: "New Student", message: NEW_STUDENT_MENU },
    "2": { name: "School Fees Payment", message: msgSchoolFees() },
    "3": { name: "Online Courses", message: msgOnlineCourses() },
    "4": { name: "JAMB/Admission", message: msgJambAdmission() },
    "5": { name: "Typing/Printing", message: msgTypingPrinting() },
    "6": { name: "Graphic Design", message: msgGraphicDesign() },
    "7": { name: "Web Design", message: msgWebDesign() }
  };

  if (serviceMap[lower]) {
    const service = serviceMap[lower];
    const job = createJob(from, service.name, { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, `${service.message}\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\nSend your details now. Type *done* when finished.`);
    return res.sendStatus(200);
  }

  // New Student submenu
  if (data.sessions[from].lastMenu === "new_student") {
    const newStudentMap = {
      "1": { name: "UNICAL Checker Pin", msg: msgUnicalCheckerPin(), price: 3500 },
      "2": { name: "Acceptance Fee", msg: msgAcceptanceFee(), price: 42000 },
      "3": { name: "O'level Verification", msg: msgOlevelVerification(), price: 10500 },
      "4": { name: "Online Screening", msg: msgOnlineScreening(), price: 2500 },
      "5": { name: "Other Documents", msg: msgOtherDocuments(), price: 0 }
    };
    if (newStudentMap[lower]) {
      const s = newStudentMap[lower];
      const job = createJob(from, s.name, { price: s.price });
      await sendText(from, `${s.msg}\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${queuePosition(job.jobId)}\nSend your details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }
  }

  // User sending details
  if (data.sessions[from].currentJobId) {
    const jobId = data.sessions[from].currentJobId;
    const d = readData();
    const job = d.queue.find(j => j.jobId === jobId);
    if (job) {
      if (!job.details) job.details = {};
      if (!job.details.messages) job.details.messages = [];
      job.details.messages.push({ msg: text, time: Date.now() });
      writeData(d);
      await sendText(from, `📌 Details received for Ticket ${jobId}. Send more or type *done* when finished.`);
      return res.sendStatus(200);
    }
  }

  // User finished sending details
  if (lower === "done") {
    if (data.sessions[from].currentJobId) {
      const jobId = data.sessions[from].currentJobId;
      data.sessions[from].currentJobId = null;
      writeData(data);

      // Notify user
      await sendText(from, `✅ All details saved for Ticket ${jobId}. An agent/admin will review and provide your fee.`);

      // Notify admin with all collected details
      const d = readData();
      const job = d.queue.find(j => j.jobId === jobId);
      if (job) {
        const collectedText = job.details.messages.map(m => m.msg).join("\n");
        await sendText(ADMIN_NUMBER,
          `📝 User finished details for Ticket ${jobId} from ${from}.\nService: ${job.shortService}\nDetails:\n${collectedText}\n\nReply with admin:${jobId}:<amount> to send fee to user.`
        );
      }

      return res.sendStatus(200);
    }
  }

  // Payment notice
  const paidMatch = lower.match(/^paid\s*(\d+)$/);
  if (paidMatch) {
    const jobId = Number(paidMatch[1]);
    const d = readData();
    const job = d.queue.find(j => j.jobId === jobId && j.number === from);
    if (!job) {
      await sendText(from, `Ticket ${jobId} not found.`);
      return res.sendStatus(200);
    }
    job.paid = true;
    writeData(d);
    await sendText(from, `✅ Payment recorded for Ticket ${jobId}. Queue position: ${queuePosition(jobId)}.`);
    await sendText(ADMIN_NUMBER, `💳 Payment reported for Ticket ${jobId} by ${from}.`);
    return res.sendStatus(200);
  }

  // fallback
  await sendText(from, `Sorry, I didn't understand. Type *menu* for main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
  return res.sendStatus(200);
});

/* ================ ADMIN HTTP ENDPOINTS ================ */
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
  const visible = d.queue.filter(j => ["waiting", "assigned"].includes(j.status));
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
  await sendText(job.number, `✅ Hi — ${agent} has taken your request (Ticket ${job.jobId}).`);
  await sendText(ADMIN_NUMBER, `✅ Ticket ${jobId} assigned to ${agent}.`);
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
  await sendText(job.number, `✅ Your request (Ticket ${job.jobId}) has been completed.`);
  await sendText(ADMIN_NUMBER, `✅ Ticket ${jobId} marked done.`);
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
  await sendText(job.number, `✅ Payment for Ticket ${job.jobId} has been verified.`);
  await sendText(ADMIN_NUMBER, `✅ Payment for Ticket ${jobId} verified.`);
  return res.json({ ok: true, job });
});

/* ================ ROOT ================ */
app.get("/", (req, res) => {
  res.send("QuickStop Cyber WasenderAPI Bot running.");
});

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
