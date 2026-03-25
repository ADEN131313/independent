const User = require('../models/User');

const sendEmail = async (req, res) => {
  try {
    if (!process.env.SENDGRID_API_KEY) return res.status(503).json({ message: 'Email service not configured' });

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const { to, subject, text, templateId, dynamicData } = req.body;
    const msg = { to, from: process.env.SENDGRID_FROM_EMAIL, subject, text, templateId, dynamicTemplateData: dynamicData };

    await sgMail.send(msg);
    res.json({ message: 'Email sent' });
  } catch (error) {
    res.status(500).json({ message: 'Email error' });
  }
};

const sendTaskReminder = async (req, res) => {
  try {
    if (!process.env.SENDGRID_API_KEY) return res.status(503).json({ message: 'Email service not configured' });

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const Task = require('../models/Task');
    const tasks = await Task.find({ assignee: req.user._id, dueDate: { $lte: new Date(Date.now() + 24 * 60 * 60 * 1000), $gt: new Date() }, status: { $ne: 'completed' } });

    if (tasks.length === 0) return res.json({ message: 'No tasks due soon' });

    const msg = {
      to: req.user.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Task Reminder',
      text: `You have ${tasks.length} task(s) due within 24 hours:\n${tasks.map(t => `- ${t.title}`).join('\n')}`
    };

    await sgMail.send(msg);
    res.json({ message: 'Reminder sent', tasksNotified: tasks.length });
  } catch (error) {
    res.status(500).json({ message: 'Email error' });
  }
};

const sendWelcomeEmail = async (user) => {
  try {
    if (!process.env.SENDGRID_API_KEY) return;

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: 'Welcome to Sovereign Task Manager',
      text: `Hi ${user.firstName},\n\nWelcome to Sovereign Task Manager! We're excited to have you on board.`
    };

    await sgMail.send(msg);
  } catch (error) {
    console.error('Welcome email error:', error);
  }
};

module.exports = { sendEmail, sendTaskReminder, sendWelcomeEmail };