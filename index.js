/**
 QuickStop Cyber — WasenderAPI Node.js bot
 Fully CommonJS, all services added, testing mode notice
*/

const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());

/* ========== CONFIG - EDIT THESE ========== */
const INSTANCE_ID = process.env.INSTANCE_ID || "34742"; // Your WasenderAPI instance
const TOKEN = process.env.TOKEN || "1c309d0ee36ceb74c73a60250bdfee602dfea2857de857a6a56d8a29560cdfff";
const ADMIN_KEY = process.env.ADMIN_KEY || "01081711";
const PORT = process.env.PORT || 3000;
/* ========================================= */

const BASE_API = `https://api.wasenderapi.com/${INSTANCE_ID}/messages`;
const DATA_FILE = path.join(__dirname, "data.json");

if (!fs.existsSync(DATA_FILE)) fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });

function readData() { return fs.readJsonSync(DATA_FILE); }
function writeData(d) { fs.writeJsonSync(DATA_FILE, d, { spaces: 2 }); }

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

function normalizeNumber(n) { return (n || "").replace(/\D/g, ""); }

/* ================= BOT CONTENT ================= */
const TESTING_NOTICE = "⚠️ Note: This bot is currently in testing phase. If something goes wrong, our team will assist you.";

const WELCOME_MENU = `👋 Welcome to QuickStop Cyber!
This service supports 🎓 UNICAL & 🎓 UICROSS students.

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

// Detailed messages per service
function msgUnicalCheckerPin() { return `🟦 UNICAL CHECKER PIN
Price: ₦3500
Send details: Full Name, Reg Number, Email, Phone Number
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE
${TESTING_NOTICE}`; }

function msgAcceptanceFee() { return `🟦 ACCEPTANCE FEE
Price: ₦?? (edit later)
Send details: Full Name, Reg Number, Department, Email, Phone Number
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE
${TESTING_NOTICE}`; }

function msgOlevelVerification() { return `🟦 O'LEVEL VERIFICATION
Send details: Full Name, Reg Number, O'Level Result (upload), Phone Number
Payment info to be confirmed
${TESTING_NOTICE}`; }

function msgOnlineScreening() { return `🟦 ONLINE SCREENING
Send details: Full Name, Reg Number, JAMB Score, O'Level Results, Phone, Email
Payment info to be confirmed
${TESTING_NOTICE}`; }

function msgOtherDocuments() { return `🟦 OTHER DOCUMENTS
Options: Attestation Letter, Birth Certificate, Certificate of Origin
Send which one you want + details
Payment info to be confirmed
${TESTING_NOTICE}`; }

function msgSchoolFees() { return `🟦 SCHOOL FEES PAYMENT
Price: ₦50,000 (edit later)
Send: Full Name, Matric Number, Department, Level, Phone Number
Make payment to KUDA 3002896343 QUICKSTOP CYBER CAFE
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
  const job = { jobId: data.nextJobId++, number, shortService, details, createdAt: Date.now(), paid: false, status: "waiting", agent: null };
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

  // ✅ Log full incoming payload for debugging
  console.log("🚀 Incoming payload:");
  console.log(JSON.stringify(body, null, 2));

  // Wasender sends messages in body.data.messages.messageBody
  // And the sender in body.data.messages.remoteJid
  const messagesData = body.data && body.data.messages ? body.data.messages : null;

  let text = "";
  let from = "";

  if (messagesData) {
    text = messagesData.messageBody || "";
    from = messagesData.remoteJid || "";
    // Remove the WhatsApp suffix (@s.whatsapp.net) and any non-digits
    from = from.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
  }

  // Log parsed info
  console.log("📨 Parsed:", { from, text });

  if (!text || !from) return res.sendStatus(200); // Ignore if empty

  const lower = text.toLowerCase();

  // Load sessions
  const data = readData();
  data.sessions = data.sessions || {};
  if (!data.sessions[from]) data.sessions[from] = { lastMenu: null, collected: {} };

  /* -------------------
     BOT LOGIC START
  -------------------- */

  // Main menu triggers
  if (/^(hi|hello|menu|start)$/i.test(lower)) {
    data.sessions[from].lastMenu = "main";
    writeData(data);
    await sendText(from, WELCOME_MENU);
    return res.sendStatus(200);
  }

  // Speak to Agent (queue)
  if (/^(8|agent|human|help|talk to an agent)$/i.test(lower)) {
    const job = addToQueue(from, "Speak to Agent", { requestedAt: Date.now() });
    const pos = queuePosition(job.jobId);
    await sendText(from, `🙋‍♂️ You are now in the queue. Your queue number is *${pos}*.\nAn agent will connect soon.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);
  }

  // Top-level menu options
  if (/^1$/i.test(lower)) { 
    data.sessions[from].lastMenu = "new_student"; 
    writeData(data); 
    await sendText(from, NEW_STUDENT_MENU); 
    return res.sendStatus(200); 
  }
  if (/^2$/i.test(lower)) { 
    const job = addToQueue(from, "School Fees Payment"); 
    await sendText(from, msgSchoolFees() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
    return res.sendStatus(200); 
  }
  if (/^3$/i.test(lower)) { 
    const job = addToQueue(from, "Online Courses"); 
    await sendText(from, msgOnlineCourses() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
    return res.sendStatus(200); 
  }
  if (/^4$/i.test(lower)) { 
    const job = addToQueue(from, "JAMB/Admission"); 
    await sendText(from, msgJambAdmission() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
    return res.sendStatus(200); 
  }
  if (/^5$/i.test(lower)) { 
    const job = addToQueue(from, "Typing/Printing"); 
    await sendText(from, msgTypingPrinting() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
    return res.sendStatus(200); 
  }
  if (/^6$/i.test(lower)) { 
    const job = addToQueue(from, "Graphic Design"); 
    await sendText(from, msgGraphicDesign() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
    return res.sendStatus(200); 
  }
  if (/^7$/i.test(lower)) { 
    const job = addToQueue(from, "Web Design"); 
    await sendText(from, msgWebDesign() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
    return res.sendStatus(200); 
  }

  // New Student submenu handling
  if (data.sessions[from].lastMenu === "new_student") {
    if(/^1$/i.test(lower)){ 
      const job = addToQueue(from, "UNICAL Checker Pin", {price:3500}); 
      await sendText(from, msgUnicalCheckerPin() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
      return res.sendStatus(200); 
    }
    if(/^2$/i.test(lower)){ 
      const job = addToQueue(from, "Acceptance Fee"); 
      await sendText(from, msgAcceptanceFee() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
      return res.sendStatus(200); 
    }
    if(/^3$/i.test(lower)){ 
      const job = addToQueue(from, "O'level Verification"); 
      await sendText(from, msgOlevelVerification() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
      return res.sendStatus(200); 
    }
    if(/^4$/i.test(lower)){ 
      const job = addToQueue(from, "Online Screening"); 
      await sendText(from, msgOnlineScreening() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
      return res.sendStatus(200); 
    }
    if(/^5$/i.test(lower)){ 
      const job = addToQueue(from, "Other Documents"); 
      await sendText(from, msgOtherDocuments() + `\nRequest ID: ${job.jobId}\nQueue: ${queuePosition(job.jobId)}`); 
      return res.sendStatus(200); 
    }
  }

  // Payment confirmation
  const paidMatch = lower.match(/^paid\s*(\d+)$/);
  if(paidMatch){
    const jobId = Number(paidMatch[1]);
    const d = readData();
    const job = d.queue.find(j => j.jobId === jobId && j.number === from);
    if(!job){ 
      await sendText(from, `I couldn't find a request with ID ${jobId}.`); 
      return res.sendStatus(200); 
    }
    job.paid = true; 
    writeData(d);
    await sendText(from, `✅ Payment recorded for request ${jobId}. Queue position: ${queuePosition(jobId)}.\n${TESTING_NOTICE}`);
    return res.sendStatus(200);
  }

  // Default fallback
  await sendText(from, `Sorry, I didn't understand. Type *menu* to return to main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
  return res.sendStatus(200);
});

/* ================ ADMIN ENDPOINTS ================ */
function requireAdmin(req,res){ const k=(req.query.key||req.headers['x-admin-key']||"").trim(); if(!k||k!==ADMIN_KEY){res.status(401).json({error:"unauthorized"}); return false;} return true; }

app.get("/admin/queue",(req,res)=>{ if(!requireAdmin(req,res)) return; const d=readData(); const visible=d.queue.filter(j=>["waiting","assigned"].includes(j.status)); res.json({queue:visible,nextJobId:d.nextJobId}); });

app.post("/admin/take",async(req,res)=>{ if(!requireAdmin(req,res)) return; const jobId=Number(req.body.job); const agent=req.body.agent||"Agent"; const d=readData(); const job=d.queue.find(j=>j.jobId===jobId); if(!job) return res.status(404).json({error:"job not found"}); job.status="assigned"; job.agent=agent; writeData(d); await sendText(job.number,`✅ Hi — ${agent} has taken your request (ID ${job.jobId}). You are now connected.`); return res.json({ok:true,job}); });

app.post("/admin/done",async(req,res)=>{ if(!requireAdmin(req,res)) return; const jobId=Number(req.body.job); const d=readData(); const job=d.queue.find(j=>j.jobId===jobId); if(!job) return res.status(404).json({error:"job not found"}); job.status="done"; writeData(d); await sendText(job.number,`✅ Your request (ID ${job.jobId}) has been completed. Thank you for using QuickStop Cyber.`); return res.json({ok:true,job}); });

app.post("/admin/verify_payment",async(req,res)=>{ if(!requireAdmin(req,res)) return; const jobId=Number(req.body.job); const d=readData(); const job=d.queue.find(j=>j.jobId===jobId); if(!job) return res.status(404).json({error:"job not found"}); job.paid=true; writeData(d); await sendText(job.number,`✅ Payment for request ${job.jobId} has been verified.`); return res.json({ok:true,job}); });

/* ================ ROOT ================ */
app.get("/",(req,res)=>{ res.send("QuickStop Cyber WasenderAPI Bot running."); });

app.listen(PORT,()=>console.log(`Bot running on port ${PORT}`));





