/**
 QuickStop Cyber — Full WasenderAPI Node.js Bot
 Supports all services, detail collection + admin notification + proper ticket IDs
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
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "2348057703948";
const PORT = process.env.PORT || 3000;
/* ========================================= */

const SEND_MESSAGE_URL = "https://wasenderapi.com/api/send-message";
const DATA_FILE = path.join(__dirname, "data.json");

// Initialize data
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
const TESTING_NOTICE = "⚠️ This is QuickStop bot in testing phase. Our team will assist if anything goes wrong.";

const WELCOME_MENU = `👋 Welcome to QuickStop Cyber Cafe!

This service supports UNICAL & UICROSS students primarily.

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

const NEW_STUDENT_MENU = `📘 NEW STUDENT REGISTRATION
Choose a service:
1. UNICAL Checker Pin
2. Acceptance Fee
3. O'level Verification
4. Online Screening
5. Others (Attestation, Birth Cert, Cert of Origin)
Reply with the number.

${TESTING_NOTICE}`;

const SERVICE_MESSAGES = {
  unicalCheckerPin: `🟦 UNICAL CHECKER PIN
Price: ₦3500
Send: Full Name, Reg Number, Email, Phone Number
Pay: KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`,

  acceptanceFee: `🟦 ACCEPTANCE FEE
Price: ₦42000
Send: Full Name, Reg Number, UNICAL Checker Pin, Email, Phone Number
Pay: KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`,

  olevelVerification: `🟦 O'LEVEL VERIFICATION
Price: ₦10500
Send: Full Name, Reg Number, Email, Phone Number, O'Level Result, Department, Faculty
Pay: KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`,

  onlineScreening: `🟦 ONLINE SCREENING
Price: ₦2500
Send: Full Name, Reg Number, Address, DOB, Phone, Email, State of origin, LGA, Hometown, Sponsor info, Emergency Contact
Send clear photos: Passport, JAMB Admission, O'Level Result, Attestation, Birth Cert, Cert of Origin
Pay: KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`,

  otherDocuments: `🟦 OTHER DOCUMENTS
Attestation ₦1000, Birth Cert ₦4000, Cert of Origin ₦5000
Send which one + details
Pay: KUDA 3002896343 QUICKSTOP CYBER CAFE

${TESTING_NOTICE}`,

  schoolFees: `🟦 SCHOOL FEES PAYMENT
Send: Student type (Fresh/Returning/Final), School (UNICAL/UICROSS), Registration/Matric/JAMB Number

${TESTING_NOTICE}`,

  onlineCourses: `🟦 ONLINE COURSES REGISTRATION
Send: Full Name, Matric Number, Courses, Level, Email, Phone Number

${TESTING_NOTICE}`,

  jambAdmission: `🟦 JAMB RESULT & ADMISSION LETTER
Send: Full Name, JAMB Number, Matric Number, Email, Phone Number

${TESTING_NOTICE}`,

  typingPrinting: `🟦 TYPING, PRINTING & PHOTOCOPY
Send: Full Name, Documents Description, Phone Number

${TESTING_NOTICE}`,

  graphicDesign: `🟦 GRAPHIC DESIGN
Send: Full Name, Description of work, Phone Number

${TESTING_NOTICE}`,

  webDesign: `🟦 WEB DESIGN
Send: Full Name, Description of project, Phone Number

