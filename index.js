/**
 QuickStop Cyber — WasenderAPI Node.js bot
 Fully CommonJS, all services added, testing mode notice
 - Includes detail collection, ticket/queue system, admin-number commands
 - Replace TOKEN, INSTANCE_ID, ADMIN_NUMBER, ADMIN_KEY as needed
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());

/* ========== CONFIG - EDIT THESE ========== */
// Wasender API token & instance (you can set via env vars on Render)
const INSTANCE_ID = process.env.INSTANCE_ID || "34742"; // optional, not used in sendText here but left for reference
const TOKEN = process.env.TOKEN || "1c309d0ee36ceb74c73a60250bdfee602dfea2857de857a6a56d8a29560cdfff";
const ADMIN_KEY = process.env.ADMIN_KEY || "01081711";
const PORT = process.env.PORT || 3000;

// <-- IMPORTANT: set ADMIN_NUMBER to your personal/admin WhatsApp number (without + or spaces)
// Example: "2348012345678"
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "2348057703948";
/* ========================================= */

// Wasender send-message endpoint (documented path)
const SEND_MESSAGE_URL = "https://wasenderapi.com/api/send-message";

const DATA_FILE = path.join(__dirname, "data.json");

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });

// Persistence helpers
function readData() { return fs.readJsonSync(DATA_FILE); }
function writeData(d) { fs.writeJsonSync(DATA_FILE, d, { spaces: 2 }); }

