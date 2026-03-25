const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Task = require('./models/Task');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sovereign-tasks';

const seedUsers = [
  {
    email: 'demo@sovereigntasks.com',
    password: 'demo123456',
    firstName: 'Demo',
    lastName: 'User',
    preferences: {
      theme: 'light',
      notifications: { email: true, push: true },
      timezone: 'America/New_York'
    },
    subscription: {
      plan: 'free',
      status: 'active'
    }
  },
  {
    email: 'premium@sovereigntasks.com',
    password: 'premium123456',
    firstName: 'Premium',
    lastName: 'User',
    preferences: {
      theme: 'dark',
      notifications: { email: true, push: true },
      timezone: 'America/Los_Angeles'
    },
    subscription: {
      plan: 'premium',
      status: 'active',
      stripeCustomerId: 'cus_demo123'
    }
  },
  {
    email: 'enterprise@sovereigntasks.com',
    password: 'enterprise123456',
    firstName: 'Enterprise',
    lastName: 'User',
    preferences: {
      theme: 'dark',
      notifications: { email: true, push: true },
      timezone: 'Europe/London'
    },
    subscription: {
      plan: 'enterprise',
      status: 'active',
      stripeCustomerId: 'cus_enterprise123'
    }
  }
];

const seedTasks = [
  {
    title: 'Complete project planning',
    description: 'Finish the project planning phase including scope, timeline, and resource allocation.',
    status: 'in_progress',
    priority: 'high',
    category: 'work',
    tags: ['planning', 'project'],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    estimatedHours: 8
  },
  {
    title: 'Review quarterly budget',
    description: 'Review and analyze the quarterly budget report for Q1 2024.',
    status: 'todo',
    priority: 'medium',
    category: 'finance',
    tags: ['budget', 'review', 'finance'],
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    estimatedHours: 4
  },
  {
    title: 'Schedule health checkup',
    description: 'Book an appointment for annual health checkup.',
    status: 'todo',
    priority: 'low',
    category: 'health',
    tags: ['health', 'appointment'],
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    estimatedHours: 1
  },
  {
    title: 'Learn React hooks',
    description: 'Complete React hooks tutorial and implement in current project.',
    status: 'completed',
    priority: 'medium',
    category: 'learning',
    tags: ['react', 'learning', 'development'],
    completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    estimatedHours: 6,
    actualHours: 5
  },
  {
    title: 'Grocery shopping',
    description: 'Buy weekly groceries including fruits, vegetables, and household items.',
    status: 'todo',
    priority: 'low',
    category: 'personal',
    tags: ['shopping', 'groceries'],
    estimatedHours: 2
  },
  {
    title: 'Fix login bug',
    description: 'Investigate and fix the login issue on mobile devices.',
    status: 'in_progress',
    priority: 'urgent',
    category: 'work',
    tags: ['bug', 'mobile', 'urgent'],
    dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    estimatedHours: 3
  },
  {
    title: 'Pay utility bills',
    description: 'Pay electricity and water bills for the month.',
    status: 'completed',
    priority: 'medium',
    category: 'finance',
    tags: ['bills', 'payment'],
    completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    estimatedHours: 1
  },
  {
    title: 'Morning workout',
    description: 'Complete 30-minute cardio and strength training session.',
    status: 'completed',
    priority: 'high',
    category: 'health',
    tags: ['fitness', 'workout', 'morning'],
    completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    estimatedHours: 1,
    actualHours: 1
  }
];

async function seed() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Task.deleteMany({});

    console.log('👤 Creating users...');
    const createdUsers = await Promise.all(
      seedUsers.map(async (userData) => {
        const hashedPassword = await bcrypt.hash(userData.password, 12);
        const user = new User({
          ...userData,
          password: hashedPassword
        });
        return user.save();
      })
    );
    console.log(`✅ Created ${createdUsers.length} users`);

    console.log('📝 Creating tasks...');
    const demoUserId = createdUsers[0]._id;
    const tasksWithOwner = seedTasks.map(task => ({
      ...task,
      assignee: demoUserId,
      createdBy: demoUserId
    }));
    const createdTasks = await Task.insertMany(tasksWithOwner);
    console.log(`✅ Created ${createdTasks.length} tasks`);

    console.log('\n📋 Seed Summary:');
    console.log('----------------');
    console.log('Users:');
    createdUsers.forEach(user => {
      console.log(`  - ${user.email} (${user.subscription.plan} plan)`);
    });
    console.log('\nPasswords:');
    seedUsers.forEach(user => {
      console.log(`  - ${user.email}: ${user.password}`);
    });
    console.log('\nTasks:');
    console.log(`  - Total: ${createdTasks.length}`);
    const statusCounts = createdTasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count}`);
    });

    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();