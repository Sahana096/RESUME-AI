import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { matchResumeWithJD } from "./aiMatcher.js";
import crypto from "crypto";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const USERS_FILE = path.join(__dirname, "users.json");

// Initialize users.json if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE));
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

// Auth Endpoints
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password, role, companyName } = req.body;
  const users = getUsers();

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "User already exists" });
  }

  const newUser = { id: Date.now(), name, email, password, role, companyName };
  users.push(newUser);
  saveUsers(users);

  res.status(201).json({
    message: "User created successfully",
    user: { name, email, role, companyName },
    token: `dummy-token-${newUser.id}`
  });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password, role, companyName } = req.body;
  const users = getUsers();

  let user = users.find(u => u.email === email && u.password === password && u.role === role);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials or role" });
  }

  // Extra check for HR: verify company name matches
  if (role === 'hr' && companyName) {
    const normalise = s => (s || '').trim().toLowerCase();
    if (normalise(user.companyName) !== normalise(companyName)) {
      return res.status(401).json({ error: "Company name does not match our records" });
    }
  }

  res.json({
    message: "Login successful",
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName },
    token: `dummy-token-${user.id}`
  });
});

// ── Email transporter (Gmail) ─────────────────────────────────────────────────
// Set your Gmail address and an App Password (not your normal password).
// Generate one at: https://myaccount.google.com/apppasswords
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mohammadsadiq0352@gmail.com',   // your Gmail
    pass: 'rvnontodbhubdgul'          // 16-char App Password
  }
});

app.post("/api/auth/social-login", (req, res) => {
  const { name, email, role, provider } = req.body;
  const users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) {
    // Auto-register
    user = { id: Date.now(), name, email, password: null, role, provider };
    users.push(user);
    saveUsers(users);
  }

  res.json({
    message: "Social login successful",
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName },
    token: `social-token-${user.id}`
  });
});


const otpStore = new Map(); // email -> { code, expires }

