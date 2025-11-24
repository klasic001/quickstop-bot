/**
 QuickStop Cyber — WasenderAPI Node.js bot
 Fully CommonJS, updated for:
  - School Fees: collect details first, then assign Ticket ID
  - Admin notification after user submits details
  - Job ID issue fixed
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
const PORT = process.env.PORT || 3000;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "2348057703948";
/* ========================================= */

const SEND_MESSAGE_URL = "https://wasenderapi.com/api/send-message";
const DATA_FILE = path.join(__dirname, "data.json");

if (!fs.existsSync(DATA_FILE)) fs.writeJsonSync(DATA_FILE, { queue: [], sessions: {}, nextJobId: 1 }, { spaces: 2 });

function readData() { return fs.readJsonSync(DATA_FILE); }
function writeData(d) { fs.writeJsonSync(DATA_FILE, d, { spaces: 2 }); }

async function sendText(toNumber, text) {
  try {
    const to = ("" + toNumber).replace(/\D/g, "");
    await axios.post(SEND_MESSAGE_URL, { to, text }, { headers: { Authorization: `Bearer ${TOKEN}` } });
    console.log(`✅ Message sent to ${to}: ${text}`);
  } catch (err) {
    console.error("sendText error:", err?.response?.data || err.message);
  }
}

function normalizeNumber(n) { return (n || "").toString().replace(/\D/g, ""); }

/* ================= BOT CONTENT ================= */
const TESTING_NOTICE = "⚠️ Note: This is QuickStop bot and it is currently in a testing phase. If something goes wrong, our team will assist you.";

const WELCOME_MENU = `👋 Welcome to QuickStop Cyber Cafe!
This service supports UNICAL & UICROSS students primarily.
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

const NEW_STUDENT_MENU = `📘 NEW STUDENT REGISTRATION
Choose a service:
1. UNICAL Checker Pin
2. Acceptance Fee
3. O'level Verification
4. Online Screening
5. Others (Attestation, Birth Cert, Cert of Origin)
Reply with the number (e.g. 1).
${TESTING_NOTICE}
`;

function msgSchoolFees() { 
  return `🟦 SCHOOL FEES PAYMENT
