# Sovereign Task Manager

A production-grade AI-powered task management application built with Node.js, Express, MongoDB, and React.

## Features

- **Authentication**: JWT-based authentication with refresh tokens
- **Task Management**: Full CRUD operations with filtering, pagination, and categorization
- **AI Integration**: OpenAI-powered task suggestions, analysis, and prioritization
- **Payments**: Stripe integration for subscription management
- **Notifications**: SendGrid-powered email notifications and reminders
- **Frontend**: React with Redux for state management

## Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- npm or yarn

## Tech Stack

### Backend
- Express.js
- MongoDB with Mongoose
- JWT Authentication
- OpenAI (GPT-4)
- Stripe
- SendGrid

### Frontend
- React 18
- Redux Toolkit
- React Router v6
- Axios

## Project Structure

```
sovereign-task-manager/
├── backend/
│   ├── src/
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Auth, validation, etc.
│   │   ├── models/         # Mongoose models
│   │   ├── routes/         # API routes
│   │   ├── services/       # External API integrations
│   │   └── scripts/        # Database seeding
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── redux/         # Redux store and slices
│   │   └── utils/        # Utilities
│   └── package.json
└── README.md
```

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd sovereign-task-manager/backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and update with your credentials:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with the following required values:

```env
# Server
NODE_ENV=development
PORT=5000
HOST=localhost

# Database
MONGODB_URI=mongodb://localhost:27017/sovereign-tasks

# JWT
JWT_SECRET=your-super-secret-jwt-key
REFRESH_TOKEN_SECRET=your-refresh-token-secret

# OpenAI (for AI features)
OPENAI_API_KEY=sk-your-openai-key

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_your-stripe-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
STRIPE_PRICE_ID=price_your-price-id

# SendGrid (for emails)
SENDGRID_API_KEY=SG.your-sendgrid-key
FROM_EMAIL=your-email@domain.com

# Frontend URL (for payment redirects)
FRONTEND_URL=http://localhost:3000
```

### 3. Start MongoDB

Ensure MongoDB is running locally:

```bash
# macOS with Homebrew
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Or run manually
mongod --dbpath /path/to/data/directory
```

### 4. Seed the Database (Optional)

```bash
cd backend
npm run seed
```

This creates demo users:
- `demo@sovereigntasks.com` / `demo123456` (free plan)
- `premium@sovereigntasks.com` / `premium123456` (premium plan)
- `enterprise@sovereigntasks.com` / `enterprise123456` (enterprise plan)

### 5. Start the Backend

```bash
# Development mode (with auto-reload)
cd backend
npm run dev

# Or production mode
npm start
```

The API will be available at `http://localhost:5000`

### 6. Start the Frontend

```bash
cd frontend
npm start
```

The app will open at `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update profile

### Tasks
- `GET /api/tasks` - Get all tasks (with filtering/pagination)
- `GET /api/tasks/stats` - Get task statistics
- `GET /api/tasks/overdue` - Get overdue tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/:id` - Get single task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/comments` - Add comment
- `POST /api/tasks/:id/time/start` - Start time tracking
- `POST /api/tasks/:id/time/stop` - Stop time tracking

### AI (Premium/Enterprise only)
- `POST /api/ai/suggest-task` - Get AI task suggestions
- `POST /api/ai/analyze-task` - Analyze task (breakdown, optimization, dependencies, timeline)
- `POST /api/ai/prioritize-tasks` - AI-powered task prioritization
- `POST /api/ai/generate-summary` - Generate productivity summary

### Payments (Premium/Enterprise only)
- `POST /api/payments/create-session` - Create Stripe checkout session
- `GET /api/payments/subscription` - Get subscription status
- `POST /api/payments/cancel-subscription` - Cancel subscription

### Notifications (Premium/Enterprise only)
- `POST /api/notifications/send-email` - Send email
- `POST /api/notifications/task-reminder` - Schedule task reminder

## Subscription Plans

| Feature | Free | Premium | Enterprise |
|---------|------|---------|------------|
| Tasks | Unlimited | Unlimited | Unlimited |
| AI Suggestions | - | ✓ | ✓ |
| AI Analysis | - | ✓ | ✓ |
| AI Prioritization | - | ✓ | ✓ |
| Email Notifications | - | ✓ | ✓ |
| Task Reminders | - | ✓ | ✓ |
| Team Collaboration | - | - | ✓ |
| API Access | - | - | ✓ |
| Priority Support | - | - | ✓ |

## Development

### Running Tests
```bash
cd backend
npm test
```

### Building for Production
```bash
cd frontend
npm run build
```

## License

MIT