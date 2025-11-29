/**
 QuickStop Cyber Cafe — WasenderAPI Node.js Bot (Fully Fixed & Updated)
 - Queue & persistent ticket IDs fixed
 - Admin/agent handover fixed
 - Robust session & file persistence
 - School Fees: only ask for details + send account number
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const writeJsonAtomic = require("write-json-file");

const app = express();
app.use(express.json());

/* ========== CONFIG ========== */
const INSTANCE_ID = process.env.INSTANCE_ID || "34742";
const TOKEN = process.env.TOKEN || "1c309d0ee36ceb74c73a60250bdfee602dfea2857de857a6a56d8a29560cdfff";
const PORT = process.env.PORT || 3000;

/* ========== ADMINS ========== */
const ADMINS = [
  normalizeNumber(process.env.ADMIN_NUMBER || "2348057703948"),
  normalizeNumber("2348166008021")
];

/* ========== DATA FILE ========== */
const DATA_FILE = path.join(__dirname, "data.json");

if (!fs.existsSync(DATA_FILE)) {
  fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });
  console.log("Initialized data.json");
}

function readData() { return fs.readJsonSync(DATA_FILE); }
async function writeData(d) { await writeJsonAtomic(DATA_FILE, d, { spaces: 2 }); }

/* ========== HELPERS ========== */
function normalizeNumber(n) { return (n || "").toString().replace(/\D/g, ""); }