// send text via WasenderAPI
async function sendText(toNumber, text) {
  try {
    // ensure number is string and clean
    const to = ("" + toNumber).replace(/\D/g, "");
    const resp = await axios.post(
      SEND_MESSAGE_URL,
      { to: to, text: text },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    console.log(`✅ Message sent to ${to}: ${text}`);
    return resp.data;
  } catch (err) {
    console.error("sendText error:", err?.response?.data || err.message);
    return null;
  }
}

// normalize phone number helper
function normalizeNumber(n) {
  return (n || "").toString().replace(/\D/g, "");
}

/* ================= BOT CONTENT ================= */
const TESTING_NOTICE = "⚠️ Note: This is QuickStop bot and it is currently in a testing phase. If something goes wrong, our team will assist you.";

const WELCOME_MENU = `👋 Welcome to QuickStop Cyber Cafe!

This service supports UNICAL & UICROSS students primarily (for now).

${TESTING_NOTICE}

How can we help you today? Reply with a number:

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

// service messages (edit prices / texts here)
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
Send details: Full Name, Reg Number, Email, Phone Number, O'Level Result (clear photo), Department, Faculty
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgOnlineScreening() { return `🟦 ONLINE SCREENING
Price: ₦2500
Send details: Full Name, Reg Number, Address, DOB, Phone, Email, State of origin, Local Government, Home town, Sponsor name, Sponsor Address, Sponsor Phone Number, Emergency Contact Name, Emergency Contact Address, Relationship with Emergency Contact.
Send Clear Photos: Passport, JAMB Admission Letter, O'Level Result, Attestation Letters, Birth Certificate, Certificate of Origin.
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgOtherDocuments() { return `🟦 OTHER DOCUMENTS
Options: Attestation Letter (₦1000 each), Birth Certificate (₦4000), Certificate of Origin (₦5000)
Send which one you want + details
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`; }

function msgSchoolFees() { return `🟦 SCHOOL FEES PAYMENT
Please select your student type: Fresh Student, Returning Student, or Final Year Student.
Which school is this for? UNICAL or UICROSS?
Please enter your Registration, Matric, or JAMB Number so we can check your correct school fee.

${TESTING_NOTICE}`; }

function msgOnlineCourses() { return `🟦 ONLINE COURSES REGISTRATION
Send: Full Name, Matric Number, Course(s), Level, Email, Phone Number
Payment info to be confirmed

${TESTING_NOTICE}`; }

function msgJambAdmission() { return `🟦 JAMB RESULT & ADMISSION LETTER
Send: Full Name, JAMB Number, Matric Number, Email, Phone Number
Payment info to be confirmed

${TESTING_NOTICE}`; }

function msgTypingPrinting() { return `🟦 TYPING, PRINTING & PHOTOCOPY
Send: Full Name, Documents Description, Phone Number
Price varies, pay after quote

${TESTING_NOTICE}`; }

function msgGraphicDesign() { return `🟦 GRAPHIC DESIGN
Send: Full Name, Description of work, Phone Number
Price varies, pay after quote

${TESTING_NOTICE}`; }

function msgWebDesign() { return `🟦 WEB DESIGN
Send: Full Name, Description of project, Phone Number
Price varies, pay after quote

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
    status: "waiting", // waiting | assigned | done
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

/* ================ WEBHOOK - Full CommonJS Version ================= */
app.post("/webhook", async function(req, res) {
  const body = req.body || {};

  // Log full incoming payload for debugging
  console.log("🚀 Incoming payload:");
  console.log(JSON.stringify(body, null, 2));

  // Wasender payload shape: body.data.messages (simple)
  const messagesData = body.data && body.data.messages ? body.data.messages : null;

  let text = "";
  let fromRaw = "";

  if (messagesData) {
    // messageBody contains the plain text in your logs
    text = messagesData.messageBody || "";
    fromRaw = messagesData.remoteJid || "";
    // remove suffix then clean
    fromRaw = (fromRaw || "").replace(/@s\.whatsapp\.net$/, "");
  }

  const from = normalizeNumber(fromRaw); // digits only
  console.log("📨 Parsed:", { from, text });

  if (!text || !from) {
    // nothing to do
    return res.sendStatus(200);
  }

  const lower = ("" + text).trim().toLowerCase();

  // load data and ensure session exists
  const data = readData();
  data.sessions = data.sessions || {};
  if (!data.sessions[from]) data.sessions[from] = { lastMenu: null, collected: {}, currentJobId: null, meta: {} };

  // check if message is from admin number (admin interacts via WhatsApp too)
  const isFromAdmin = (from === normalizeNumber(ADMIN_NUMBER));

  /* -------------------
     ADMIN/AGENT COMMANDS (via WhatsApp from ADMIN_NUMBER)
     Format:
       agent:<jobId>:your message    -> send to customer, or "done" to close
       admin:<jobId>:<amount>        -> send fee message to customer (convention)
  -------------------- */
  if (isFromAdmin) {
    // allow both "agent:" and "admin:" commands
    const textTrim = ("" + text).trim();
    if (/^agent:/i.test(textTrim) || /^admin:/i.test(textTrim)) {
      const parts = textTrim.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();

      if (!jobId) {
        await sendText(from, "Invalid job ID. Use agent:<jobId>:<message>");
        return res.sendStatus(200);
      }

      const d = readData();
      const job = d.queue.find(j => j.jobId === jobId);
      if (!job) {
        await sendText(from, `Job ID ${jobId} not found.`);
        return res.sendStatus(200);
      }

      // If admin: treat payload as fee/amount and send standardized fee message
      if (cmd === "admin") {
        const amountText = payload || "Contact support for fee";
        const feeMsg = `🧾 Fee Update for request ${jobId}\nYour school fee for this session is ₦${amountText}.\n\nPlease make payment to:\nAccount Name: QuickStop Cyber\nAccount Number: 3002896343\nBank: KUDA\n\nAfter payment, send a screenshot and your details:\n- Full Name\n- Matric Number\n- Department\n- Level\n\n${TESTING_NOTICE}`;
        await sendText(job.number, feeMsg);
        await sendText(from, `✅ Sent fee update to ${job.number} for job ${jobId}.`);
        return res.sendStatus(200);
      }

      // If agent:
      if (cmd === "agent") {
        if (!payload) {
          await sendText(from, "No message provided. Use agent:<jobId>:<message> or agent:<jobId>:done");
          return res.sendStatus(200);
        }

        // If 'done', close job
        if (payload.toLowerCase() === "done" || payload.toLowerCase() === "close") {
          job.status = "done";
          writeData(d);
          await sendText(job.number, `✅ Your request (ID ${job.jobId}) has been completed. Thank you for using QuickStop Cyber.`);
          await sendText(from, `✅ Job ${jobId} closed and user notified.`);
          return res.sendStatus(200);
        }

        // Normal agent message -> forward to customer and record in job details
        if (!job.details) job.details = {};
        if (!job.details.agentMessages) job.details.agentMessages = [];
        job.details.agentMessages.push({ fromAdmin: from, msg: payload, time: Date.now() });
        writeData(d);

        await sendText(job.number, `💬 Message from our agent:\n${payload}`);
        await sendText(from, `✅ Message sent to ${job.number} for job ${jobId}.`);
        return res.sendStatus(200);
      }

      // fallback for admin number
      await sendText(from, "Command not recognized. Use agent:<jobId>:<message> or admin:<jobId>:<amount>");
      return res.sendStatus(200);
    }

    // non-command messages from admin number: ignore or inform
    // You might want to forward admin messages to a log or ignore
    return res.sendStatus(200);
  }

  /* -------------------
     USER BOT LOGIC START
  -------------------- */

  // Helper: create job and set session.currentJobId and notify admin
  function createJobAndNotify(userNumber, serviceName, detailsObj) {
    const job = addToQueue(userNumber, serviceName, detailsObj || {});
    // attach to session
    data.sessions[userNumber].currentJobId = job.jobId;
    writeData(data);
    // notify admin number with a short summary
    const notify = `📥 New Request\nTicket ID: ${job.jobId}\nFrom: ${userNumber}\nService: ${serviceName}\nTime: ${new Date(job.createdAt).toLocaleString()}\n\nReply as admin:<${job.jobId}>:<amount> (to send fee) or agent:${job.jobId}:<message>`;
    // best-effort; don't await blocking
    sendText(ADMIN_NUMBER, notify).catch(e => console.error("notify admin error", e));
    return job;
  }

  // Main menu triggers
  if (/^(hi|hello|menu|start)$/i.test(lower)) {
    data.sessions[from].lastMenu = "main";
    writeData(data);
    await sendText(from, WELCOME_MENU);
    return res.sendStatus(200);
  }

  // Speak to Agent (creates ticket and notifies admin)
  if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
    const job = createJobAndNotify(from, "Speak to Agent", { requestedAt: Date.now() });
    const pos = queuePosition(job.jobId);
    await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nYour queue number is *${pos}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);
  }

  // Top-level menu options (these create jobs and enable detail collection)
  if (/^1$/i.test(lower)) {
    data.sessions[from].lastMenu = "new_student";
    writeData(data);
    await sendText(from, NEW_STUDENT_MENU);
    return res.sendStatus(200);
  }

  if (/^2$/i.test(lower)) {
    // School Fees flow: create job and ask initial questions
    const job = createJobAndNotify(from, "School Fees Payment", { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, msgSchoolFees() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\n\nPlease respond with your student type (Fresh / Returning / Final), then the school (UNICAL/UNICROSS), then your Reg/Matric/JAMB number. Send each on a new line or one message.\nWhen done, type *done*.`);
    return res.sendStatus(200);
  }

  if (/^3$/i.test(lower)) {
    const job = createJobAndNotify(from, "Online Courses", { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, msgOnlineCourses() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\n\nPlease send the course details and your matric number. When done type *done*.`);
    return res.sendStatus(200);
  }

  if (/^4$/i.test(lower)) {
    const job = createJobAndNotify(from, "JAMB/Admission", { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, msgJambAdmission() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\n\nSend your details and screenshot if any. When done type *done*.`);
    return res.sendStatus(200);
  }

  if (/^5$/i.test(lower)) {
    const job = createJobAndNotify(from, "Typing/Printing", { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, msgTypingPrinting() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\n\nPlease send the document details. When done type *done*.`);
    return res.sendStatus(200);
  }

  if (/^6$/i.test(lower)) {
    const job = createJobAndNotify(from, "Graphic Design", { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, msgGraphicDesign() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\n\nPlease send the design brief. When done type *done*.`);
    return res.sendStatus(200);
  }

  if (/^7$/i.test(lower)) {
    const job = createJobAndNotify(from, "Web Design", { stage: "init" });
    const pos = queuePosition(job.jobId);
    await sendText(from, msgWebDesign() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${pos}\n\nPlease send project details. When done type *done*.`);
    return res.sendStatus(200);
  }

  // New Student submenu handling
  if (data.sessions[from].lastMenu === "new_student") {
    if (/^1$/i.test(lower)) {
      const job = createJobAndNotify(from, "UNICAL Checker Pin", { price: 3500 });
      await sendText(from, msgUnicalCheckerPin() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${queuePosition(job.jobId)}\n\nAfter payment, reply with "paid ${job.jobId}" and send your screenshot. When ready type *done*.`);
      return res.sendStatus(200);
    }
    if (/^2$/i.test(lower)) {
      const job = createJobAndNotify(from, "Acceptance Fee", { price: 42000 });
      await sendText(from, msgAcceptanceFee() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${queuePosition(job.jobId)}\n\nWhen done type *done*.`);
      return res.sendStatus(200);
    }
    if (/^3$/i.test(lower)) {
      const job = createJobAndNotify(from, "O'level Verification", { price: 10500 });
      await sendText(from, msgOlevelVerification() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${queuePosition(job.jobId)}\n\nWhen done type *done*.`);
      return res.sendStatus(200);
    }
    if (/^4$/i.test(lower)) {
      const job = createJobAndNotify(from, "Online Screening", { price: 2500 });
      await sendText(from, msgOnlineScreening() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${queuePosition(job.jobId)}\n\nWhen done type *done*.`);
      return res.sendStatus(200);
    }
    if (/^5$/i.test(lower)) {
      const job = createJobAndNotify(from, "Other Documents", {});
      await sendText(from, msgOtherDocuments() + `\n\nYour Ticket ID: ${job.jobId}\nQueue position: ${queuePosition(job.jobId)}\n\nWhen done type *done*.`);
      return res.sendStatus(200);
    }
  }

  /* =========================
     DETAIL COLLECTION / DONE
     - If session.currentJobId is set, store incoming messages as details
     - User signals finish with "done"
     ========================= */

  // User finishes sending details
  if (lower === "done") {
    if (data.sessions[from].currentJobId) {
      const jobId = data.sessions[from].currentJobId;
      data.sessions[from].currentJobId = null;
      writeData(data);
      await sendText(from,
        `✅ All details saved for Ticket ID ${jobId}.\nAn agent will review and take over shortly.\n${TESTING_NOTICE}`
      );
      // notify admin that user finished details
      sendText(ADMIN_NUMBER, `📝 User finished details for Ticket ${jobId} (from ${from}).`);
      return res.sendStatus(200);
    }
  }

  // If user currently has an active job collecting details, store the message
  if (data.sessions[from].currentJobId) {
    const jobId = data.sessions[from].currentJobId;
    const d = readData();
    const job = d.queue.find(j => j.jobId === jobId);
    if (job) {
      if (!job.details) job.details = {};
      if (!job.details.messages) job.details.messages = [];
      job.details.messages.push({ msg: text, time: Date.now() });
      writeData(d);

      await sendText(from,
        `📌 Your details have been received and attached to Ticket ID ${jobId}.\n` +
        `Send more information if needed, or type *done* when finished.\n${TESTING_NOTICE}`
      );

      // Optionally notify admin of new detail snippet
      sendText(ADMIN_NUMBER, `✉️ New detail for Ticket ${jobId} from ${from}:\n${text}`);
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
      await sendText(from, `I couldn't find a request with ID ${jobId}. Please check and try again.`);
      return res.sendStatus(200);
    }
    job.paid = true;
    writeData(d);
    await sendText(from, `✅ Payment recorded for Ticket ${jobId}. Queue position: ${queuePosition(jobId)}.\n${TESTING_NOTICE}`);
    // notify admin
    sendText(ADMIN_NUMBER, `💳 Payment reported for Ticket ${jobId} by ${from}. Please verify.`);
    return res.sendStatus(200);
  }

  /* -------------------
     DEFAULT FALLBACK
  -------------------- */
  await sendText(from, `Sorry, I didn't understand. Type *menu* to return to the main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
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
  await sendText(job.number, `✅ Hi — ${agent} has taken your request (Ticket ${job.jobId}). You are now connected. How can we help further?`);
  // notify admin that they took job
  await sendText(ADMIN_NUMBER, `✅ You took Ticket ${jobId} as ${agent}.`);
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
  await sendText(job.number, `✅ Your request (Ticket ${job.jobId}) has been completed. Thank you for using QuickStop Cyber.`);
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
  await sendText(job.number, `✅ Payment for Ticket ${job.jobId} has been verified. We will process your request shortly.`);
  await sendText(ADMIN_NUMBER, `✅ Payment for Ticket ${jobId} verified.`);
  return res.json({ ok: true, job });
});

/* ================ ROOT ================ */
app.get("/", (req, res) => {
  res.send("QuickStop Cyber WasenderAPI Bot running.");
});

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

/* ========== WHERE TO EDIT ==========
- TOKEN / INSTANCE_ID / ADMIN_NUMBER / ADMIN_KEY at top
- Prices and messages in msg*() functions
- Payment account text inside msg* functions and admin 'admin:' handling
- If you want agent auto-assign, modify createJobAndNotify or admin endpoints
===================================== */
