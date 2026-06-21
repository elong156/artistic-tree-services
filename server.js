/**
 * Artistic Tree Services – Backend Server
 * Node.js + Express + SQLite
 *
 * Setup:
 *   npm install
 *   node server.js
 *
 * Then open: http://localhost:3000
 * Admin panel: http://localhost:3000/admin.html
 */

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────
// DATABASE
// ──────────────────────────────────────────
const db = new Database(path.join(__dirname, 'artistic_tree.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,          -- 'contact' | 'quote' | 'booking'
    name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    service TEXT,
    date TEXT,
    time TEXT,
    message TEXT,
    details TEXT,
    notes TEXT,
    status TEXT DEFAULT 'new',   -- 'new' | 'contacted' | 'scheduled' | 'completed' | 'cancelled'
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
`);

// Seed default admin (username: admin, password: treesrule2024)
// Change this password immediately in production!
const DEFAULT_ADMIN = 'admin';
const DEFAULT_PASSWORD = 'treesrule2024';
const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(DEFAULT_ADMIN);
if (!existing) {
  const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(DEFAULT_ADMIN, hash);
  console.log(`Admin created → username: ${DEFAULT_ADMIN} | password: ${DEFAULT_PASSWORD}`);
  console.log('⚠️  Change this password in production via POST /admin/change-password');
}

// ──────────────────────────────────────────
// MIDDLEWARE
// ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.use(session({
  secret: process.env.SESSION_SECRET || 'artistic-tree-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// ──────────────────────────────────────────
// EMAIL (optional – configure in .env or below)
// ──────────────────────────────────────────
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'your@email.com';
const EMAIL_USER     = process.env.EMAIL_USER     || '';
const EMAIL_PASS     = process.env.EMAIL_PASS     || '';

const transporter = EMAIL_USER ? nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
}) : null;

async function sendNotification(submission) {
  if (!transporter) return; // Email not configured — skip
  const subject = {
    contact: '📬 New Contact Message',
    quote:   '🌿 New Quote Request',
    booking: '📅 New Booking Request'
  }[submission.type] || '📩 New Submission';

  const body = Object.entries(submission)
    .filter(([k]) => !['id'].includes(k))
    .map(([k, v]) => `<b>${k}:</b> ${v || '—'}`)
    .join('<br>');

  try {
    await transporter.sendMail({
      from: `"Artistic Tree Services" <${EMAIL_USER}>`,
      to: BUSINESS_EMAIL,
      subject,
      html: `<h2>New Submission from Website</h2><p>${body}</p>`
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

// ──────────────────────────────────────────
// PUBLIC ROUTES
// ──────────────────────────────────────────

// Form submission (contact / quote / booking)
app.post('/api/submit', (req, res) => {
  const { type, name, phone, email, address, service, date, time, message, details, notes } = req.body;
  const allowed = ['contact', 'quote', 'booking'];
  if (!allowed.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

  const stmt = db.prepare(`
    INSERT INTO submissions (type, name, phone, email, address, service, date, time, message, details, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(type, name, phone, email || null, address || null, service || null,
                          date || null, time || null, message || null, details || null, notes || null);

  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(result.lastInsertRowid);
  sendNotification(submission).catch(() => {});

  res.json({ success: true, id: result.lastInsertRowid });
});

// ──────────────────────────────────────────
// ADMIN AUTH
// ──────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.adminId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.adminId = admin.id;
  req.session.adminUsername = admin.username;
  res.json({ success: true });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/admin/me', requireAuth, (req, res) => {
  res.json({ username: req.session.adminUsername });
});

app.post('/admin/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, admin.id);
  res.json({ success: true });
});

// ──────────────────────────────────────────
// ADMIN DATA ROUTES
// ──────────────────────────────────────────

// Get all submissions with optional filters
app.get('/admin/submissions', requireAuth, (req, res) => {
  const { type, status, search, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM submissions WHERE 1=1';
  const params = [];

  if (type)   { query += ' AND type = ?';   params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (search) {
    query += ' AND (name LIKE ? OR phone LIKE ? OR address LIKE ? OR email LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as n FROM submissions').get().n;
  res.json({ submissions: rows, total });
});

// Single submission
app.get('/admin/submissions/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// Update submission status
app.patch('/admin/submissions/:id', requireAuth, (req, res) => {
  const { status } = req.body;
  const allowed = ['new', 'contacted', 'scheduled', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// Delete submission
app.delete('/admin/submissions/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Dashboard stats
app.get('/admin/stats', requireAuth, (req, res) => {
  const total    = db.prepare("SELECT COUNT(*) as n FROM submissions").get().n;
  const newCount = db.prepare("SELECT COUNT(*) as n FROM submissions WHERE status = 'new'").get().n;
  const today    = db.prepare("SELECT COUNT(*) as n FROM submissions WHERE date(created_at) = date('now','localtime')").get().n;
  const byType   = db.prepare("SELECT type, COUNT(*) as n FROM submissions GROUP BY type").all();
  const byStatus = db.prepare("SELECT status, COUNT(*) as n FROM submissions GROUP BY status").all();
  res.json({ total, new: newCount, today, byType, byStatus });
});

// ──────────────────────────────────────────
// START
// ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌳 Artistic Tree Services server running at http://localhost:${PORT}`);
  console.log(`   Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`   Admin login: ${DEFAULT_ADMIN} / ${DEFAULT_PASSWORD}\n`);
});
