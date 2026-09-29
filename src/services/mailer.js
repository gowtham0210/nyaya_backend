const nodemailer = require('nodemailer');
const { nodeEnv, smtp } = require('../config/env');
const logger = require('../utils/logger');

const transporter = smtp.host
  ? nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
    })
  : null;

async function sendMail({ to, subject, text, devLogLabel }) {
  if (!transporter) {
    if (nodeEnv === 'production') {
      throw new Error('SMTP is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASSWORD');
    }

    logger.warn({ to, devLogLabel, text }, 'SMTP not configured; logging email instead of sending it');
    return;
  }

  await transporter.sendMail({ from: smtp.from, to, subject, text });
}

async function sendPasswordResetCode(email, code) {
  await sendMail({
    to: email,
    subject: 'Your Nyaya password reset code',
    text: `Your Nyaya password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
    devLogLabel: 'password-reset-code',
  });
}

async function sendVerificationCode(email, code) {
  await sendMail({
    to: email,
    subject: 'Verify your Nyaya email address',
    text: `Your Nyaya email verification code is ${code}. It expires in 15 minutes. If you did not create this account, you can ignore this email.`,
    devLogLabel: 'email-verification-code',
  });
}

module.exports = {
  sendPasswordResetCode,
  sendVerificationCode,
};
