const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const Task = require('../models/Task');
const { protect, checkOwnership, apiLimiter, authorize } = require('../middleware/auth');

const router = express.Router();

// Apply API rate limiting to all routes
router.use(apiLimiter);

// @route   GET /api/tasks
// @desc    Get all tasks for user
// @access  Private
router.get('/', protect, [
  query('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('category').optional().isIn(['work', 'personal', 'health', 'finance', 'learning', 'other']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('sortBy').optional().isIn(['createdAt', 'dueDate', 'priority', 'title']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        details: errors.array()
      });
    }

    const {
      status,
      priority,
      category,
      limit = 20,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const userId = req.user._id;

    // Build filter
    const filter = { assignee: userId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get tasks
    const tasks = await Task.find(filter)
      .populate('assignee', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('parentTask', 'title status')
      .populate('subtasks', 'title status priority')
      .populate('dependencies.task', 'title status priority')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Task.countDocuments(filter);

    res.json({
      tasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        status,
        priority,
        category
      }
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve tasks'
    });
  }
});

// @route   GET /api/tasks/overdue
// @desc    Get overdue tasks
// @access  Private
router.get('/overdue', protect, async (req, res) => {
  try {
    const overdueTasks = await Task.getOverdueTasks(req.user._id);
    res.json({ tasks: overdueTasks });
  } catch (error) {
    console.error('Get overdue tasks error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve overdue tasks'
    });
  }
});

// @route   GET /api/tasks/stats
// @desc    Get task statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Task.aggregate([
      { $match: { assignee: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          todo: {
            $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          review: {
            $sum: { $cond: [{ $eq: ['$status', 'review'] }, 1, 0] }
          },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', 'completed'] },
                    { $ne: ['$status', 'cancelled'] },
                    { $lt: ['$dueDate', new Date()] },
                    { $ne: ['$dueDate', null] }
                  ]
                },
                1,
                0
              ]
            }
          },
          byPriority: {
            $push: '$priority'
          },
          byCategory: {
            $push: '$category'
          }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.json({
        total: 0,
        completed: 0,
        todo: 0,
        inProgress: 0,
        review: 0,
        overdue: 0,
        completionRate: 0,
        priorityBreakdown: {},
        categoryBreakdown: {}
      });
    }

    const data = stats[0];
    const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0;

    // Calculate breakdowns
    const priorityBreakdown = {};
    const categoryBreakdown = {};

    ['low', 'medium', 'high', 'urgent'].forEach(priority => {
      priorityBreakdown[priority] = data.byPriority.filter(p => p === priority).length;
    });

    ['work', 'personal', 'health', 'finance', 'learning', 'other'].forEach(category => {
      categoryBreakdown[category] = data.byCategory.filter(c => c === category).length;
    });

    res.json({
      total: data.total,
      completed: data.completed,
      todo: data.todo,
      inProgress: data.inProgress,
      review: data.review,
      overdue: data.overdue,
      completionRate: Math.round(completionRate * 100) / 100,
      priorityBreakdown,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve task statistics'
    });
  }
});

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post('/', [
  protect,
  body('title').trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('category').optional().isIn(['work', 'personal', 'health', 'finance', 'learning', 'other']),
  body('tags').optional().isArray(),
  body('dueDate').optional().isISO8601(),
  body('estimatedHours').optional().isInt({ min: 0, max: 999 }),
  body('parentTask').optional().isMongoId()
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

    const taskData = {
      ...req.body,
      assignee: req.user._id,
      createdBy: req.user._id
    };

    // Handle parent task relationship
    if (taskData.parentTask) {
      const parentTask = await Task.findById(taskData.parentTask);
      if (!parentTask) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Parent task not found'
        });
      }
      if (!parentTask.assignee.equals(req.user._id)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot create subtask for task you do not own'
        });
      }
    }

    const task = await Task.create(taskData);

    // Add to parent's subtasks if applicable
    if (taskData.parentTask) {
      await Task.findByIdAndUpdate(taskData.parentTask, {
        $push: { subtasks: task._id }
      });
    }

    // Update user stats
    req.user.stats.tasksCreated += 1;
    await req.user.save();

    await task.populate([
      { path: 'assignee', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'parentTask', select: 'title status' }
    ]);

    res.status(201).json({
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Task creation failed'
    });
  }
});

