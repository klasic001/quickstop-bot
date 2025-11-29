/**
 QuickStop Cyber Cafe — Fully Updated WasenderAPI Bot
 - CommonJS
 - Persistent tickets & queue
 - Multi-admin notifications
 - Robust message extraction
*/

const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
app.use(express.json());

// CONFIG
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN || "YOUR_API_TOKEN";
const SEND_MESSAGE_URL = "https://wasenderapi.com/api/send-message";

// ADMIN CONFIG
const ADMINS = [
  "2348057703948", // main admin
  "2348166008021"  // secondary admin
].map(n => n.replace(/\D/g, ""));

// DATA FILE
const DATA_FILE = path.join(__dirname, "data.json");

// Initialize data.json if missing
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ nextJobId: 1, queue: [], sessions: {} }, null, 2));
}

// Helper to read/write data
function readData() { return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")); }
function writeData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// Send message via WasenderAPI
const axios = require("axios");
async function sendText(toNumber, text) {
  try {
    const to = ("" + toNumber).replace(/\D/g, "");
    await axios.post(SEND_MESSAGE_URL, { to, text }, { headers: { Authorization: `Bearer ${TOKEN}` } });
    console.log(`Sent message to ${to}`);
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

// Robust text & sender extraction
function extractTextAndFrom(body) {
  let text = "", fromRaw = "";
  if (body?.data?.messages) {
    const m = Array.isArray(body.data.messages) ? body.data.messages[0] : body.data.messages;
    text = m.messageBody || m.body || m.message || "";
    fromRaw = m.remoteJid || m.from || "";
  } else if (body?.messages) {
    const m = Array.isArray(body.messages) ? body.messages[0] : body.messages;
    text = m.body || "";
    fromRaw = m.from || "";
  } else {
    text = body.text || "";
    fromRaw = body.from || "";
  }
  text = (text || "").toString();
  fromRaw = (fromRaw || "").toString().replace(/@s\.whatsapp\.net$/, "");
  return { text, fromRaw };
}

// MENUS
const TESTING_NOTICE = "⚠️ This is QuickStop bot in testing phase.";
const WELCOME_MENU = `👋 Welcome to QuickStop Cyber Cafe!\n${TESTING_NOTICE}\n\nReply with a number:\n1️⃣ New Student Registration\n2️⃣ School Fees Payment\n3️⃣ Online Courses Registration\n4️⃣ JAMB Result & Admission Letter\n5️⃣ Typing, Printing & Photocopy\n6️⃣ Graphic Design\n7️⃣ Web Design\n8️⃣ Speak to an Agent`;
const NEW_STUDENT_MENU = `📘 NEW STUDENT REGISTRATION\nChoose a service:\n1. UNICAL Checker Pin\n2. Acceptance Fee\n3. O'level Verification\n4. Online Screening\n5. Others\n0. Back to Main Menu\n${TESTING_NOTICE}`;
const SERVICE_MESSAGES = {
  schoolFees: `🟦 SCHOOL FEES PAYMENT\nSend your details (Full Name, Matric/Reg Number, School Type, etc.)\nAfter details we will send account info.\n${TESTING_NOTICE}`,
  unicalCheckerPin: `🟦 UNICAL CHECKER PIN\nSend: Full Name, Reg Number, Email, Phone\nPay: KUDA 3002896343 QUICKSTOP CYBER CAFE\n${TESTING_NOTICE}`,
  acceptanceFee: `🟦 ACCEPTANCE FEE\nSend: Full Name, Reg Number, Checker Pin, Email, Phone\nPay: KUDA 3002896343 QUICKSTOP CYBER CAFE\n${TESTING_NOTICE}`,
  olevelVerification: `🟦 O'LEVEL VERIFICATION\nSend: Full Name, Reg Number, Email, Phone, O'Level Result, Department, Faculty\nPay: KUDA 3002896343 QUICKSTOP CYBER CAFE\n${TESTING_NOTICE}`,
  onlineScreening: `🟦 ONLINE SCREENING\nSend: Full Name, Reg Number, Address, DOB, Phone, Email, State of origin, LGA, Hometown, Sponsor info, Emergency Contact\nSend clear photos: Passport, JAMB Admission, O'Level Result, Attestation, Birth Cert, Cert of Origin\nPay: KUDA 3002896343 QUICKSTOP CYBER CAFE\n${TESTING_NOTICE}`,
  otherDocuments: `🟦 OTHER DOCUMENTS\nAttestation ₦1000, Birth Cert ₦4000, Cert of Origin ₦5000\nSend which one + details\nPay: KUDA 3002896343 QUICKSTOP CYBER CAFE\n${TESTING_NOTICE}`,
  onlineCourses: `🟦 ONLINE COURSES REGISTRATION\nSend: Full Name, Matric Number, Courses, Level, Email, Phone Number\n${TESTING_NOTICE}`,
  jambAdmission: `🟦 JAMB RESULT & ADMISSION LETTER\nSend: Full Name, JAMB Number, Matric Number, Email, Phone Number\n${TESTING_NOTICE}`,
  typingPrinting: `🟦 TYPING, PRINTING & PHOTOCOPY\nSend: Full Name, Documents Description, Phone Number\n${TESTING_NOTICE}`,
  graphicDesign: `🟦 GRAPHIC DESIGN\nSend: Full Name, Description of work, Phone Number\n${TESTING_NOTICE}`,
  webDesign: `🟦 WEB DESIGN\nSend: Full Name, Description of project, Phone Number\n${TESTING_NOTICE}`,
};

// QUEUE HELPERS
function createJob(data, number, serviceName) {
  const job = {
    jobId: data.nextJobId++,
    number,
    shortService: serviceName,
    details: { messages: [] },
    createdAt: Date.now(),
    paid: false,
    status: "waiting",
    agent: null
  };
  data.queue.push(job);
  data.sessions[number].currentJobId = job.jobId;
  data.sessions[number].mode = "bot";
  writeData(data);
  return job;
}
function queuePosition(data, jobId) {
  const waiting = data.queue.filter(j => j.status === "waiting");
  waiting.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const pos = waiting.findIndex(j => j.jobId === jobId);
  return pos >= 0 ? pos + 1 : -1;
}

// WEBHOOK
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    const { text, fromRaw } = extractTextAndFrom(body);
    if (!text || !fromRaw) return res.sendStatus(200);
    const from = fromRaw.replace(/\D/g, "");
    const lower = text.trim().toLowerCase();

    const data = readData();
    data.sessions = data.sessions || {};
    if (!data.sessions[from]) data.sessions[from] = { lastMenu: "main", currentJobId: null, mode: "bot" };
    const session = data.sessions[from];

    const isAdmin = ADMINS.includes(from);

    // ---------------- ADMIN COMMANDS ----------------
    if (isAdmin && /^(admin|agent):/i.test(lower)) {
      const parts = text.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();
      const job = data.queue.find(j => j.jobId === jobId);
      if (!job) { await sendText(from, `Ticket ${jobId} not found.`); return res.sendStatus(200); }

      if (cmd === "admin") {
        await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.`);
        await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
      } else if (cmd === "agent") {
        if (payload.toLowerCase() === "done") {
          job.status = "done";
          job.closedAt = Date.now();
          await sendText(job.number, `✅ Your request (Ticket ${jobId}) completed.`);
          await notifyAdmins(`✅ Ticket ${jobId} closed by admin ${from}.`);
          session.mode = "bot"; session.currentJobId = null; session.lastMenu = "main";
          data.sessions[job.number] = session;
          writeData(data);
          return res.sendStatus(200);
        }
        job.details.agentMessages = job.details.agentMessages || [];
        job.details.agentMessages.push({ admin: from, msg: payload, time: Date.now() });
        job.agent = from;
        data.sessions[job.number] = { lastMenu: null, currentJobId: job.jobId, mode: "agent_chat" };
        writeData(data);
        await sendText(job.number, `💬 Message from agent:\n${payload}`);
        await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}`);
        return res.sendStatus(200);
      }
    }

    // ---------------- AGENT CHAT ----------------
    if (session.mode === "agent_chat") {
      const jobId = session.currentJobId;
      await notifyAdmins(`📨 Message from user (Ticket ${jobId}) [${from}]:\n${text}`);
      await sendText(from, `📤 Your message forwarded to our agent(s). (Ticket ${jobId})`);
      return res.sendStatus(200);
    }

    // ---------------- MENU HANDLING ----------------
    if (lower === "hi" || lower === "hello" || lower === "menu") {
      session.lastMenu = "main";
      data.sessions[from] = session;
      writeData(data);
      await sendText(from, WELCOME_MENU);
      return res.sendStatus(200);
    }

    // Top-level main menu
    if (session.lastMenu === "main") {
      let job;
      switch (lower) {
        case "1":
          session.lastMenu = "new_student";
          data.sessions[from] = session;
          writeData(data);
          await sendText(from, NEW_STUDENT_MENU);
          return res.sendStatus(200);
        case "2":
          job = createJob(data, from, "School Fees Payment");
          await sendText(from, `${SERVICE_MESSAGES.schoolFees}\nTicket ID: ${job.jobId}\nQueue Position: ${queuePosition(data, job.jobId)}\nSend your details now. Type *done* when finished.`);
          session.lastMenu = null; session.mode = "bot";
          data.sessions[from] = session;
          writeData(data);
          return res.sendStatus(200);
        case "3":
          job = createJob(data, from, "Online Courses Registration");
          await sendText(from, `${SERVICE_MESSAGES.onlineCourses}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data, job.jobId)}\nSend details now. Type *done* when finished.`);
          session.lastMenu = null; session.mode = "bot"; data.sessions[from] = session; writeData(data);
          return res.sendStatus(200);
        case "4":
          job = createJob(data, from, "JAMB Result & Admission Letter");
          await sendText(from, `${SERVICE_MESSAGES.jambAdmission}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data, job.jobId)}\nSend details now. Type *done* when finished.`);
          session.lastMenu = null; session.mode = "bot"; data.sessions[from] = session; writeData(data);
          return res.sendStatus(200);
        case "5":
          job = createJob(data, from, "Typing/Printing/Photocopy");
          await sendText(from, `${SERVICE_MESSAGES.typingPrinting}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data, job.jobId)}\nSend details now. Type *done* when finished.`);
          session.lastMenu = null; session.mode = "bot"; data.sessions[from] = session; writeData(data);
          return res.sendStatus(200);
        case "6":
          job = createJob(data, from, "Graphic Design");
          await sendText(from, `${SERVICE_MESSAGES.graphicDesign}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data, job.jobId)}\nSend details now. Type *done* when finished.`);
          session.lastMenu = null; session.mode = "bot"; data.sessions[from] = session; writeData(data);
          return res.sendStatus(200);
        case "7":
          job = createJob(data, from, "Web Design");
          await sendText(from, `${SERVICE_MESSAGES.webDesign}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data, job.jobId)}\nSend details now. Type *done* when finished.`);
          session.lastMenu = null; session.mode = "bot"; data.sessions[from] = session; writeData(data);
          return res.sendStatus(200);
        case "8":
          job = createJob(data, from, "Speak to Agent");
          session.lastMenu = null; session.mode = "awaiting_agent"; data.sessions[from] = session; writeData(data);
          await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: ${job.jobId}\nQueue Position: ${queuePosition(data, job.jobId)}\nAn agent will connect soon.\n${TESTING_NOTICE}`);
          await notifyAdmins(`📥 New agent request. Ticket ${job.jobId} from ${from}`);
          return res.sendStatus(200);
        default:
          await sendText(from, `Invalid main menu option. Press 0 or type *menu*.\n${TESTING_NOTICE}`);
          return res.sendStatus(200);
      }
    }

    // ---------------- COLLECTING DETAILS ----------------
    if (session.currentJobId && session.mode === "bot") {
      const job = data.queue.find(j => j.jobId === session.currentJobId);
      if (!job) return res.sendStatus(200);
      if (lower === "done") {
        session.currentJobId = null; session.mode = "bot"; data.sessions[from] = session; writeData(data);
        await sendText(from, `✅ All details saved for Ticket ${job.jobId}. Admin will provide your fee shortly.`);
        const collected = (job.details.messages || []).map(m => m.msg).join("\n");
        await notifyAdmins(`📝 User details for Ticket ${job.jobId} from ${from}\nService: ${job.shortService}\nDetails:\n${collected}\nReply with admin:${job.jobId}:<amount> or agent:${job.jobId}:<message>`);
        return res.sendStatus(200);
      }
      job.details.messages.push({ msg: text, time: Date.now() });
      writeData(data);
      await sendText(from, `📌 Details received for Ticket ${job.jobId}. Send more or type *done* when finished.`);
      return res.sendStatus(200);
    }

    // Fallback
    await sendText(from, `Sorry, I didn't understand. Type *menu* or 0 for main menu.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);

  } catch (err) {
    console.error("Unhandled webhook error:", err);
    return res.sendStatus(200);
  }
});

// ROOT
app.get("/", (req, res) => res.send("QuickStop Cyber WasenderAPI Bot running."));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
