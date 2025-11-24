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
if (!fs.existsSync(DATA_FILE)) {
  fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });
  console.log("Initialized data.json");
}

function readData() { return fs.readJsonSync(DATA_FILE); }
function writeData(d) { fs.writeJsonSync(DATA_FILE, d, { spaces: 2 }); }

async function sendText(toNumber, text) {
  try {
    const to = ("" + toNumber).replace(/\D/g, "");
    const resp = await axios.post(
      SEND_MESSAGE_URL,
      { to: to, text: text },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    console.log(`✅ Message sent to ${to} (len ${String(text).length})`);
    return resp.data;
  } catch (err) {
    console.error("sendText error:", {
      toNumber,
      messageSnippet: ("" + text).slice(0, 200),
      axiosError: err?.response?.data || err.message || err
    });
    throw err;
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
  console.log(`-> addToQueue created job ${job.jobId} for ${number}`);
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
  try {
    const body = req.body || {};
    const msgData = body.data?.messages || null;
    if (!msgData) { console.log("No messages in payload"); return res.sendStatus(200); }

    const text = msgData.messageBody || "";
    const fromRaw = msgData.remoteJid?.replace(/@s\.whatsapp\.net$/, "") || "";
    const from = normalizeNumber(fromRaw);
    if (!text || !from) { console.log("Missing text or from"); return res.sendStatus(200); }

    const lower = text.trim().toLowerCase();

    // SINGLE read
    const data = readData();
    data.sessions = data.sessions || {};
    if (!data.sessions[from]) {
      data.sessions[from] = { lastMenu: null, currentJobId: null };
    }
    const session = data.sessions[from];

    // Logging incoming message and session snapshot
    console.log("=== INCOMING ===");
    console.log("from:", from);
    console.log("text:", text);
    console.log("lower:", lower);
    console.log("session before:", JSON.stringify(session));
    console.log("nextJobId:", data.nextJobId);
    console.log("================");

    const isAdmin = from === normalizeNumber(ADMIN_NUMBER);

    // ------------------- ADMIN -------------------
    if (isAdmin && /^(admin|agent):/i.test(lower)) {
      const [cmdRaw, idRaw, ...rest] = text.split(":");
      const cmd = cmdRaw.toLowerCase();
      const jobId = Number(idRaw);
      const payload = rest.join(":").trim();
      const job = data.queue.find(j => j.jobId === jobId);
      if (!job) { await sendText(from, `Ticket ${jobId} not found.`); writeData(data); return res.sendStatus(200); }

      console.log("ADMIN CMD:", cmd, "jobId:", jobId, "payload:", payload);

      if (cmd === "admin") {
        await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.\nPlease pay and send screenshot.`);
        await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
      } else if (cmd === "agent") {
        if (payload.toLowerCase() === "done") {
          job.status = "done";
          await sendText(job.number, `✅ Your request (Ticket ${jobId}) has been completed.`);
          await sendText(from, `✅ Ticket ${jobId} closed.`);
        } else {
          job.details.agentMessages = job.details.agentMessages || [];
          job.details.agentMessages.push({ msg: payload, time: Date.now() });
          await sendText(job.number, `💬 Message from agent:\n${payload}`);
          await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        }
      }
      writeData(data);
      console.log("ADMIN command handled, returning");
      return res.sendStatus(200);
    }

    // ------------------- CREATE JOB -------------------
    function createJob(serviceName) {
      const job = {
        jobId: data.nextJobId++,
        number: from,
        shortService: serviceName,
        details: { messages: [] },
        createdAt: Date.now(),
        paid: false,
        status: "waiting",
        agent: null
      };
      data.queue.push(job);
      // persist session.currentJobId immediately and write
      session.currentJobId = job.jobId;
      data.sessions[from] = session;
      writeData(data);
      console.log(`createJob -> job ${job.jobId} created and session saved`);
      return job;
    }

    // ------------------- MAIN MENU -------------------
    if (/^(hi|hello|menu|start)$/i.test(lower)) {
      session.lastMenu = "main";
      data.sessions[from] = session;
      writeData(data);
      console.log("Sent WELCOME_MENU");
      await sendText(from, WELCOME_MENU);
      return res.sendStatus(200);
    }

    // ------------------- AGENT REQUEST -------------------
    if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
      const job = createJob("Speak to Agent");
      await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nQueue position: *${queuePosition(job.jobId)}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
      await sendText(ADMIN_NUMBER, `📥 New agent request\nTicket ${job.jobId} from ${from}`);
      console.log("Agent request created and admin notified");
      return res.sendStatus(200);
    }

    // ------------------- TOP MENU -------------------
    const topMap = {
      "1": "new_student",
      "2": "School Fees Payment",
      "3": "Online Courses Registration",
      "4": "JAMB Result & Admission Letter",
      "5": "Typing/Printing/Photocopy",
      "6": "Graphic Design",
      "7": "Web Design"
    };
    if (topMap[lower]) {
      if (lower === "1") {
        session.lastMenu = "new_student";
        data.sessions[from] = session;
        writeData(data);
        console.log("Sent NEW_STUDENT_MENU");
        await sendText(from, NEW_STUDENT_MENU);
      } else {
        const serviceName = topMap[lower];
        const job = createJob(serviceName);
        const key = serviceName.replace(/[ /]/g, "").toLowerCase();
        const svcMsg = SERVICE_MESSAGES[key];
        if (!svcMsg) console.warn("Service message not found for key:", key);
        await sendText(from, `${svcMsg || ""}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        console.log("Top-level service job created:", serviceName, job.jobId);
      }
      return res.sendStatus(200);
    }

    // ------------------- NEW STUDENT SUBMENU -------------------
    if (session.lastMenu === "new_student") {
      const newStudentMap = {
        "1": { name: "UNICAL Checker Pin", key: "unicalCheckerPin" },
        "2": { name: "Acceptance Fee", key: "acceptanceFee" },
        "3": { name: "O'level Verification", key: "olevelVerification" },
        "4": { name: "Online Screening", key: "onlineScreening" },
        "5": { name: "Other Documents", key: "otherDocuments" }
      };
      const sel = newStudentMap[lower];
      if (sel) {
        console.log("New-student selection:", sel);
        const job = createJob(sel.name); // creates job and saves session.currentJobId
        // clear submenu and persist
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        const svcMsg = SERVICE_MESSAGES[sel.key];
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        console.log("Sent service message for new-student selection, job:", job.jobId);
        return res.sendStatus(200);
      }
    }
   
// ------------------- DONE -------------------
if (lower === "done" && session.currentJobId && session.lastMenu === null) {
  const jobId = session.currentJobId;
  const job = data.queue.find(j => j.jobId === jobId);

  session.currentJobId = null;
  writeData(data);

  if (job) {
    await sendText(from, `✅ All details saved for Ticket ${jobId}. Admin will provide your fee shortly.`);
    const collected = (job.details.messages || []).map(m => m.msg).join("\n");
    await sendText(ADMIN_NUMBER, `📝 User details for Ticket ${jobId} from ${from}\nService: ${job.shortService}\nDetails:\n${collected}\n\nReply with admin:${jobId}:<amount>`);
    console.log("Done → sent details to admin");
  }
  return res.sendStatus(200);
}


   
  // ------------------- COLLECT DETAILS -------------------
if (session.currentJobId && session.lastMenu === null && lower !== "done") {
  const job = data.queue.find(j => j.jobId === session.currentJobId);
  if (job) {
    job.details.messages.push({ msg: text, time: Date.now() });
    writeData(data);
    console.log(`Saved details to job ${job.jobId}`);
    await sendText(from, `📌 Details received for Ticket ${job.jobId}. Send more or type *done* when finished.`);
    return res.sendStatus(200);
  }
}

    // ------------------- FALLBACK -------------------
    await sendText(from, `Sorry, I didn't understand. Type *menu* for main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);
  } catch (err) {
    console.error("Unhandled webhook error:", err);
    return res.sendStatus(200);
  }
}); // <-- CLOSES app.post("/webhook")

/* ================ ROOT ================ */
app.get("/", (req, res) => res.send("QuickStop Cyber WasenderAPI Bot running."));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

