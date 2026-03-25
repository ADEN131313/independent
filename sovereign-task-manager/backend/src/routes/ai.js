const express = require('express');
const OpenAI = require('openai');
const { body, validationResult } = require('express-validator');
const { protect, apiLimiter, authorize } = require('../middleware/auth');
const Task = require('../models/Task');

const router = express.Router();

// Apply API rate limiting
router.use(apiLimiter);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// @route   POST /api/ai/suggest-task
// @desc    Generate AI task suggestions
// @access  Private
router.post('/suggest-task', [
  protect,
  authorize('premium', 'enterprise'),
  body('context').optional().trim().isLength({ max: 1000 }),
  body('category').optional().isIn(['work', 'personal', 'health', 'finance', 'learning', 'other'])
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

    const { context, category } = req.body;

    // Get user's existing tasks for context
    const userTasks = await Task.find({ assignee: req.user._id })
      .select('title category priority status')
      .limit(10)
      .sort({ createdAt: -1 });

    const prompt = `Based on the user's context and existing tasks, suggest 3 new productive tasks they should consider adding to their task list.

User Context: ${context || 'General productivity and task management'}
Preferred Category: ${category || 'any'}

Existing Tasks:
${userTasks.map(t => `- ${t.title} (${t.category}, ${t.priority}, ${t.status})`).join('\n')}

For each suggestion, provide:
1. Title: A clear, actionable task title
2. Description: Brief explanation of why this task is valuable
3. Category: work/personal/health/finance/learning/other
4. Priority: low/medium/high/urgent
5. Estimated Hours: Realistic time estimate

Format as JSON array of task objects.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert productivity coach and task management consultant. Provide practical, actionable task suggestions based on user context and existing workload.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const suggestions = JSON.parse(completion.choices[0].message.content);

    // Store suggestions in user's task history for future reference
    const aiSuggestions = suggestions.map(suggestion => ({
      suggestion: `${suggestion.title}: ${suggestion.description}`,
      confidence: 0.8,
      applied: false,
      createdAt: new Date()
    }));

    // Update user stats
    req.user.stats.aiInteractions += 1;
    await req.user.save();

    res.json({
      message: 'AI task suggestions generated',
      suggestions: suggestions,
      usage: completion.usage
    });
  } catch (error) {
    console.error('AI suggest task error:', error);
    res.status(500).json({
      error: 'AI Service Error',
      message: 'Failed to generate task suggestions'
    });
  }
});

// @route   POST /api/ai/analyze-task
// @desc    Analyze task for improvements and insights
// @access  Private
router.post('/analyze-task', [
  protect,
  authorize('premium', 'enterprise'),
  body('taskId').isMongoId(),
  body('analysisType').optional().isIn(['breakdown', 'optimization', 'dependencies', 'timeline'])
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

    const { taskId, analysisType = 'breakdown' } = req.body;

    // Get task details
    const task = await Task.findOne({ _id: taskId, assignee: req.user._id });
    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found'
      });
    }

    let prompt = '';
    let systemMessage = '';

    switch (analysisType) {
      case 'breakdown':
        systemMessage = 'You are a task decomposition expert. Break complex tasks into actionable subtasks.';
        prompt = `Analyze this task and break it down into smaller, actionable subtasks:

Task: ${task.title}
Description: ${task.description || 'No description provided'}
Category: ${task.category}
Priority: ${task.priority}

Provide a breakdown with:
1. Main phases or steps
2. Specific subtasks for each phase
3. Estimated time for each subtask
4. Dependencies between subtasks
5. Success criteria for completion`;
        break;

      case 'optimization':
        systemMessage = 'You are a productivity optimization expert. Suggest improvements to task efficiency.';
        prompt = `Analyze this task for optimization opportunities:

Task: ${task.title}
Description: ${task.description || 'No description provided'}
Current Priority: ${task.priority}
Estimated Hours: ${task.estimatedHours || 'Not specified'}

Suggest optimizations for:
1. Time efficiency improvements
2. Process streamlining
3. Tool or method recommendations
4. Risk reduction strategies
5. Quality enhancement approaches`;
        break;

      case 'dependencies':
        systemMessage = 'You are a project dependency expert. Identify and map task relationships.';
        prompt = `Analyze dependencies and relationships for this task:

Task: ${task.title}
Description: ${task.description || 'No description provided'}
Category: ${task.category}

Identify:
1. Prerequisite tasks or knowledge required
2. Parallel tasks that could run simultaneously
3. Potential blockers or risks
4. Required resources or tools
5. Follow-up tasks or next steps`;
        break;

      case 'timeline':
        systemMessage = 'You are a project timeline expert. Create realistic schedules and milestones.';
        prompt = `Create a detailed timeline for this task:

Task: ${task.title}
Description: ${task.description || 'No description provided'}
Due Date: ${task.dueDate || 'Not specified'}
Estimated Hours: ${task.estimatedHours || 'Not specified'}
Priority: ${task.priority}

Create a timeline with:
1. Overall duration estimate
2. Key milestones and deadlines
3. Daily/weekly breakdown of work
4. Buffer time for unexpected issues
5. Progress tracking checkpoints`;
        break;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const analysis = completion.choices[0].message.content;

    // Store analysis as AI suggestion
    await Task.findByIdAndUpdate(taskId, {
      $push: {
        aiSuggestions: {
          suggestion: `${analysisType.toUpperCase()} Analysis: ${analysis.substring(0, 100)}...`,
          confidence: 0.9,
          applied: false
        }
      }
    });

    // Update user stats
    req.user.stats.aiInteractions += 1;
    await req.user.save();

    res.json({
      message: `AI ${analysisType} analysis completed`,
      analysis: analysis,
      taskId: taskId,
      analysisType: analysisType,
      usage: completion.usage
    });
  } catch (error) {
    console.error('AI analyze task error:', error);
    res.status(500).json({
      error: 'AI Service Error',
      message: 'Failed to analyze task'
    });
  }
});

// @route   POST /api/ai/prioritize-tasks
// @desc    AI-powered task prioritization
// @access  Private
router.post('/prioritize-tasks', [
  protect,
  authorize('premium', 'enterprise'),
  body('taskIds').isArray().isLength({ min: 1, max: 20 }),
  body('criteria').optional().isArray()
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

    const { taskIds, criteria = ['urgency', 'importance', 'effort', 'deadline'] } = req.body;

    // Get tasks
    const tasks = await Task.find({
      _id: { $in: taskIds },
      assignee: req.user._id
    }).select('title description priority category dueDate estimatedHours createdAt');

    if (tasks.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No valid tasks found'
      });
    }

    const taskList = tasks.map(t => ({
      id: t._id.toString(),
      title: t.title,
      description: t.description || '',
      priority: t.priority,
      category: t.category,
      dueDate: t.dueDate?.toISOString() || 'No deadline',
      estimatedHours: t.estimatedHours || 'Unknown',
      createdAt: t.createdAt.toISOString()
    }));

    const prompt = `Analyze and prioritize these tasks based on multiple criteria. Consider: ${criteria.join(', ')}

Tasks to prioritize:
${taskList.map((t, i) => `${i + 1}. ${t.title}
   - Priority: ${t.priority}
   - Category: ${t.category}
   - Due: ${t.dueDate}
   - Effort: ${t.estimatedHours} hours
   - Description: ${t.description}
`).join('\n')}

Provide a prioritized ranking with reasoning for each task's position. Include:
1. Overall priority ranking (1 = highest priority)
2. Specific reasoning for each task's placement
3. Recommended time allocation
4. Potential risks or dependencies
5. Suggested execution order

Format as structured analysis.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert project manager and prioritization specialist. Provide clear, actionable prioritization recommendations based on multiple criteria.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 2000
    });

    const prioritization = completion.choices[0].message.content;

    // Update user stats
    req.user.stats.aiInteractions += 1;
    await req.user.save();

    res.json({
      message: 'AI task prioritization completed',
      prioritization: prioritization,
      tasksAnalyzed: tasks.length,
      criteria: criteria,
      usage: completion.usage
    });
  } catch (error) {
    console.error('AI prioritize tasks error:', error);
    res.status(500).json({
      error: 'AI Service Error',
      message: 'Failed to prioritize tasks'
    });
  }
});