async function sendText(toNumber, text) {
  try {
    const to = ("" + toNumber).replace(/\D/g, "");
    const resp = await axios.post(
      "https://wasenderapi.com/api/send-message",
      { to: to, text },
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
    return null;
  }
}

async function notifyAdmins(message) {
  for (const admin of ADMINS) {
    try { await sendText(admin, message); } 
    catch(e) { console.error("notifyAdmins failed:", admin, e); }
  }
}

/* ========== MESSAGES ========== */
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
Please send your Full Name, Matric Number, and School (UNICAL/UICROSS).
We will provide account number for payment.
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

/* ========== QUEUE HELPERS ========== */
function queuePosition(queue, jobId) {
  const waiting = queue.filter(j => j.status === "waiting").sort((a,b)=>a.createdAt-b.createdAt);
  const pos = waiting.findIndex(j => j.jobId === jobId);
  return pos >=0 ? pos+1 : -1;
}

async function createJob(from, serviceName) {
  const data = readData();
  const nextJobId = data.nextJobId || 1;

  const job = {
    jobId: nextJobId,
    number: from,
    shortService: serviceName,
    details: { messages: [] },
    createdAt: Date.now(),
    paid: false,
    status: "waiting",
    agent: null
  };

  data.queue.push(job);
  data.nextJobId = nextJobId + 1;

  // link session
  data.sessions[from] = data.sessions[from] || { lastMenu: null, currentJobId: job.jobId, mode: "bot" };
  data.sessions[from].currentJobId = job.jobId;
  data.sessions[from].mode = "bot";
  await writeData(data);

  console.log(`createJob -> job ${job.jobId} created for ${from}`);
  return job;
}

/* ========== TEXT + FROM EXTRACTOR ========== */
function extractTextAndFrom(body) {
  let text = "", fromRaw = "";
  if(body?.data?.messages) {
    const m = Array.isArray(body.data.messages) ? body.data.messages[0] : body.data.messages;
    if(m) { text = m.messageBody || m.body || m.text || ""; fromRaw = m.remoteJid || m.from || ""; }
  }
  if(!text && body?.messages) {
    const m = Array.isArray(body.messages) ? body.messages[0] : body.messages;
    if(m) { text = m.body || m.text || ""; fromRaw = m.from || ""; }
  }
  if(!text && typeof body.text === "string") text = body.text;
  if(!fromRaw && typeof body.from === "string") fromRaw = body.from;
  fromRaw = (fromRaw || "").toString().replace(/@s\.whatsapp\.net$/, "");
  text = (text || "").toString();
  return { text, fromRaw };
}

/* ========== WEBHOOK ========== */
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body || {};
    const { text, fromRaw } = extractTextAndFrom(body);
    if(!text || !fromRaw) return res.sendStatus(200);

    const from = normalizeNumber(fromRaw);
    const lower = text.trim().toLowerCase();

    const data = readData();
    data.sessions = data.sessions || {};
    const session = data.sessions[from] || { lastMenu: "main", currentJobId: null, mode: "bot" };
    const isAdmin = ADMINS.includes(from);

    // ---------- ADMIN COMMANDS ----------
    if(isAdmin && /^(admin|agent):/i.test(lower)) {
      const parts = text.split(":");
      const cmd = parts[0].toLowerCase();
      const jobId = Number(parts[1]);
      const payload = parts.slice(2).join(":").trim();
      const job = data.queue.find(j => j.jobId === jobId);
      if(!job) { await sendText(from, `Ticket ${jobId} not found.`); return res.sendStatus(200); }

      if(cmd==="admin") {
        await sendText(job.number, `🧾 Your fee for Ticket ${jobId} is ₦${payload}.\nPlease pay and send screenshot.`);
        await sendText(from, `✅ Fee sent to ${job.number} for Ticket ${jobId}`);
      } else if(cmd==="agent") {
        if(payload.toLowerCase() === "done") {
          job.status = "done";
          job.closedAt = Date.now();
          await sendText(job.number, `✅ Your request (Ticket ${jobId}) has been completed.`);
          await notifyAdmins(`✅ Ticket ${jobId} closed by admin ${from}.`);
          const userSession = data.sessions[job.number];
          if(userSession) { userSession.mode = "bot"; userSession.currentJobId = null; userSession.lastMenu = "main"; data.sessions[job.number]=userSession; }
        } else {
          job.details.agentMessages = job.details.agentMessages || [];
          job.details.agentMessages.push({ admin: from, msg: payload, time: Date.now() });
          if(!job.agent) job.agent = from;
          data.sessions[job.number] = data.sessions[job.number] || { lastMenu:null, currentJobId:job.jobId, mode:"agent_chat" };
          data.sessions[job.number].mode="agent_chat";
          data.sessions[job.number].currentJobId = job.jobId;
          await sendText(job.number, `💬 Message from agent:\n${payload}`);
          await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        }
      }
      await writeData(data);
      return res.sendStatus(200);
    }

    // ---------- USER AGENT CHAT ----------
    if(session.mode === "agent_chat") {
      let jobId = session.currentJobId;
      if(!jobId) {
        const maybe = data.queue.find(j => j.number===from && j.agent);
        if(maybe) jobId = maybe.jobId; session.currentJobId = jobId; data.sessions[from]=session; await writeData(data);
      }
      await notifyAdmins(`📨 Message from user (Ticket ${jobId||"unknown"}) [${from}]:\n${text}`);
      await sendText(from, `📤 Your message has been forwarded to our agent(s). Ticket ${jobId||"N/A"}`);
      return res.sendStatus(200);
    }

    // ---------- NAVIGATION ----------
    if(lower==="0" || /^menu$/i.test(lower) || /^main$/i.test(lower)) {
      session.lastMenu="main"; session.mode="bot"; data.sessions[from]=session; await writeData(data);
      await sendText(from, WELCOME_MENU);
      return res.sendStatus(200);
    }

    // ---------- MENU LOGIC ----------
    if(session.lastMenu==="main") {
      if(/^(hi|hello|menu|start)$/i.test(lower)) { await sendText(from, WELCOME_MENU); return res.sendStatus(200); }
      if(/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
        const job = await createJob(from,"Speak to Agent");
        await sendText(from, `🙋‍♂️ You are now in the queue. Ticket ID: *${job.jobId}*.\nQueue position: *${queuePosition(data.queue,job.jobId)}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
        await notifyAdmins(`📥 New agent request\nTicket ${job.jobId} from ${from}\nService: Speak to Agent`);
        session.lastMenu=null; session.mode="awaiting_agent"; session.currentJobId=job.jobId; data.sessions[from]=session; await writeData(data);
        return res.sendStatus(200);
      }
      if(/^1$/i.test(lower)) { session.lastMenu="new_student"; data.sessions[from]=session; await writeData(data); await sendText(from, NEW_STUDENT_MENU); return res.sendStatus(200); }
      if(/^2$/i.test(lower)) { const job=await createJob(from,"School Fees Payment"); await sendText(from, `${SERVICE_MESSAGES.schoolFees}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}`); session.lastMenu=null; data.sessions[from]=session; await writeData(data); return res.sendStatus(200); }
      if(/^3$/i.test(lower)) { const job=await createJob(from,"Online Courses Registration"); await sendText(from, `${SERVICE_MESSAGES.onlineCourses}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); session.lastMenu=null; data.sessions[from]=session; await writeData(data); return res.sendStatus(200); }
      if(/^4$/i.test(lower)) { const job=await createJob(from,"JAMB Result & Admission Letter"); await sendText(from, `${SERVICE_MESSAGES.jambAdmission}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); session.lastMenu=null; data.sessions[from]=session; await writeData(data); return res.sendStatus(200); }
      if(/^5$/i.test(lower)) { const job=await createJob(from,"Typing/Printing/Photocopy"); await sendText(from, `${SERVICE_MESSAGES.typingPrinting}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); session.lastMenu=null; data.sessions[from]=session; await writeData(data); return res.sendStatus(200); }
      if(/^6$/i.test(lower)) { const job=await createJob(from,"Graphic Design"); await sendText(from, `${SERVICE_MESSAGES.graphicDesign}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); session.lastMenu=null; data.sessions[from]=session; await writeData(data); return res.sendStatus(200); }
      if(/^7$/i.test(lower)) { const job=await createJob(from,"Web Design"); await sendText(from, `${SERVICE_MESSAGES.webDesign}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); session.lastMenu=null; data.sessions[from]=session; await writeData(data); return res.sendStatus(200); }
      await sendText(from, `Invalid main menu option. Press 0 to return to main menu or type *menu*.\n${TESTING_NOTICE}`); return res.sendStatus(200);
    }

    if(session.lastMenu==="new_student") {
      if(lower==="0") { session.lastMenu="main"; data.sessions[from]=session; await writeData(data); await sendText(from,WELCOME_MENU); return res.sendStatus(200); }
      if(/^1$/i.test(lower)) { const job=await createJob(from,"UNICAL Checker Pin"); session.lastMenu=null; session.mode="bot"; data.sessions[from]=session; await writeData(data); await sendText(from, `${SERVICE_MESSAGES.unicalCheckerPin}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); return res.sendStatus(200); }
      if(/^2$/i.test(lower)) { const job=await createJob(from,"Acceptance Fee"); session.lastMenu=null; session.mode="bot"; data.sessions[from]=session; await writeData(data); await sendText(from, `${SERVICE_MESSAGES.acceptanceFee}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); return res.sendStatus(200); }
      if(/^3$/i.test(lower)) { const job=await createJob(from,"O'level Verification"); session.lastMenu=null; session.mode="bot"; data.sessions[from]=session; await writeData(data); await sendText(from, `${SERVICE_MESSAGES.olevelVerification}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); return res.sendStatus(200); }
      if(/^4$/i.test(lower)) { const job=await createJob(from,"Online Screening"); session.lastMenu=null; session.mode="bot"; data.sessions[from]=session; await writeData(data); await sendText(from, `${SERVICE_MESSAGES.onlineScreening}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); return res.sendStatus(200); }
      if(/^5$/i.test(lower)) { const job=await createJob(from,"Other Documents"); session.lastMenu=null; session.mode="bot"; data.sessions[from]=session; await writeData(data); await sendText(from, `${SERVICE_MESSAGES.otherDocuments}\nTicket ID: ${job.jobId}\nQueue: ${queuePosition(data.queue,job.jobId)}\nSend details now. Type *done* when finished.`); return res.sendStatus(200); }
      await sendText(from, `Invalid option in NEW STUDENT menu. Press 0 to return to main menu.`); return res.sendStatus(200);
    }

    // ---------- DEFAULT ----------
    await sendText(from, `Invalid input. Press 0 to return to main menu.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

/* ========== START SERVER ========== */
app.listen(PORT, () => console.log(`QuickStop Bot running on port ${PORT}`));
