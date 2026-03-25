const { OpenAI } = require('openai');

class AIService {
  constructor() {
    this.client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }

  async generateSuggestions(prompt) {
    if (!this.client) throw new Error('OpenAI not configured');
    const completion = await this.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Suggest 5 task titles for: ${prompt}` }],
      max_tokens: 200
    });
    return completion.choices[0].message.content.split('\n').filter(s => s.trim());
  }

  async analyzeTasks(tasks) {
    if (!this.client) throw new Error('OpenAI not configured');
    const taskList = tasks.map(t => `- ${t.title} (${t.status}, ${t.priority})`).join('\n');
    const completion = await this.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Analyze these tasks and provide insights:\n${taskList}` }],
      max_tokens: 300
    });
    return completion.choices[0].message.content;
  }

  async prioritizeTasks(tasks) {
    if (!this.client) throw new Error('OpenAI not configured');
    const taskList = tasks.map(t => `- ${t.title} (due: ${t.dueDate || 'no date'})`).join('\n');
    const completion = await this.client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `Prioritize these tasks by urgency and importance:\n${taskList}` }],
      max_tokens: 300
    });
    return completion.choices[0].message.content;
  }
}

module.exports = new AIService();