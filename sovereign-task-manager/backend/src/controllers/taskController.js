const Task = require('../models/Task');

const getTasks = async (req, res) => {
  try {
    const { status, priority, category, limit = 20, page = 1, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const filter = { assignee: req.user._id };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;

    const tasks = await Task.find(filter)
      .populate('assignee', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email')
      .populate('parentTask', 'title status')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Task.countDocuments(filter);

    res.json({ tasks, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getTaskStats = async (req, res) => {
  try {
    const stats = await Task.aggregate([
      { $match: { assignee: req.user._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'completed'] }, { $lt: ['$dueDate', new Date()] }] }, 1, 0] } }
        }
      }
    ]);

    const data = stats[0] || { total: 0, completed: 0, todo: 0, inProgress: 0, overdue: 0 };
    const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0;

    res.json({ ...data, completionRate: Math.round(completionRate * 100) / 100 });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const createTask = async (req, res) => {
  try {
    const taskData = { ...req.body, assignee: req.user._id, createdBy: req.user._id };
    const task = await Task.create(taskData);
    await task.populate(['assignee', 'createdBy']);
    res.status(201).json({ task });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate(['assignee', 'createdBy', 'parentTask', 'subtasks']);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.assignee._id.equals(req.user._id)) return res.status(403).json({ message: 'Forbidden' });
    res.json({ task });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.assignee.equals(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

    Object.assign(task, req.body);
    await task.save();
    await task.populate(['assignee', 'createdBy']);
    res.json({ task });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (!task.assignee.equals(req.user._id)) return res.status(403).json({ message: 'Forbidden' });

    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getTasks, getTaskStats, createTask, getTask, updateTask, deleteTask };