const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'completed', 'cancelled'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['work', 'personal', 'health', 'finance', 'learning', 'other'],
    default: 'other'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parentTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  subtasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  dueDate: Date,
  completedAt: Date,
  estimatedHours: {
    type: Number,
    min: [0, 'Estimated hours cannot be negative'],
    max: [999, 'Estimated hours cannot exceed 999']
  },
  actualHours: {
    type: Number,
    min: [0, 'Actual hours cannot be negative']
  },
  progress: {
    type: Number,
    min: [0, 'Progress cannot be less than 0'],
    max: [100, 'Progress cannot exceed 100'],
    default: 0
  },
  dependencies: [{
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    type: {
      type: String,
      enum: ['blocks', 'blocked_by', 'related'],
      default: 'related'
    }
  }],
  aiSuggestions: [{
    suggestion: String,
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    applied: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: {
      type: String,
      required: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isAI: {
      type: Boolean,
      default: false
    }
  }],
  timeTracking: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startTime: Date,
    endTime: Date,
    duration: Number, // in minutes
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  notifications: {
    enabled: {
      type: Boolean,
      default: true
    },
    reminders: [{
      type: {
        type: String,
        enum: ['email', 'push'],
        default: 'email'
      },
      scheduledFor: Date,
      sent: {
        type: Boolean,
        default: false
      }
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for completion percentage
taskSchema.virtual('completionPercentage').get(function() {
  if (this.status === 'completed') return 100;
  if (this.status === 'cancelled') return 0;
  return this.progress || 0;
});

// Virtual for overdue status
taskSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === 'completed' || this.status === 'cancelled') {
    return false;
  }
  return new Date() > this.dueDate;
});

// Virtual for total time spent
taskSchema.virtual('totalTimeSpent').get(function() {
  return this.timeTracking.reduce((total, entry) => total + (entry.duration || 0), 0);
});

// Indexes for performance
taskSchema.index({ assignee: 1, status: 1 });
taskSchema.index({ createdBy: 1, createdAt: -1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ tags: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ 'aiSuggestions.applied': 1 });

// Pre-save middleware
taskSchema.pre('save', function(next) {
  // Auto-set completedAt when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }

  // Reset completedAt if status changes from completed
  if (this.isModified('status') && this.status !== 'completed') {
    this.completedAt = undefined;
  }

  next();
});

// Static methods
taskSchema.statics.getTasksByUser = function(userId, filters = {}) {
  const query = { assignee: userId, ...filters };
  return this.find(query).populate('assignee', 'firstName lastName email')
                       .populate('createdBy', 'firstName lastName email')
                       .sort({ createdAt: -1 });
};

taskSchema.statics.getOverdueTasks = function(userId) {
  return this.find({
    assignee: userId,
    dueDate: { $lt: new Date() },
    status: { $nin: ['completed', 'cancelled'] }
  });
};

taskSchema.statics.getTasksByCategory = function(userId, category) {
  return this.find({ assignee: userId, category }).sort({ createdAt: -1 });
};

// Instance methods
taskSchema.methods.addSubtask = function(subtaskId) {
  if (!this.subtasks.includes(subtaskId)) {
    this.subtasks.push(subtaskId);
  }
  return this.save();
};

taskSchema.methods.removeSubtask = function(subtaskId) {
  this.subtasks = this.subtasks.filter(id => !id.equals(subtaskId));
  return this.save();
};

taskSchema.methods.addComment = function(userId, content, isAI = false) {
  this.comments.push({
    user: userId,
    content: content,
    isAI: isAI
  });
  return this.save();
};

taskSchema.methods.startTimeTracking = function(userId, description = '') {
  const existingEntry = this.timeTracking.find(entry =>
    entry.user.equals(userId) && !entry.endTime
  );

  if (existingEntry) {
    throw new Error('Time tracking already active for this user');
  }

  this.timeTracking.push({
    user: userId,
    startTime: new Date(),
    description: description
  });

  return this.save();
};

taskSchema.methods.stopTimeTracking = function(userId) {
  const activeEntry = this.timeTracking.find(entry =>
    entry.user.equals(userId) && !entry.endTime
  );

  if (!activeEntry) {
    throw new Error('No active time tracking found for this user');
  }

  activeEntry.endTime = new Date();
  activeEntry.duration = Math.round((activeEntry.endTime - activeEntry.startTime) / (1000 * 60)); // minutes

  return this.save();
};

module.exports = mongoose.model('Task', taskSchema);