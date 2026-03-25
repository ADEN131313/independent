const express = require('express');
const sgMail = require('@sendgrid/mail');
const { body, validationResult } = require('express-validator');
const { protect, apiLimiter } = require('../middleware/auth');
const Task = require('../models/Task');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const router = express.Router();

// Apply API rate limiting
router.use(apiLimiter);

// @route   POST /api/notifications/send-email
// @desc    Send email notification
// @access  Private
router.post('/send-email', [
  protect,
  body('to').isEmail(),
  body('subject').trim().isLength({ min: 1, max: 200 }),
  body('message').trim().isLength({ min: 1, max: 2000 }),
  body('template').optional().isIn(['task_reminder', 'welcome', 'payment_success'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const { to, subject, message, template } = req.body;

    // Check if user has premium subscription for email features
    if (req.user.subscription.plan === 'free') {
      return res.status(403).json({
        error: 'Subscription Required',
        message: 'Email notifications require a premium subscription'
      });
    }

    let emailContent = message;
    let emailSubject = subject;

    // Apply templates
    if (template) {
      const templateData = {
        user: req.user,
        subject: subject,
        message: message
      };

      const result = applyEmailTemplate(template, templateData);
      emailSubject = result.subject;
      emailContent = result.message;
    }

    const msg = {
      to: to,
      from: {
        email: process.env.FROM_EMAIL,
        name: 'Sovereign Task Manager'
      },
      subject: emailSubject,
      html: emailContent,
      trackingSettings: {
        clickTracking: { enable: false },
        openTracking: { enable: true }
      }
    };

    const result = await sgMail.send(msg);

    res.json({
      message: 'Email sent successfully',
      messageId: result[0]?.headers['x-message-id']
    });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      error: 'Notification Service Error',
      message: 'Failed to send email'
    });
  }
});

// @route   POST /api/notifications/task-reminder
// @desc    Send task reminder notification
// @access  Private
router.post('/task-reminder', [
  protect,
  body('taskId').isMongoId(),
  body('type').isIn(['email', 'push']),
  body('scheduledFor').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const { taskId, type, scheduledFor } = req.body;

    // Get task
    const task = await Task.findOne({ _id: taskId, assignee: req.user._id });
    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found'
      });
    }

    if (req.user.subscription.plan === 'free') {
      return res.status(403).json({
        error: 'Subscription Required',
        message: 'Task reminders require a premium subscription'
      });
    }

    // Schedule reminder
    const reminder = {
      type: type,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 24 * 60 * 60 * 1000), // Default: 24 hours from now
      sent: false
    };

    await Task.findByIdAndUpdate(taskId, {
      $push: { 'notifications.reminders': reminder }
    });

    // If immediate send requested and no schedule
    if (!scheduledFor && type === 'email') {
      await sendTaskReminderEmail(req.user, task);
      reminder.sent = true;
      await Task.findByIdAndUpdate(taskId, {
        $set: { 'notifications.reminders.$[elem].sent': true }
      }, {
        arrayFilters: [{ 'elem.scheduledFor': reminder.scheduledFor }]
      });
    }

    res.json({
      message: 'Task reminder scheduled',
      reminder: reminder,
      taskId: taskId
    });
  } catch (error) {
    console.error('Task reminder error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to schedule task reminder'
    });
  }
});

// @route   POST /api/notifications/welcome
// @desc    Send welcome email to new user
// @access  Private (Admin)
router.post('/welcome', [
  protect,
  body('userId').isMongoId(),
  body('customMessage').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  try {
    const { userId, customMessage } = req.body;

    // Only allow sending to own account unless admin
    if (req.user._id.toString() !== userId && req.user.subscription.plan !== 'enterprise') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only send welcome emails to your own account'
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found'
      });
    }

    const welcomeData = {
      user: targetUser,
      customMessage: customMessage || ''
    };

    const result = applyEmailTemplate('welcome', welcomeData);

    const msg = {
      to: targetUser.email,
      from: {
        email: process.env.FROM_EMAIL,
        name: 'Sovereign Task Manager'
      },
      subject: result.subject,
      html: result.message
    };

    await sgMail.send(msg);

    res.json({
      message: 'Welcome email sent successfully'
    });
  } catch (error) {
    console.error('Send welcome email error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to send welcome email'
    });
  }
});

