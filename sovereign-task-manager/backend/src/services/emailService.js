const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
  }

  async send(to, subject, text, html = null) {
    if (!process.env.SENDGRID_API_KEY) throw new Error('SendGrid not configured');
    const msg = { to, from: process.env.SENDGRID_FROM_EMAIL, subject, text };
    if (html) msg.html = html;
    return await sgMail.send(msg);
  }

  async sendTemplate(to, templateId, dynamicData) {
    if (!process.env.SENDGRID_API_KEY) throw new Error('SendGrid not configured');
    const msg = { to, from: process.env.SENDGRID_FROM_EMAIL, templateId, dynamicTemplateData: dynamicData };
    return await sgMail.send(msg);
  }

  async sendWelcome(user) {
    return this.send(user.email, 'Welcome to Sovereign Task Manager', `Hi ${user.firstName}, welcome to Sovereign Task Manager!`);
  }

  async sendTaskReminder(user, tasks) {
    const taskList = tasks.map(t => `- ${t.title}`).join('\n');
    return this.send(user.email, 'Task Reminder', `You have ${tasks.length} task(s) due soon:\n${taskList}`);
  }
}

module.exports = new EmailService();