Please provide the following details:
- Student Type (Fresh / Returning / Final)
- School (UNICAL / UICROSS)
- Registration / Matric / JAMB Number
- Full Name
- Department
- Level
Send all on separate lines or one message. When done, type *done*.
${TESTING_NOTICE}`; 
}

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
  const messagesData = body.data && body.data.messages ? body.data.messages : null;

  let text = "";
  let fromRaw = "";

  if (messagesData) {
    text = messagesData.messageBody || "";
    fromRaw = messagesData.remoteJid || "";
    fromRaw = fromRaw.replace(/@s\.whatsapp\.net$/, "");
  }

  const from = normalizeNumber(fromRaw);
  if (!text || !from) return res.sendStatus(200);

  const lower = text.trim().toLowerCase();

  // Load sessions
  const data = readData();
  data.sessions = data.sessions || {};
  if (!data.sessions[from]) data.sessions[from] = { lastMenu: null, collected: [], currentJobId: null, meta: {} };

  const isFromAdmin = (from === normalizeNumber(ADMIN_NUMBER));

  /* ------------------- ADMIN / AGENT ------------------- */
  if (isFromAdmin) {
    const parts = text.trim().split(":");
    const cmd = parts[0].toLowerCase();
    const jobId = Number(parts[1]);
    const payload = parts.slice(2).join(":").trim();

    if (["admin","agent"].includes(cmd)) {
      if (!jobId || !payload) {
        await sendText(from, "Invalid format. Use admin:<jobId>:<amount> or agent:<jobId>:<message>");
        return res.sendStatus(200);
      }
      const d = readData();
      const job = d.queue.find(j => j.jobId === jobId);
      if (!job) {
        await sendText(from, `Job ID ${jobId} not found.`);
        return res.sendStatus(200);
      }

      if (cmd === "admin") {
        const feeMsg = `🧾 Fee Update for Ticket ${jobId}\nYour school fee for this session is ₦${payload}.\n\nAccount Name: QuickStop Cyber\nAccount Number: 3002896343\nBank: KUDA\n\nAfter payment, send a screenshot and your details.\n${TESTING_NOTICE}`;
        await sendText(job.number, feeMsg);
        await sendText(from, `✅ Sent fee update to ${job.number} for Ticket ${jobId}.`);
      }

      if (cmd === "agent") {
        if (payload.toLowerCase() === "done" || payload.toLowerCase() === "close") {
          job.status = "done";
          writeData(d);
          await sendText(job.number, `✅ Your request (Ticket ${job.jobId}) has been completed.`);
          await sendText(from, `✅ Ticket ${jobId} closed and user notified.`);
        } else {
          job.details.agentMessages = job.details.agentMessages || [];
          job.details.agentMessages.push({ fromAdmin: from, msg: payload, time: Date.now() });
          writeData(d);
          await sendText(job.number, `💬 Message from our agent:\n${payload}`);
          await sendText(from, `✅ Message sent to ${job.number} for Ticket ${jobId}.`);
        }
      }

      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  }

  /* ------------------- USER BOT LOGIC ------------------- */
  if (/^(hi|hello|menu|start)$/i.test(lower)) {
    data.sessions[from].lastMenu = "main";
    writeData(data);
    await sendText(from, WELCOME_MENU);
    return res.sendStatus(200);
  }

  if (/^2$/i.test(lower)) {
    data.sessions[from].lastMenu = "school_fees";
    data.sessions[from].collected = [];
    writeData(data);
    await sendText(from, msgSchoolFees());
    return res.sendStatus(200);
  }

  /* ------------------- COLLECT DETAILS ------------------- */
  if (data.sessions[from].lastMenu === "school_fees") {
    if (lower === "done") {
      if (!data.sessions[from].collected.length) {
        await sendText(from, "You haven't sent any details yet.");
        return res.sendStatus(200);
      }
      // create job now
      const jobDetails = { messages: data.sessions[from].collected };
      const job = addToQueue(from, "School Fees Payment", jobDetails);
      data.sessions[from].currentJobId = null;
      data.sessions[from].lastMenu = null;
      writeData(data);

      // Notify user
      const pos = queuePosition(job.jobId);
      await sendText(from, `✅ All details received. Ticket ID: ${job.jobId}\nQueue position: ${pos}\nAn admin will review your details and provide the correct fee.\n${TESTING_NOTICE}`);

      // Notify admin
      const adminMsg = `📥 New School Fees Request\nTicket ID: ${job.jobId}\nFrom: ${from}\nDetails:\n${job.details.messages.join("\n")}\n\nReply with admin:${job.jobId}:<amount> to provide the fee.`;
      await sendText(ADMIN_NUMBER, adminMsg);
      return res.sendStatus(200);
    }

    // store incoming detail
    data.sessions[from].collected.push(text);
    writeData(data);
    await sendText(from, `📌 Detail received. Send more or type *done* when finished.`);
    return res.sendStatus(200);
  }

  /* ------------------- DEFAULT FALLBACK ------------------- */
  await sendText(from, `Sorry, I didn't understand. Type *menu* to return to main menu or *8* to speak to an agent.\n${TESTING_NOTICE}`);
  return res.sendStatus(200);
});

/* ------------------- ADMIN HTTP ENDPOINTS ------------------- */
function requireAdmin(req,res){ const k=(req.query.key||req.headers['x-admin-key']||"").trim(); if(!k||k!==ADMIN_KEY){res.status(401).json({error:"unauthorized"}); return false;} return true; }

app.get("/admin/queue",(req,res)=>{ if(!requireAdmin(req,res)) return; const d=readData(); res.json({queue:d.queue,nextJobId:d.nextJobId}); });

app.post("/admin/take",async(req,res)=>{ if(!requireAdmin(req,res)) return; const jobId=Number(req.body.job); const agent=req.body.agent||"Agent"; const d=readData(); const job=d.queue.find(j=>j.jobId===jobId); if(!job) return res.status(404).json({error:"job not found"}); job.status="assigned"; job.agent=agent; writeData(d); await sendText(job.number, `✅ Hi — ${agent} has taken your request (Ticket ${job.jobId}). You are now connected.`); return res.json({ok:true,job}); });

app.post("/admin/done",async(req,res)=>{ if(!requireAdmin(req,res)) return; const jobId=Number(req.body.job); const d=readData(); const job=d.queue.find(j=>j.jobId===jobId); if(!job) return res.status(404).json({error:"job not found"}); job.status="done"; writeData(d); await sendText(job.number, `✅ Your request (Ticket ${job.jobId}) has been completed.`); return res.json({ok:true,job}); });

app.post("/admin/verify_payment",async(req,res)=>{ if(!requireAdmin(req,res)) return; const jobId=Number(req.body.job); const d=readData(); const job=d.queue.find(j=>j.jobId===jobId); if(!job) return res.status(404).json({error:"job not found"}); job.paid=true; writeData(d); await sendText(job.number, `✅ Payment for Ticket ${job.jobId} has been verified.`); return res.json({ok:true,job}); });

/* ------------------- ROOT ------------------- */
app.get("/",(req,res)=>{ res.send("QuickStop Cyber WasenderAPI Bot running."); });

app.listen(PORT,()=>console.log(`Bot running on port ${PORT}`));
