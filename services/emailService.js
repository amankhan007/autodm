const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #1a1a1a; border-radius: 16px; overflow: hidden; border: 1px solid #2a2a2a; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; }
    .body { padding: 32px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .otp { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #8b5cf6; text-align: center; padding: 20px; background: #111; border-radius: 8px; margin: 16px 0; }
    .footer { padding: 20px 32px; border-top: 1px solid #2a2a2a; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ InstaFlow</h1>
      <p>Instagram Automation Platform</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} InstaFlow. All rights reserved.<br>This email was sent to you because you have an account with InstaFlow.</div>
  </div>
</body>
</html>`;

const send = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'InstaFlow <noreply@instaflow.io>',
      to, subject, html
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    logger.error(`Email failed to ${to}:`, error.message);
    throw error;
  }
};

exports.sendVerificationEmail = async (email, name, token) => {
  const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  await send(email, 'Verify your InstaFlow account', baseTemplate(`
    <h2 style="color:#e0e0e0">Welcome, ${name}! 👋</h2>
    <p>Thanks for signing up. Please verify your email to get started.</p>
    <div style="text-align:center"><a href="${url}" class="btn">Verify Email</a></div>
    <p style="color:#666;font-size:13px">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
  `));
};

exports.sendOTPEmail = async (email, name, otp) => {
  await send(email, 'Your InstaFlow OTP', baseTemplate(`
    <h2 style="color:#e0e0e0">Password Reset OTP</h2>
    <p>Hi ${name}, use the OTP below to reset your password:</p>
    <div class="otp">${otp}</div>
    <p style="color:#666;font-size:13px">This OTP expires in 10 minutes. Never share it with anyone.</p>
  `));
};

exports.sendPaymentConfirmation = async (email, name, { amount, currency, periodEnd }) => {
  await send(email, '✅ Subscription Activated — InstaFlow', baseTemplate(`
    <h2 style="color:#e0e0e0">Payment Confirmed!</h2>
    <p>Hi ${name}, your InstaFlow Pro subscription is now active.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;color:#888">Amount Paid</td><td style="padding:8px;color:#e0e0e0;font-weight:600">${currency} ${amount}</td></tr>
      <tr><td style="padding:8px;color:#888">Plan</td><td style="padding:8px;color:#e0e0e0;font-weight:600">InstaFlow Pro (Monthly)</td></tr>
      <tr><td style="padding:8px;color:#888">Valid Until</td><td style="padding:8px;color:#e0e0e0;font-weight:600">${new Date(periodEnd).toLocaleDateString('en-IN', { dateStyle: 'long' })}</td></tr>
    </table>
    <div style="text-align:center"><a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Go to Dashboard</a></div>
  `));
};

exports.sendDmAlertEmail = async (email, name, stats) => {
  await send(email, `📊 InstaFlow Daily Report`, baseTemplate(`
    <h2 style="color:#e0e0e0">Daily Activity Report</h2>
    <p>Hi ${name}, here's what happened today:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:10px;color:#888">Comments Received</td><td style="padding:10px;color:#e0e0e0;font-weight:700">${stats.comments}</td></tr>
      <tr><td style="padding:10px;color:#888">DMs Sent</td><td style="padding:10px;color:#22c55e;font-weight:700">${stats.sent}</td></tr>
      <tr><td style="padding:10px;color:#888">Failed</td><td style="padding:10px;color:#ef4444;font-weight:700">${stats.failed}</td></tr>
      <tr><td style="padding:10px;color:#888">Conversion Rate</td><td style="padding:10px;color:#8b5cf6;font-weight:700">${stats.rate}%</td></tr>
    </table>
    <div style="text-align:center"><a href="${process.env.FRONTEND_URL}/dashboard" class="btn">View Full Report</a></div>
  `));
};