// Helper functions
function applyEmailTemplate(template, data) {
  const templates = {
    task_reminder: {
      subject: `Task Reminder: ${data.task?.title || 'Your Task'}`,
      message: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4285F4;">Task Reminder</h2>
          <p>Hello ${data.user.firstName},</p>
          <p>This is a reminder for your task:</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>${data.task?.title || 'Task Title'}</h3>
            <p>${data.task?.description || 'Task Description'}</p>
            <p><strong>Priority:</strong> ${data.task?.priority || 'Medium'}</p>
            <p><strong>Due:</strong> ${data.task?.dueDate ? new Date(data.task.dueDate).toLocaleDateString() : 'No due date'}</p>
          </div>
          <p>Keep up the great work!</p>
          <p>Best regards,<br>Sovereign Task Manager Team</p>
        </div>
      `
    },
    welcome: {
      subject: `Welcome to Sovereign Task Manager, ${data.user.firstName}!`,
      message: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4285F4;">Welcome to Sovereign Task Manager!</h1>
          <p>Hello ${data.user.firstName},</p>
          <p>Thank you for joining Sovereign Task Manager. We're excited to help you achieve your productivity goals with our AI-powered task management system.</p>

          <h3 style="color: #4285F4;">What you can do:</h3>
          <ul>
            <li>Create and organize tasks with intelligent categorization</li>
            <li>Get AI-powered task suggestions and prioritization</li>
            <li>Track time and analyze productivity patterns</li>
            <li>Receive smart reminders and notifications</li>
            <li>Collaborate with team members (Premium feature)</li>
          </ul>

          ${data.customMessage ? `<p><strong>Personal Note:</strong> ${data.customMessage}</p>` : ''}

          <p>Get started by logging into your account and creating your first task!</p>

          <p>Best regards,<br>The Sovereign Team</p>

          <div style="margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px;">
            <p style="margin: 0;"><strong>Need help?</strong> Contact our support team at support@sovereigntasks.com</p>
          </div>
        </div>
      `
    },
    payment_success: {
      subject: `Payment Successful - Welcome to ${data.plan} Plan!`,
      message: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4CAF50;">Payment Successful! 🎉</h1>
          <p>Hello ${data.user.firstName},</p>
          <p>Thank you for upgrading to the <strong>${data.plan} plan</strong>! Your payment has been processed successfully.</p>

          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
            <h3 style="margin-top: 0; color: #2E7D32;">What's included:</h3>
            <ul style="margin-bottom: 0;">
              ${data.plan === 'premium' ?
                '<li>AI-powered task suggestions</li><li>Advanced analytics</li><li>Email notifications</li><li>Priority support</li>' :
                '<li>All Premium features</li><li>Team collaboration</li><li>Advanced integrations</li><li>API access</li><li>Dedicated support</li>'}
            </ul>
          </div>

          <p>You now have access to all ${data.plan} features. Start exploring!</p>

          <p>Best regards,<br>The Sovereign Team</p>
        </div>
      `
    }
  };

  return templates[template] || { subject: data.subject || 'Notification', message: data.message || 'Message content' };
}

async function sendTaskReminderEmail(user, task) {
  const reminderData = {
    user: user,
    task: task
  };

  const result = applyEmailTemplate('task_reminder', reminderData);

  const msg = {
    to: user.email,
    from: {
      email: process.env.FROM_EMAIL,
      name: 'Sovereign Task Manager'
    },
    subject: result.subject,
    html: result.message
  };

  await sgMail.send(msg);
}

// Background job to process scheduled notifications
setInterval(async () => {
  try {
    const now = new Date();

    // Find tasks with pending reminders
    const tasksWithReminders = await Task.find({
      'notifications.reminders': {
        $elemMatch: {
          sent: false,
          scheduledFor: { $lte: now }
        }
      }
    }).populate('assignee');

    for (const task of tasksWithReminders) {
      const pendingReminders = task.notifications.reminders.filter(
        r => !r.sent && r.scheduledFor <= now
      );

      for (const reminder of pendingReminders) {
        try {
          if (reminder.type === 'email') {
            await sendTaskReminderEmail(task.assignee, task);
          }
          // Add push notification logic here if implemented

          reminder.sent = true;
        } catch (error) {
          console.error('Failed to send reminder:', error);
        }
      }

      await task.save();
    }
  } catch (error) {
    console.error('Reminder processing error:', error);
  }
}, 60000); // Check every minute

module.exports = router;