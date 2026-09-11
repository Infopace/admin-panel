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
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return cachedTransport;
}

async function sendMail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) throw new Error('SMTP_HOST / SMTP_USER / SMTP_PASS are not set in backend/.env.');
  await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, html, text });
}

module.exports = { isConfigured, sendMail };
