const Task = require('../models/Task');

const generateSuggestions = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'AI service not configured' });

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Suggest 5 task titles for: ${prompt}` }],
      max_tokens: 200
    });

    const suggestions = completion.choices[0].message.content.split('\n').filter(s => s.trim());
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ message: 'AI service error' });
  }
};

const analyzeTasks = async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'AI service not configured' });

    const tasks = await Task.find({ assignee: req.user._id }).limit(20);
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const taskList = tasks.map(t => `- ${t.title} (${t.status}, ${t.priority})`).join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Analyze these tasks and provide insights:\n${taskList}` }],
      max_tokens: 300
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ message: 'AI service error' });
  }
};

const prioritizeTasks = async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ message: 'AI service not configured' });

    const tasks = await Task.find({ assignee: req.user._id, status: { $ne: 'completed' } });
    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const taskList = tasks.map(t => `- ${t.title} (due: ${t.dueDate || 'no date'})`).join('\n');
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Prioritize these tasks by urgency and importance:\n${taskList}` }],
      max_tokens: 300
    });

    res.json({ prioritization: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ message: 'AI service error' });
  }
};

module.exports = { generateSuggestions, analyzeTasks, prioritizeTasks };