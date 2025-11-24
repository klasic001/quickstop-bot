/**
 QuickStop Cyber Cafe — Full WasenderAPI Node.js Bot
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
    // don't throw here - allow webhook to continue gracefully
    return null;
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
0. Back to Main Menu
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

/* ================ HELPER: Robust extractor ================ */
function extractTextAndFrom(body) {
  // try various shapes
  let text = "";
  let fromRaw = "";

  // common shape: body.data.messages (object or array)
  if (body && body.data && body.data.messages) {
    const m = Array.isArray(body.data.messages) ? body.data.messages[0] : body.data.messages;
    if (m) {
      text = m.messageBody || m.body || m.text || m.message || "";
      fromRaw = m.remoteJid || m.from || m.sender || m.participant || "";
    }
  }

  // fallback to body.messages
  if (!text && body && body.messages) {
    const m = Array.isArray(body.messages) ? body.messages[0] : body.messages;
    if (m) {
      text = m.body || m.text || m.messageBody || "";
      fromRaw = m.from || m.remoteJid || m.sender || "";
    }
  }

  // fallback top-level
  if (!text && typeof body.text === "string") text = body.text;
  if (!fromRaw && typeof body.from === "string") fromRaw = body.from;

  // normalize remoteJid
  fromRaw = (fromRaw || "").toString().replace(/@s\.whatsapp\.net$/, "");
  text = (text || "").toString();

  return { text, fromRaw };
}