// @route   GET /api/tasks/:id
// @desc    Get single task
// @access  Private
router.get('/:id', [
  protect,
  param('id').isMongoId()
], checkOwnership(Task), async (req, res) => {
  try {
    await req.resource.populate([
      { path: 'assignee', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'parentTask', select: 'title status priority' },
      { path: 'subtasks', select: 'title status priority dueDate' },
      { path: 'dependencies.task', select: 'title status priority' },
      { path: 'comments.user', select: 'firstName lastName' }
    ]);

    res.json({ task: req.resource });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to retrieve task'
    });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', [
  protect,
  param('id').isMongoId(),
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('category').optional().isIn(['work', 'personal', 'health', 'finance', 'learning', 'other']),
  body('tags').optional().isArray(),
  body('dueDate').optional().isISO8601(),
  body('estimatedHours').optional().isInt({ min: 0, max: 999 }),
  body('actualHours').optional().isInt({ min: 0 }),
  body('progress').optional().isInt({ min: 0, max: 100 })
], checkOwnership(Task), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Please check your input',
        details: errors.array()
      });
    }

    const updates = req.body;
    const task = req.resource;

    // Track completion for stats
    const wasCompleted = task.status === 'completed';
    const willBeCompleted = updates.status === 'completed';

    Object.assign(task, updates);
    await task.save();

    // Update user stats
    if (!wasCompleted && willBeCompleted) {
      req.user.stats.tasksCompleted += 1;
      await req.user.save();
    }

    await task.populate([
      { path: 'assignee', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'firstName lastName email' },
      { path: 'parentTask', select: 'title status' },
      { path: 'subtasks', select: 'title status priority' }
    ]);

    res.json({
      message: 'Task updated successfully',
      task
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Task update failed'
    });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private
router.delete('/:id', [
  protect,
  param('id').isMongoId()
], checkOwnership(Task), async (req, res) => {
  try {
    const task = req.resource;

    // Remove from parent's subtasks if applicable
    if (task.parentTask) {
      await Task.findByIdAndUpdate(task.parentTask, {
        $pull: { subtasks: task._id }
      });
    }

    // Remove subtasks
    if (task.subtasks.length > 0) {
      await Task.deleteMany({ _id: { $in: task.subtasks } });
    }

    // Remove dependencies
    await Task.updateMany(
      { 'dependencies.task': task._id },
      { $pull: { dependencies: { task: task._id } } }
    );

    await Task.findByIdAndDelete(task._id);

    res.json({
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Task deletion failed'
    });
  }
});

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
// @access  Private
router.post('/:id/comments', [
  protect,
  param('id').isMongoId(),
  body('content').trim().isLength({ min: 1, max: 1000 })
], checkOwnership(Task), async (req, res) => {
  try {
    const { content } = req.body;
    await req.resource.addComment(req.user._id, content);

    await req.resource.populate('comments.user', 'firstName lastName');

    res.json({
      message: 'Comment added successfully',
      comment: req.resource.comments[req.resource.comments.length - 1]
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Failed to add comment'
    });
  }
});

// @route   POST /api/tasks/:id/time/start
// @desc    Start time tracking
// @access  Private
router.post('/:id/time/start', [
  protect,
  param('id').isMongoId(),
  body('description').optional().trim().isLength({ max: 200 })
], checkOwnership(Task), async (req, res) => {
  try {
    const { description } = req.body;
    await req.resource.startTimeTracking(req.user._id, description);

    res.json({
      message: 'Time tracking started',
      activeEntry: req.resource.timeTracking[req.resource.timeTracking.length - 1]
    });
  } catch (error) {
    console.error('Start time tracking error:', error);
    res.status(400).json({
      error: 'Bad Request',
      message: error.message
    });
  }
});

// @route   POST /api/tasks/:id/time/stop
// @desc    Stop time tracking
// @access  Private
router.post('/:id/time/stop', [
  protect,
  param('id').isMongoId()
], checkOwnership(Task), async (req, res) => {
  try {
    await req.resource.stopTimeTracking(req.user._id);

    const lastEntry = req.resource.timeTracking[req.resource.timeTracking.length - 1];

    res.json({
      message: 'Time tracking stopped',
      entry: lastEntry
    });
  } catch (error) {
    console.error('Stop time tracking error:', error);
    res.status(400).json({
      error: 'Bad Request',
      message: error.message
    });
  }
});

module.exports = router;