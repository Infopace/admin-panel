/**
 * SMTP mailer, currently used only for new-lead notifications
 * (backend/leads/poller.js). Generic transport config (host/port/user/
 * pass) rather than a specific provider's SDK — works with Gmail (app
 * password), Zoho Mail, Office365, or any provider's SMTP endpoint
 * without adding a second library later.
 */

const nodemailer = require('nodemailer');

let cachedTransport = null;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (!isConfigured()) return null;
  if (!cachedTransport) {
    const port = Number(process.env.SMTP_PORT || 587);
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // SMTP over implicit TLS; 587/25 use STARTTLS instead, which nodemailer negotiates automatically when secure is false
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Without these, a blocked/unreachable host (e.g. Office365 refusing
      // Render's IP range) falls back to Node's raw TCP connect timeout —
      // around 2 minutes — per attempt. leads/poller.js retries every
      // pending send on every 5 min sweep, serially, so a dead host would
      // otherwise stall each sweep for minutes instead of failing fast.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return cachedTransport;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const transport = getTransport();
  if (!transport) throw new Error('SMTP_HOST / SMTP_USER / SMTP_PASS are not set in backend/.env.');
  await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, html, text, replyTo });
}

module.exports = { isConfigured, sendMail };
