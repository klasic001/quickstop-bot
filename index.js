/**
 QuickStop Cyber — Fixed WasenderAPI Node.js Bot
 - Correct Wasender webhook parsing (messages array)
 - Reliable ticket ID increments (no race between reads/writes)
 - "done" handled before saving details
 - Proper session handling and admin notifications
 - Basic de-duplication (prevents double queueing same user)
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());

/* ========== CONFIG - EDIT OR SET ENV ========== */
const INSTANCE_ID = process.env.INSTANCE_ID || "34742";
const TOKEN = process.env.TOKEN || "1c309d0ee36ceb74c73a60250bdfee602dfea2857de857a6a56d8a29560cdfff";
const ADMIN_KEY = process.env.ADMIN_KEY || "01081711";
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "2348057703948"; // admin WhatsApp number (digits only)
const PORT = process.env.PORT || 3000;
/* ========================================= */

const SEND_MESSAGE_URL = "https://wasenderapi.com/api/send-message";
const DATA_FILE = path.join(__dirname, "data.json");

// Initialize persistent storage if missing
if (!fs.existsSync(DATA_FILE)) {
  fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });
}

function readData() {
  return fs.readJsonSync(DATA_FILE);
}
function writeData(d) {
  fs.writeJsonSync(DATA_FILE, d, { spaces: 2 });
}

function normalizeNumber(n) {
  if (!n) return "";
  // Accept inputs like "234805..." or "234805...@s.whatsapp.net" or "0805..."
  const s = n.toString();
  const digits = s.replace(/@.*$/, "").replace(/\D/g, "");
  // Optional: convert 080... to 23480... if you want.
  return digits;
}

