const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Import database adapters
const db1 = require('./adapters/db1');
const db2 = require('./adapters/db2');
const db3 = require('./adapters/db3');
const db4 = require('./adapters/db4');
const db5 = require('./adapters/db5');

const ADAPTERS = { db1, db2, db3, db4, db5 };

// Database configurations (can be overwritten via config API or .env)
let dbConfig = {
  db1: { url: process.env.SUPABASE_URL_1 || '', key: process.env.SUPABASE_KEY_1 || '' },
  db2: { url: process.env.SUPABASE_URL_2 || '', key: process.env.SUPABASE_KEY_2 || '' },
  db3: { url: process.env.SUPABASE_URL_3 || '', key: process.env.SUPABASE_KEY_3 || '' },
  db4: { url: process.env.SUPABASE_URL_4 || '', key: process.env.SUPABASE_KEY_4 || '' },
  db5: { url: process.env.SUPABASE_URL_5 || '', key: process.env.SUPABASE_KEY_5 || '' }
};

// Cached Supabase clients
const clients = {};

function getSupabaseClient(dbId) {
  const cfg = dbConfig[dbId];
  if (!cfg || !cfg.url || !cfg.key) {
    return null; // Fall back to mock mode
  }
  
  const cacheKey = `${dbId}-${cfg.url}`;
  if (!clients[cacheKey]) {
    try {
      clients[cacheKey] = createClient(cfg.url, cfg.key);
    } catch (e) {
      console.error(`Failed to create client for ${dbId}:`, e.message);
      return null;
    }
  }
  return clients[cacheKey];
}

const JWT_SECRET = process.env.JWT_SECRET || 'aegis-portal-super-secret-key-12345';
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure users.json exists
if (!fs.existsSync(USERS_FILE)) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, '[]', 'utf8');
}

function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading users file:', err);
    return [];
  }
}

function writeUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing users file:', err);
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// Auth Routes (unprotected)
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  
  const users = readUsers();
  const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'User with this email already exists.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = {
    id: Date.now().toString(),
    email: email.toLowerCase(),
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsers(users);

  const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '24h' });
  res.status(201).json({ success: true, token, email: newUser.email });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, email: user.email });
});

// Protect all subsequent endpoints
app.use(authenticateToken);

// Get dashboard configuration and connection status
app.get('/api/status', (req, res) => {
  const status = {};
  for (const dbId of ['db1', 'db2', 'db3', 'db4', 'db5']) {
    const cfg = dbConfig[dbId];
    const hasConfig = !!(cfg && cfg.url && cfg.key);
    const client = getSupabaseClient(dbId);
    status[dbId] = {
      name: ADAPTERS[dbId].metadata.name,
      description: ADAPTERS[dbId].metadata.description,
      configured: hasConfig,
      connectionOk: hasConfig && client !== null,
      mode: hasConfig && client !== null ? 'live' : 'mock'
    };
  }
  res.json(status);
});

// Update configurations at runtime
app.post('/api/config', (req, res) => {
  const { dbId, url, key } = req.body;
  if (!dbConfig[dbId]) {
    return res.status(400).json({ error: 'Invalid database identifier. Must be db1 - db5.' });
  }
  dbConfig[dbId] = { url, key };
  res.json({ success: true, message: `Updated configuration for ${dbId}.` });
});

// Reset configurations
app.post('/api/config/reset', (req, res) => {
  dbConfig = {
    db1: { url: process.env.SUPABASE_URL_1 || '', key: process.env.SUPABASE_KEY_1 || '' },
    db2: { url: process.env.SUPABASE_URL_2 || '', key: process.env.SUPABASE_KEY_2 || '' },
    db3: { url: process.env.SUPABASE_URL_3 || '', key: process.env.SUPABASE_KEY_3 || '' },
    db4: { url: process.env.SUPABASE_URL_4 || '', key: process.env.SUPABASE_KEY_4 || '' },
    db5: { url: process.env.SUPABASE_URL_5 || '', key: process.env.SUPABASE_KEY_5 || '' }
  };
  res.json({ success: true, message: 'Reset configurations to environment variables.' });
});