/* ================ WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};

    // extract robustly
    const { text, fromRaw } = extractTextAndFrom(body);

    // logging incoming raw (small) for debugging
    console.log("WEBHOOK RAW (truncated):", JSON.stringify(body).slice(0, 800));
    console.log("EXTRACTED text:", text, "fromRaw:", fromRaw);

    if (!text || !fromRaw) {
      console.log("No text/from extracted — ignoring");
      return res.sendStatus(200);
    }

    const from = normalizeNumber(fromRaw);
    const lower = text.trim().toLowerCase();

    // load data and ensure session exists
    const data = readData();
    data.sessions = data.sessions || {};
    if (!data.sessions[from]) data.sessions[from] = { lastMenu: "main", currentJobId: null };
    const session = data.sessions[from];

    // ensure lastMenu is explicitly one of: "main", "new_student", null
    if (typeof session.lastMenu === "undefined") session.lastMenu = "main";

    console.log("=== INCOMING ===");
    console.log("from:", from);
    console.log("text:", text);
    console.log("lower:", lower);
    console.log("session before:", JSON.stringify(session));
    console.log("nextJobId:", data.nextJobId);
    console.log("================");

    const isAdmin = from === normalizeNumber(ADMIN_NUMBER);

    /* ------------------- ADMIN COMMANDS ------------------- */
    if (isAdmin && /^(admin|agent):/i.test(lower)) {
      const parts = text.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();
      const job = data.queue.find(j => j.jobId === jobId);
      if (!job) { await sendText(from, `Ticket ${jobId} not found.`); writeData(data); return res.sendStatus(200); }

      if (cmd === "admin") {
        await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.\nPlease pay and send screenshot.`);
        await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
      } else if (cmd === "agent") {
        if (payload.toLowerCase() === "done") {
          job.status = "done";
          writeData(data);
          await sendText(job.number, `✅ Your request (Ticket ${jobId}) has been completed.`);
          await sendText(from, `✅ Ticket ${jobId} closed.`);
        } else {
          job.details.agentMessages = job.details.agentMessages || [];
          job.details.agentMessages.push({ msg: payload, time: Date.now() });
          writeData(data);
          await sendText(job.number, `💬 Message from agent:\n${payload}`);
          await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        }
      }
      writeData(data);
      return res.sendStatus(200);
    }

    /* ------------------- NAVIGATION: 0 = back to main or 'menu' ------------------- */
    if (lower === "0" || /^menu$/i.test(lower) || /^main$/i.test(lower)) {
      session.lastMenu = "main";
      // do NOT clear currentJobId here because user may be mid-job; they can still send details
      data.sessions[from] = session;
      writeData(data);
      await sendText(from, WELCOME_MENU);
      return res.sendStatus(200);
    }

    /* ------------------- CREATE JOB helper ------------------- */
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
      // link session to job and persist
      session.currentJobId = job.jobId;
      data.sessions[from] = session;
      writeData(data);
      console.log(`createJob -> job ${job.jobId} created and session saved`);
      return job;
    }

    /* ================= MENU LOGIC - use session.lastMenu as context ================= */

    // If user is in main menu context
    if (session.lastMenu === "main") {
      // MAIN menu options (only these are valid here)
      if (/^(hi|hello|menu|start)$/i.test(lower)) {
        // repeat welcome
        await sendText(from, WELCOME_MENU);
        return res.sendStatus(200);
      }

      // 8 -> speak to agent
      if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
        const job = createJob("Speak to Agent");
        await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nQueue position: *${queuePosition(job.jobId)}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
        await sendText(ADMIN_NUMBER, `📥 New agent request\nTicket ${job.jobId} from ${from}`);
        // After creating a job, keep session.lastMenu as null to allow details if user sends them
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      // top-level numeric options
      if (/^1$/i.test(lower)) {
        // enter new_student submenu
        session.lastMenu = "new_student";
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, NEW_STUDENT_MENU);
        return res.sendStatus(200);
      }

      if (/^2$/i.test(lower)) {
        const job = createJob("School Fees Payment");
        const svcMsg = SERVICE_MESSAGES.schoolFees || "";
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        // clear menu (we're now collecting details)
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      if (/^3$/i.test(lower)) {
        const job = createJob("Online Courses Registration");
        const svcMsg = SERVICE_MESSAGES.onlineCourses || "";
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      if (/^4$/i.test(lower)) {
        const job = createJob("JAMB Result & Admission Letter");
        const svcMsg = SERVICE_MESSAGES.jambAdmission || "";
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      if (/^5$/i.test(lower)) {
        const job = createJob("Typing/Printing/Photocopy");
        const svcMsg = SERVICE_MESSAGES.typingPrinting || "";
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      if (/^6$/i.test(lower)) {
        const job = createJob("Graphic Design");
        const svcMsg = SERVICE_MESSAGES.graphicDesign || "";
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      if (/^7$/i.test(lower)) {
        const job = createJob("Web Design");
        const svcMsg = SERVICE_MESSAGES.webDesign || "";
        await sendText(from, `${svcMsg}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        return res.sendStatus(200);
      }

      // invalid option in main menu
      await sendText(from, `Invalid main menu option. Press 0 to return to main menu or type *menu*.\n${TESTING_NOTICE}`);
      return res.sendStatus(200);
    } // end session.lastMenu === "main"

    // If user is in new_student submenu context
    if (session.lastMenu === "new_student") {
      // allow 0 -> back to main
      if (lower === "0") {
        session.lastMenu = "main";
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, WELCOME_MENU);
        return res.sendStatus(200);
      }

      // selections within new_student only
      if (/^1$/i.test(lower)) {
        const job = createJob("UNICAL Checker Pin");
        session.lastMenu = null; // exit submenu to start collecting details
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, `${SERVICE_MESSAGES.unicalCheckerPin}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        return res.sendStatus(200);
      }

      if (/^2$/i.test(lower)) {
        const job = createJob("Acceptance Fee");
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, `${SERVICE_MESSAGES.acceptanceFee}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        return res.sendStatus(200);
      }

      if (/^3$/i.test(lower)) {
        const job = createJob("O'level Verification");
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, `${SERVICE_MESSAGES.olevelVerification}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        return res.sendStatus(200);
      }

      if (/^4$/i.test(lower)) {
        const job = createJob("Online Screening");
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, `${SERVICE_MESSAGES.onlineScreening}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        return res.sendStatus(200);
      }

      if (/^5$/i.test(lower)) {
        const job = createJob("Other Documents");
        session.lastMenu = null;
        data.sessions[from] = session;
        writeData(data);
        await sendText(from, `${SERVICE_MESSAGES.otherDocuments}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}\nSend details now. Type *done* when finished.`);
        return res.sendStatus(200);
      }

      // invalid option within new_student menu
      await sendText(from, `Invalid option for New Student menu. Press 0 to return to main menu.\n${TESTING_NOTICE}`);
      return res.sendStatus(200);
    } // end new_student menu

    /* ------------------- If not in any menu (session.lastMenu === null), we are collecting details for a job ------------------- */

    // DONE must be checked before collecting details
    if (lower === "done" && session.currentJobId) {
      const jobId = session.currentJobId;
      // clear currentJobId from session
      session.currentJobId = null;
      data.sessions[from] = session;
      writeData(data);

      const job = data.queue.find(j => j.jobId === jobId);
      if (job) {
        await sendText(from, `✅ All details saved for Ticket ${jobId}. Admin will provide your fee shortly.`);
        const collected = (job.details.messages || []).map(m => m.msg).join("\n");
        await sendText(ADMIN_NUMBER, `📝 User details for Ticket ${jobId} from ${from}\nService: ${job.shortService}\nDetails:\n${collected}\n\nReply with admin:${jobId}:<amount>`);
        console.log("Done: forwarded details to admin for job", jobId);
      } else {
        console.warn("Done typed but job not found:", jobId);
      }
      return res.sendStatus(200);
    }

    // Collect details only if user has an active job and not inside a menu
    if (session.currentJobId && session.lastMenu === null) {
      const job = data.queue.find(j => j.jobId === session.currentJobId);
      if (job) {
        if (!job.details) job.details = { messages: [] };
        job.details.messages.push({ msg: text, time: Date.now() });
        writeData(data);
        await sendText(from, `📌 Details received for Ticket ${job.jobId}. Send more or type *done* when finished.`);
        console.log(`Saved details to job ${job.jobId} (message length ${text.length})`);
        return res.sendStatus(200);
      } else {
        console.warn("session.currentJobId set but job not found:", session.currentJobId);
      }
    }

    // fallback - not understood in the current context
    if (session.lastMenu && session.lastMenu !== "main") {
      await sendText(from, `Invalid option for the current menu. Press 0 to go back to the main menu.\n${TESTING_NOTICE}`);
      return res.sendStatus(200);
    }

    // final fallback
    await sendText(from, `Sorry, I didn't understand. Type *menu* for main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);

  } catch (err) {
    console.error("Unhandled webhook error:", err);
    return res.sendStatus(200);
  }
}); // end webhook

/* ================ ROOT ================ */
app.get("/", (req, res) => res.send("QuickStop Cyber WasenderAPI Bot running."));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));