async function sendText(toNumber, text) {
  try {
    const to = normalizeNumber(toNumber);
    if (!to) {
      console.warn("sendText skipped: invalid recipient", toNumber);
      return;
    }
    await axios.post(
      SEND_MESSAGE_URL,
      { to: to, text: text },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    console.log(`✅ Message sent to ${to}: ${text.split("\n")[0].slice(0, 80)}${text.length>80?"...":""}`);
  } catch (err) {
    console.error("sendText error:", err?.response?.data || err?.message || err);
  }
}

/* =============== BOT CONTENT =============== */
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

/* ================ HELPERS ================ */
function queuePositionFor(data, jobId) {
  const waiting = data.queue.filter(j => j.status === "waiting");
  const pos = waiting.findIndex(j => j.jobId === jobId);
  return pos >= 0 ? pos + 1 : -1;
}

function findJobById(data, jobId) {
  return data.queue.find(j => j.jobId === jobId);
}

function createJob(data, session, from, serviceName) {
  // ensure data object is the live object passed by caller
  if (!data.nextJobId) data.nextJobId = 1;
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
  session.currentJobId = job.jobId;
  // persist caller must writeData after this
  return job;
}

/* ================ WEBHOOK ================ */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};

    // Wasender sends messages as an array under data.messages -> take first
    const msg = (body.data && Array.isArray(body.data.messages) && body.data.messages[0]) || body.data?.messages?.[0] || null;

    // Some variations or older formats may use nested properties; support a couple fallbacks:
    const fallbackText = body?.body || body?.message || "";
    const textFromMsg = msg?.body || msg?.messageBody || msg?.text || "";
    const rawFrom = msg?.from || msg?.remoteJid || msg?.sender || body?.from || "";

    const textRaw = (textFromMsg || fallbackText || "").toString();
    const fromRaw = rawFrom.toString();

    const text = textRaw.trim();
    const from = normalizeNumber(fromRaw);

    if (!text || !from) {
      // nothing we can do; ignore
      return res.sendStatus(200);
    }

    // Read live data once at start of request
    const data = readData();
    data.sessions = data.sessions || {};

    if (!data.sessions[from]) {
      data.sessions[from] = { lastMenu: null, collected: {}, currentJobId: null };
    }
    const session = data.sessions[from];
    const isFromAdmin = from === normalizeNumber(ADMIN_NUMBER);

    // ADMIN COMMANDS (admin:ticket:payload or agent:ticket:message)
    if (isFromAdmin) {
      // expected pattern: admin:<jobId>:<amount>  OR  agent:<jobId>:<message>  OR admin:123 (maybe)
      const parts = text.split(":");
      const cmd = parts[0]?.trim().toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();

      if ((cmd === "admin" || cmd === "agent") && Number.isInteger(jobId) && jobId > 0) {
        const job = findJobById(data, jobId);
        if (!job) {
          await sendText(from, `Ticket ${jobId} not found.`);
          return res.sendStatus(200);
        }

        if (cmd === "admin") {
          if (!payload) {
            await sendText(from, `Usage: admin:${jobId}:<amount>\nExample: admin:${jobId}:42000`);
            return res.sendStatus(200);
          }
          // Send fee message to user
          await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.\nPlease pay and send screenshot.`);
          await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
          // persist
          writeData(data);
          return res.sendStatus(200);
        }

        if (cmd === "agent") {
          if (payload.toLowerCase() === "done") {
            job.status = "done";
            writeData(data);
            await sendText(job.number, `✅ Your request (Ticket ${jobId}) has been completed.`);
            await sendText(from, `✅ Ticket ${jobId} closed.`);
            return res.sendStatus(200);
          }
          job.details.agentMessages = job.details.agentMessages || [];
          job.details.agentMessages.push({ msg: payload, time: Date.now(), agent: from });
          writeData(data);
          await sendText(job.number, `💬 Message from agent:\n${payload}`);
          await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
          return res.sendStatus(200);
        }
      } else {
        // Not recognized admin command
        await sendText(from, `Admin usage:\nadmin:<ticketId>:<amount>\nagent:<ticketId>:<message>`);
        return res.sendStatus(200);
      }
    } // end admin

    // ---------- USER BOT LOGIC ----------

    // Normalize lower for menu matching (single token)
    const lower = text.toLowerCase();

    // MAIN TRIGGERS
    if (/^(hi|hello|menu|start)$/i.test(lower)) {
      session.lastMenu = "main";
      writeData(data);
      await sendText(from, WELCOME_MENU);
      return res.sendStatus(200);
    }

    // AGENT / Speak to agent shortcut
    if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
      // Prevent duplicate agent jobs for same user who already has waiting job
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You are already in queue. Ticket ID: *${existing.jobId}*.\nQueue position: *${queuePositionFor(data, existing.jobId)}*.`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "Speak to Agent");
      writeData(data);
      await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nQueue position: *${queuePositionFor(data, job.jobId)}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
      await sendText(ADMIN_NUMBER, `📥 New agent request\nTicket ${job.jobId} from ${from}`);
      return res.sendStatus(200);
    }

    // Top-level menu options
    if (/^1$/i.test(lower)) {
      session.lastMenu = "new_student";
      writeData(data);
      await sendText(from, NEW_STUDENT_MENU);
      return res.sendStatus(200);
    }

    if (/^2$/i.test(lower)) {
      // queue prevention: don't create multiple active jobs for same user
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}). Reply *done* when finished or wait for admin.`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "School Fees Payment");
      writeData(data);
      await sendText(from, `${SERVICE_MESSAGES.schoolFees}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }

    if (/^3$/i.test(lower)) {
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}).`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "Online Courses Registration");
      writeData(data);
      await sendText(from, `${SERVICE_MESSAGES.onlineCourses}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }

    if (/^4$/i.test(lower)) {
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}).`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "JAMB Result & Admission Letter");
      writeData(data);
      await sendText(from, `${SERVICE_MESSAGES.jambAdmission}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }

    if (/^5$/i.test(lower)) {
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}).`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "Typing/Printing/Photocopy");
      writeData(data);
      await sendText(from, `${SERVICE_MESSAGES.typingPrinting}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }

    if (/^6$/i.test(lower)) {
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}).`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "Graphic Design");
      writeData(data);
      await sendText(from, `${SERVICE_MESSAGES.graphicDesign}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }

    if (/^7$/i.test(lower)) {
      const existing = data.queue.find(j => j.number === from && j.status === "waiting");
      if (existing) {
        await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}).`);
        return res.sendStatus(200);
      }
      const job = createJob(data, session, from, "Web Design");
      writeData(data);
      await sendText(from, `${SERVICE_MESSAGES.webDesign}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
      return res.sendStatus(200);
    }

    // If user is inside New Student submenu
    if (session.lastMenu === "new_student") {
      const newStudentMap = {
        "1": { name: "UNICAL Checker Pin", msg: SERVICE_MESSAGES.unicalCheckerPin, price: 3500 },
        "2": { name: "Acceptance Fee", msg: SERVICE_MESSAGES.acceptanceFee, price: 42000 },
        "3": { name: "O'level Verification", msg: SERVICE_MESSAGES.olevelVerification, price: 10500 },
        "4": { name: "Online Screening", msg: SERVICE_MESSAGES.onlineScreening, price: 2500 },
        "5": { name: "Other Documents", msg: SERVICE_MESSAGES.otherDocuments, price: 0 },
      };
      const selection = newStudentMap[lower];
      if (selection) {
        const existing = data.queue.find(j => j.number === from && j.status === "waiting");
        if (existing) {
          await sendText(from, `You already have a waiting request (Ticket ${existing.jobId}).`);
          return res.sendStatus(200);
        }
        const job = createJob(data, session, from, selection.name);
        writeData(data);
        await sendText(from, `${selection.msg}\nTicket ID: ${job.jobId}\nQueue: ${queuePositionFor(data, job.jobId)}\nSend details now. Type *done* when finished.`);
        return res.sendStatus(200);
      }
    }

    // ---------------- "done" handling must happen before generic detail collection ----------------
    if (/^done$/i.test(lower) && session.currentJobId) {
      const jobId = session.currentJobId;
      session.currentJobId = null;
      writeData(data);

      await sendText(from, `✅ All details saved for Ticket ${jobId}. Admin will provide your fee shortly.`);

      const job = findJobById(data, jobId);
      if (job) {
        const collectedText = (job.details.messages || []).map(m => m.msg).join("\n");
        await sendText(ADMIN_NUMBER, `📝 User details for Ticket ${jobId} from ${from}.\nService: ${job.shortService}\nDetails:\n${collectedText}\n\nReply with admin:${jobId}:<amount> to send fee.`);
      }
      return res.sendStatus(200);
    }

    // ---------------- Collect details for a currently open job ----------------
    if (session.currentJobId) {
      const job = findJobById(data, session.currentJobId);
      if (!job) {
        // session had stale job id; clear it
        session.currentJobId = null;
        writeData(data);
        await sendText(from, `An error occurred with your session. Please type *menu* to start again.`);
        return res.sendStatus(200);
      }
      job.details.messages = job.details.messages || [];
      job.details.messages.push({ msg: text, time: Date.now() });
      writeData(data);
      await sendText(from, `📌 Details received for Ticket ${job.jobId}. Send more or type *done* when finished.`);
      return res.sendStatus(200);
    }

    // fallback — did not match any route
    await sendText(from, `Sorry, I didn't understand. Type *menu* for main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.sendStatus(200);
  }
});

/* ================ ROOT ================ */
app.get("/", (req, res) => res.send("QuickStop Cyber WasenderAPI Bot running."));

app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