// Aggregate overview statistics across all 5 databases
app.get('/api/overview', async (req, res) => {
  try {
    const overview = [];
    for (const dbId of ['db1', 'db2', 'db3', 'db4', 'db5']) {
      const adapter = ADAPTERS[dbId];
      const client = getSupabaseClient(dbId);
      
      let candidates = [];
      let isMock = false;

      if (client) {
        try {
          candidates = await adapter.getCandidates(client);
        } catch (err) {
          console.warn(`Query failed for ${dbId}, falling back to mock data. Error:`, err.message);
          candidates = adapter.getMockCandidates();
          isMock = true;
        }
      } else {
        candidates = adapter.getMockCandidates();
        isMock = true;
      }

      const totalCount = candidates.length;
      const avgScore = totalCount > 0 
        ? Math.round(candidates.reduce((sum, c) => sum + (c.score / c.maxScore) * 100, 0) / totalCount)
        : 0;

      overview.push({
        id: dbId,
        name: adapter.metadata.name,
        description: adapter.metadata.description,
        totalTestTakers: totalCount,
        averageScorePercentage: avgScore,
        mode: isMock ? 'mock' : 'live'
      });
    }

    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch candidate list for a specific database
app.get('/api/assessments/:dbId/candidates', async (req, res) => {
  const { dbId } = req.params;
  const adapter = ADAPTERS[dbId];
  if (!adapter) {
    return res.status(400).json({ error: 'Invalid database identifier.' });
  }

  const client = getSupabaseClient(dbId);
  try {
    let candidates = [];
    let isMock = false;
    
    if (client) {
      try {
        candidates = await adapter.getCandidates(client);
      } catch (err) {
        console.warn(`Query failed for ${dbId}, falling back to mock.`, err.message);
        candidates = adapter.getMockCandidates();
        isMock = true;
      }
    } else {
      candidates = adapter.getMockCandidates();
      isMock = true;
    }

    res.json({
      assessmentName: adapter.metadata.name,
      mode: isMock ? 'mock' : 'live',
      candidates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch detailed answers for a specific candidate in a database
app.get('/api/assessments/:dbId/candidates/:candidateId', async (req, res) => {
  const { dbId, candidateId } = req.params;
  const adapter = ADAPTERS[dbId];
  if (!adapter) {
    return res.status(400).json({ error: 'Invalid database identifier.' });
  }

  const client = getSupabaseClient(dbId);
  try {
    let details;
    if (client && !candidateId.startsWith('db')) { // Mock candidate IDs start with 'db'
      try {
        details = await adapter.getCandidateDetails(client, candidateId);
      } catch (err) {
        console.warn(`Query failed for details of ${candidateId} in ${dbId}, falling back to mock.`, err.message);
        details = adapter.getMockCandidateDetails(candidateId);
      }
    } else {
      details = adapter.getMockCandidateDetails(candidateId);
    }
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate PDF Report for a Candidate
app.get('/api/assessments/:dbId/candidates/:candidateId/pdf', async (req, res) => {
  const { dbId, candidateId } = req.params;
  const adapter = ADAPTERS[dbId];
  if (!adapter) {
    return res.status(400).json({ error: 'Invalid database identifier.' });
  }

  const client = getSupabaseClient(dbId);
  let details;
  try {
    if (client && !candidateId.startsWith('db')) {
      try {
        details = await adapter.getCandidateDetails(client, candidateId);
      } catch (err) {
        details = adapter.getMockCandidateDetails(candidateId);
      }
    } else {
      details = adapter.getMockCandidateDetails(candidateId);
    }

    const { personalInfo, results } = details;

    // A. Check if there is a pre-generated PDF URL in the candidate details (e.g. Founder Compatibility database)
    if (personalInfo.pdfUrl) {
      try {
        console.log(`Downloading pre-generated PDF from URL: ${personalInfo.pdfUrl}`);
        const pdfRes = await fetch(personalInfo.pdfUrl);
        if (pdfRes.ok) {
          const arrayBuffer = await pdfRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=${personalInfo.name.replace(/\s+/g, '_')}_Result.pdf`);
          res.send(buffer);
          return;
        } else {
          console.warn(`Failed to download PDF from URL: ${personalInfo.pdfUrl}, status: ${pdfRes.status}`);
        }
      } catch (err) {
        console.error(`Error downloading pre-generated PDF:`, err.message);
      }
    }

    // 1. Try to fetch existing dashboard export image from cii_dashboard_exports
    let dashboardImageBuffer = null;
    if (client && personalInfo.sessionId) {
      try {
        const { data: exports, error: expError } = await client
          .from('cii_dashboard_exports')
          .select('file_url')
          .eq('session_id', personalInfo.sessionId)
          .limit(1);

        if (!expError && exports && exports.length > 0) {
          const imageUrl = exports[0].file_url;
          console.log(`Fetching dashboard export image: ${imageUrl}`);
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const arrayBuffer = await imgRes.arrayBuffer();
            dashboardImageBuffer = Buffer.from(arrayBuffer);
          } else {
            console.warn(`Failed to fetch image from URL: ${imageUrl}, status: ${imgRes.status}`);
          }
        }
      } catch (err) {
        console.warn(`Error trying to get dashboard image export:`, err.message);
      }
    }

    // 2. Or check if the candidate details returned a direct screenshot URL (e.g. DB4 submissions screenshot)
    if (!dashboardImageBuffer && personalInfo.screenshotUrl) {
      try {
        console.log(`Fetching direct screenshot URL: ${personalInfo.screenshotUrl}`);
        const imgRes = await fetch(personalInfo.screenshotUrl);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          dashboardImageBuffer = Buffer.from(arrayBuffer);
        } else {
          console.warn(`Failed to fetch direct screenshot from URL: ${personalInfo.screenshotUrl}, status: ${imgRes.status}`);
        }
      } catch (err) {
        console.warn(`Error trying to get direct screenshot URL:`, err.message);
      }
    }

    // Stream PDF to the client
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${personalInfo.name.replace(/\s+/g, '_')}_Result.pdf`);

    if (dashboardImageBuffer) {
      // Create a PDF with zero margins to fit the PNG dashboard export
      const doc = new PDFDocument({ margin: 0, bufferPages: true });
      doc.pipe(res);

      // Embed the image centered or full-width (width of letter page is 612 pt)
      doc.image(dashboardImageBuffer, 0, 0, { width: 612 });
      doc.end();
      return;
    }

    // --- FALLBACK: Text PDF Generation ---
    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    doc.pipe(res);

    // Title / Header Banner
    doc.rect(0, 0, 612, 100).fill('#1f2937');
    doc.fillColor('#ffffff')
       .fontSize(22)
       .font('Helvetica-Bold')
       .text('ASSESSMENT REPORT', 50, 35);
    
    doc.fontSize(12)
       .font('Helvetica')
       .text(adapter.metadata.name.toUpperCase(), 50, 65);

    // Personal Info Panel
    doc.fillColor('#111827')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Candidate Profile', 50, 130);

    doc.rect(50, 155, 512, 85).fill('#f3f4f6');
    
    doc.fillColor('#374151')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('Name:', 70, 170)
       .font('Helvetica')
       .text(personalInfo.name, 140, 170);

    doc.font('Helvetica-Bold')
       .text('Email:', 70, 190)
       .font('Helvetica')
       .text(personalInfo.email, 140, 190);

    doc.font('Helvetica-Bold')
       .text('Test Date:', 70, 210)
       .font('Helvetica')
       .text(new Date(personalInfo.testDate).toLocaleString(), 140, 210);

    // Score Summary
    const pct = Math.round((personalInfo.score / personalInfo.maxScore) * 100);
    doc.rect(400, 170, 140, 55).stroke('#d1d5db');
    doc.font('Helvetica-Bold')
       .fontSize(9)
       .text('FINAL SCORE', 410, 178, { width: 120, align: 'center' });
    
    doc.fontSize(18)
       .fillColor('#10b981')
       .text(`${personalInfo.score} / ${personalInfo.maxScore} (${pct}%)`, 410, 195, { width: 120, align: 'center' });

    // Question & Answers Section
    doc.fillColor('#111827')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Detailed Responses', 50, 265);

    let currentY = 295;

    results.forEach((item, index) => {
      // Check if we need a new page
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      // Question header
      doc.fillColor('#374151')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text(`Question ${index + 1}: ${item.question}`, 50, currentY, { width: 512 });

      currentY += doc.heightOfString(`Question ${index + 1}: ${item.question}`, { width: 512 }) + 5;

      // Answer block
      doc.rect(50, currentY, 512, doc.heightOfString(item.answer, { width: 492 }) + 16).fill('#f9fafb');
      
      doc.fillColor('#1f2937')
         .fontSize(10)
         .font('Helvetica')
         .text(item.answer, 60, currentY + 8, { width: 492 });

      currentY += doc.heightOfString(item.answer, { width: 492 }) + 18;

      // Question Score
      doc.fillColor('#6b7280')
         .fontSize(9)
         .font('Helvetica-Bold')
         .text(`Points: ${item.score} / ${item.maxScore}`, 50, currentY, { align: 'right', width: 512 });

      currentY += 25;
      
      // Draw horizontal line separator
      doc.moveTo(50, currentY - 10).lineTo(562, currentY - 10).strokeColor('#e5e7eb').stroke();
    });

    // Add footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.rect(0, 770, 612, 22).fill('#f3f4f6');
      doc.fillColor('#9ca3af')
         .fontSize(8)
         .text(`Page ${i + 1} of ${pages.count}  |  Assessment Dashboard PDF Service`, 50, 777, { align: 'center', width: 512 });
    }

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