app.post("/api/auth/send-otp", async (req, res) => {
  const { email } = req.body;
  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: "No account found with that email." });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });

  console.log(`📧 OTP for ${email}: ${code}`);

  try {
    await transporter.sendMail({
      from: '"HireSmart" <mohammadsadiq0352@gmail.com>',
      to: email,
      subject: 'HireSmart - Password Reset Code',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;background:#0f172a;color:#f1f5f9;padding:40px;border-radius:16px;">
          <h2 style="color:#a5b4fc;margin-bottom:8px;">🎯 HireSmart</h2>
          <h3 style="margin-bottom:20px;">Password Reset Verification</h3>
          <p style="color:#94a3b8;">Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:#1e293b;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#a5b4fc;">${code}</span>
          </div>
          <p style="color:#64748b;font-size:13px;">If you didn't request this, ignore this email.</p>
        </div>
      `
    });
    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("Email send error:", err.message);
    // Still respond OK so flow continues — code is in console
    res.json({ message: "OTP sent (email delivery failed — check server console)", consoleFallback: true });
  }
});

app.post("/api/auth/verify-otp", (req, res) => {
  const { email, code } = req.body;
  const entry = otpStore.get(email);
  if (!entry) return res.status(400).json({ error: "No OTP requested for this email." });
  if (Date.now() > entry.expires) { otpStore.delete(email); return res.status(400).json({ error: "OTP expired." }); }
  if (entry.code !== code) return res.status(400).json({ error: "Incorrect OTP." });
  res.json({ message: "OTP verified" });
});

app.post("/api/auth/reset-password", (req, res) => {
  const { email, code, newPassword } = req.body;
  const entry = otpStore.get(email);
  if (!entry || entry.code !== code) return res.status(400).json({ error: "Invalid or expired OTP." });

  const users = getUsers();
  const idx = users.findIndex(u => u.email === email);
  if (idx === -1) return res.status(404).json({ error: "User not found." });

  users[idx].password = newPassword;
  saveUsers(users);
  otpStore.delete(email);
  res.json({ message: "Password reset successfully." });
});

// ─────────────────────────────────────────────────────────────────────────────
const upload = multer({ dest: "uploads/" });
const RESULTS_FILE = path.join(__dirname, "results.json");

// Helper to generate hash
const calculateHash = (data) => {
  return crypto.createHash('md5').update(data).digest('hex');
};

// Initialize results.json if it doesn't exist
if (!fs.existsSync(RESULTS_FILE)) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify([]));
}

const getResults = () => JSON.parse(fs.readFileSync(RESULTS_FILE));
const saveResult = (result) => {
  const results = getResults();
  results.push({ ...result, timestamp: new Date().toISOString() });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
};

// Get results for a specific user (dummy filter for now)
app.get("/api/results", (req, res) => {
  res.json(getResults());
});

app.post("/analyze", upload.fields([{ name: "resumes" }, { name: "jdFile", maxCount: 1 }]), async (req, res) => {
  try {
    const { userId } = req.body;
    let { jobDescription } = req.body;
    const resumes = req.files["resumes"];
    const jdFileArray = req.files["jdFile"];

    if (!resumes || resumes.length === 0) {
      return res.status(400).json({ error: "No resumes uploaded." });
    }

    // Handle JD File if provided and no text JD
    if (jdFileArray && jdFileArray.length > 0 && (!jobDescription || jobDescription.trim().length < 10)) {
      const jdFile = jdFileArray[0];
      try {
        if (jdFile.mimetype === "application/pdf") {
          const dataBuffer = fs.readFileSync(jdFile.path);
          const pdfData = await pdf(dataBuffer);
          jobDescription = pdfData.text;
        } else if (jdFile.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || jdFile.originalname.endsWith(".docx")) {
          const result = await mammoth.extractRawText({ path: jdFile.path });
          jobDescription = result.value;
        } else {
          jobDescription = fs.readFileSync(jdFile.path, "utf8");
        }
      } catch (err) {
        console.error("Error parsing JD file:", err.message);
      } finally {
        // ALWAYS cleanup JD file
        if (fs.existsSync(jdFile.path)) {
          try { fs.unlinkSync(jdFile.path); } catch(e) {}
        }
      }
    }

    if (!jobDescription || jobDescription.trim().length < 10) {
      return res.status(400).json({ error: "Valid job description or JD file is required." });
    }

    const analysisResults = [];
    const jdHash = calculateHash(jobDescription);

    for (const file of resumes) {
      const filePath = file.path;
      let text = "";

      try {
        if (file.mimetype === "application/pdf") {
          const dataBuffer = fs.readFileSync(filePath);
          try {
            const pdfData = await pdf(dataBuffer);
            text = pdfData.text;
          } catch (pdfErr) {
            console.warn(`PDF Parsing Warning for ${file.originalname}:`, pdfErr.message);
            // DESPERATE FALLBACK: Try to salvage text strings from corrupted streams
            const raw = dataBuffer.toString('binary');
            const matches = raw.match(/\((.*?)\)/g);
            if (matches && matches.length > 10) {
              text = matches.map(m => m.slice(1, -1)).join(' ').replace(/\\/g, '');
              console.log(`Successfully salvaged ${text.length} chars from ${file.originalname} via regex fallback.`);
            } else {
              throw new Error(`PDF data is corrupted or unreadable (${pdfErr.message})`);
            }
          }
        } else if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.originalname.endsWith(".docx")) {
          const result = await mammoth.extractRawText({ path: filePath });
          text = result.value;
        } else {
          text = fs.readFileSync(filePath, "utf8");
        }

        if (!text || text.trim().length < 10) {
          throw new Error("Could not extract enough text from resume.");
        }

        const resumeHash = calculateHash(text);

        // Cache Lookup
        const existingResults = getResults();
        const cachedResult = existingResults.find(r => r.resumeHash === resumeHash && r.jdHash === jdHash);

        if (cachedResult && cachedResult.candidateName) {
          console.log(`Cache Hit for ${file.originalname}`);
          analysisResults.push({ ...cachedResult, fileName: file.originalname }); // Keep original filename
          continue;
        }

        const matchResult = matchResumeWithJD(text, jobDescription);
        
        if (!matchResult.candidateName) {
           console.log(`[DEBUG] Failed to extract name from ${file.originalname}. Text preview: "${text.slice(0, 100).replace(/\n/g, ' ')}..."`);
        } else {
           console.log(`[DEBUG] Extracted name: "${matchResult.candidateName}" for ${file.originalname}`);
        }

        const resultData = {
          fileName: file.originalname,
          userId: userId || "anonymous",
          resumeHash,
          jdHash,
          ...matchResult
        };

        analysisResults.push(resultData);
        saveResult(resultData);
      } catch (fileErr) {
        console.error(`Error processing file ${file.originalname}:`, fileErr.message);
        analysisResults.push({
          fileName: file.originalname,
          error: fileErr.message
        });
      } finally {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error(`Failed to cleanup ${file.originalname}:`, unlinkErr.message);
        }
      }
    }

    res.json(analysisResults);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze resumes." });
  }
});

app.listen(5000, () => console.log("Backend running on http://localhost:5000"));