${TESTING_NOTICE}`,
};

/* ================ QUEUE & SESSIONS ================ */
function addToQueue(number, serviceName, details = {}) {
  const data = readData();
  const job = {
    jobId: data.nextJobId++,
    number,
    shortService: serviceName,
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
app.post("/webhook", async (req, res) => {
  const body = req.body || {};
  const messagesData = body.data?.messages || null;
  let text = "";
  let fromRaw = "";
  if (messagesData) {
    text = messagesData.messageBody || "";
    fromRaw = messagesData.remoteJid?.replace(/@s\.whatsapp\.net$/, "") || "";
  }
  const from = normalizeNumber(fromRaw);
  if (!text || !from) return res.sendStatus(200);

  const lower = text.trim().toLowerCase();
  const data = readData();
  data.sessions = data.sessions || {};
  if (!data.sessions[from])
    data.sessions[from] = { lastMenu: null, collected: {}, currentJobId: null };

  const session = data.sessions[from];
  const isFromAdmin = from === normalizeNumber(ADMIN_NUMBER);

  /* ------------------- ADMIN COMMANDS ------------------- */
  if (isFromAdmin) {
    if (/^(admin|agent):/i.test(text)) {
      const parts = text.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();
      const d = readData();
      const job = d.queue.find(j => j.jobId === jobId);
      if (!job) { await sendText(from, `Ticket ${jobId} not found.`); return res.sendStatus(200); }

      if (cmd === "admin") {
        await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.\nPlease pay and send screenshot.`);
        await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
        return res.sendStatus(200);
      }

      if (cmd === "agent") {
        if (payload.toLowerCase() === "done") {
          job.status = "done";
          writeData(d);
          await sendText(job.number, `✅ Your request (Ticket ${jobId}) has been completed.`);
          await sendText(from, `✅ Ticket ${jobId} closed.`);
          return res.sendStatus(200);
        }
        job.details.agentMessages = job.details.agentMessages || [];
        job.details.agentMessages.push({ msg: payload, time: Date.now() });
        writeData(d);
        await sendText(job.number, `💬 Message from agent:\n${payload}`);
        await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        return res.sendStatus(200);
      }
    }
    return res.sendStatus(200);
  }

  /* ------------------- USER BOT LOGIC ------------------- */
  function createJob(serviceName) {
    const freshData = readData();
    const job = {
      jobId: freshData.nextJobId++,
      number: from,
      shortService: serviceName,
      details: { messages: [] },
      createdAt: Date.now(),
      paid: false,
      status: "waiting",
      agent: null
    };
    freshData.queue.push(job);
    freshData.sessions[from] = freshData.sessions[from] || {};
    freshData.sessions[from].currentJobId = job.jobId;
    writeData(freshData);
    return job;
  }

  // MAIN MENU
  if (/^(hi|hello|menu|start)$/i.test(lower)) {
    session.lastMenu = "main";
    data.sessions[from] = session;
    writeData(data);
    await sendText(from, WELCOME_MENU);
    return res.sendStatus(200);
  }

  // SPEAK TO AGENT
  if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
    const job = createJob("Speak to Agent");
    await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nQueue position: *${queuePosition(job.jobId)}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
    await sendText(ADMIN_NUMBER, `📥 New agent request\nTicket ${job.jobId} from ${from}`);
    return res.sendStatus(200);
  }

  // TOP LEVEL SERVICES
  const topMenuMap = {
    "1": "new_student",
    "2": "School Fees Payment",
    "3": "Online Courses Registration",
    "4": "JAMB Result & Admission Letter",
    "5": "Typing/Printing/Photocopy",
    "6": "Graphic Design",
    "7": "Web Design"
  };

  if (topMenuMap[lower]) {
    if (lower === "1") {
      session.lastMenu = "new_student";
      data.sessions[from] = session;
      writeData(data);
      await sendText(from, NEW_STUDENT_MENU);
      return res.sendStatus(200);
    } else {
      const serviceName = topMenuMap[lower];
      const job = createJob(serviceName);
      const serviceMsg = SERVICE_MESSAGES[serviceName.replace(/[ /]/g, "").toLowerCase()] || "";
      await sendText(from, `${serviceMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }
  }

// NEW STUDENT SUBMENU
if (session.lastMenu === "new_student") {
  const newStudentMap = {
    "1": { name: "UNICAL Checker Pin", msg: SERVICE_MESSAGES.unicalCheckerPin },
    "2": { name: "Acceptance Fee", msg: SERVICE_MESSAGES.acceptanceFee },
    "3": { name: "O'level Verification", msg: SERVICE_MESSAGES.olevelVerification },
    "4": { name: "Online Screening", msg: SERVICE_MESSAGES.onlineScreening },
    "5": { name: "Other Documents", msg: SERVICE_MESSAGES.otherDocuments }
  };

  const selection = newStudentMap[lower];
  if (selection) {
    // 1️⃣ Create job first
    const job = addToQueue(from, selection.name, { messages: [] });

    // 2️⃣ Link job to session
    session.currentJobId = job.jobId;

    // 3️⃣ Clear submenu
    session.lastMenu = null;

    // 4️⃣ Save session
    data.sessions[from] = session;
    writeData(data);

    // 5️⃣ Send service message
    await sendText(
      from,
      `${selection.msg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`
    );

    return res.sendStatus(200);
  }
}


  // COLLECT DETAILS
  if (session.currentJobId) {
    const d = readData();
    const job = d.queue.find(j => j.jobId === session.currentJobId);
    if (job) {
      if (!job.details.messages) job.details.messages = [];
      job.details.messages.push({ msg: text, time: Date.now() });
      d.sessions[from] = session;
      writeData(d);
      await sendText(from, `📌 Details received for Ticket ${job.jobId}. Send more or type *done* when finished.`);
      return res.sendStatus(200);
    }
  }

  // DONE
  if (lower === "done" && session.currentJobId) {
    const d = readData();
    const jobId = session.currentJobId;
    const job = d.queue.find(j => j.jobId === jobId);
    session.currentJobId = null;
    d.sessions[from] = session;
    writeData(d);
    if (job) {
      await sendText(from, `✅ All details saved for Ticket ${jobId}. Admin will provide your fee shortly.`);
      const collectedText = job.details.messages.map(m => m.msg).join("\n");
      await sendText(ADMIN_NUMBER, `📝 User details for Ticket ${jobId} from ${from}.\nService: ${job.shortService}\nDetails:\n${collectedText}\n\nReply with admin:${jobId}:<amount> to send fee.`);
    }
    return res.sendStatus(200);
  }

  // FALLBACK
  await sendText(from, `Sorry, I didn't understand. Type *menu* for main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
  return res.sendStatus(200);
});

/* ================ ROOT ================ */
app.get("/", (req, res) => res.send("QuickStop Cyber WasenderAPI Bot running."));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));