// @route   POST /api/ai/generate-summary
// @desc    Generate productivity summary with AI insights
// @access  Private
router.post('/generate-summary', [
  protect,
  body('period').optional().isIn(['day', 'week', 'month']),
  body('includeRecommendations').optional().isBoolean()
], async (req, res) => {
  try {
    const { period = 'week', includeRecommendations = true } = req.body;

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    // Get user's tasks for the period
    const tasks = await Task.find({
      assignee: req.user._id,
      createdAt: { $gte: startDate }
    }).select('title status priority category createdAt completedAt estimatedHours actualHours');

    const completedTasks = tasks.filter(t => t.status === 'completed');
    const pendingTasks = tasks.filter(t => t.status !== 'completed');

    const stats = {
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      pendingTasks: pendingTasks.length,
      completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0,
      averageCompletionTime: completedTasks.length > 0 ?
        completedTasks.reduce((sum, t) => sum + (t.actualHours || t.estimatedHours || 0), 0) / completedTasks.length : 0
    };

    const prompt = `Generate a comprehensive productivity summary and insights for this user.

Time Period: Last ${period}
Statistics:
- Total Tasks: ${stats.totalTasks}
- Completed: ${stats.completedTasks}
- Pending: ${stats.pendingTasks}
- Completion Rate: ${stats.completionRate.toFixed(1)}%
- Avg Completion Time: ${stats.averageCompletionTime.toFixed(1)} hours

Completed Tasks:
${completedTasks.map(t => `- ${t.title} (${t.category}, ${t.priority})`).join('\n')}

Pending Tasks:
${pendingTasks.map(t => `- ${t.title} (${t.category}, ${t.priority})`).join('\n')}

${includeRecommendations ? 'Include specific recommendations for improving productivity.' : ''}

Provide:
1. Executive summary of productivity
2. Key achievements and patterns
3. Areas for improvement
4. Specific actionable recommendations
5. Predictive insights for next period`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a productivity coach and data analyst. Provide insightful, actionable summaries of user productivity patterns with specific recommendations.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1500
    });

    const summary = completion.choices[0].message.content;

    // Update user stats
    req.user.stats.aiInteractions += 1;
    await req.user.save();

    res.json({
      message: 'AI productivity summary generated',
      summary: summary,
      period: period,
      stats: stats,
      tasksAnalyzed: tasks.length,
      usage: completion.usage
    });
  } catch (error) {
    console.error('AI generate summary error:', error);
    res.status(500).json({
      error: 'AI Service Error',
      message: 'Failed to generate productivity summary'
    });
  }
});

module.exports = router;