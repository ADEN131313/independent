import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTasks, fetchTaskStats, fetchOverdueTasks } from '../../redux/slices/tasksSlice';
import { addNotification } from '../../redux/slices/uiSlice';
import LoadingSpinner from '../common/LoadingSpinner';
import TaskCard from '../tasks/TaskCard';
import StatsOverview from './StatsOverview';
import RecentTasks from './RecentTasks';
import OverdueTasks from './OverdueTasks';
import './Dashboard.css';

const Dashboard = () => {
  const dispatch = useDispatch();
  const { tasks, stats, overdueTasks, loading, error } = useSelector(state => state.tasks);
  const { user } = useSelector(state => state.auth);

  useEffect(() => {
    // Fetch dashboard data
    dispatch(fetchTaskStats());
    dispatch(fetchTasks({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }));
    dispatch(fetchOverdueTasks());
  }, [dispatch]);

  useEffect(() => {
    if (error) {
      dispatch(addNotification({
        type: 'error',
        message: error,
        duration: 5000
      }));
    }
  }, [error, dispatch]);

  if (loading && !stats) {
    return <LoadingSpinner />;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Good {getGreeting()}, {user?.firstName}!</h1>
        <p>Here's what's happening with your tasks today.</p>
      </div>

      {/* Stats Overview */}
      <StatsOverview stats={stats} />

      {/* Main Dashboard Content */}
      <div className="dashboard-content">
        <div className="dashboard-left">
          {/* Recent Tasks */}
          <RecentTasks tasks={tasks.slice(0, 5)} />

          {/* Quick Actions */}
          <div className="dashboard-card">
            <h3>Quick Actions</h3>
            <div className="quick-actions">
              <button
                className="action-btn primary"
                onClick={() => {/* TODO: Open create task modal */}}
              >
                ➕ New Task
              </button>
              <button
                className="action-btn secondary"
                onClick={() => {/* TODO: Navigate to AI suggestions */}}
              >
                🤖 AI Suggestions
              </button>
              <button
                className="action-btn secondary"
                onClick={() => {/* TODO: Navigate to task prioritization */}}
              >
                📊 Prioritize Tasks
              </button>
            </div>
          </div>
        </div>

        <div className="dashboard-right">
          {/* Overdue Tasks */}
          <OverdueTasks tasks={overdueTasks} />

          {/* Upcoming Tasks */}
          <div className="dashboard-card">
            <h3>Upcoming Tasks</h3>
            <div className="upcoming-tasks">
              {tasks
                .filter(task => task.dueDate && new Date(task.dueDate) > new Date())
                .slice(0, 3)
                .map(task => (
                  <TaskCard key={task._id} task={task} compact />
                ))
              }
              {tasks.filter(task => task.dueDate && new Date(task.dueDate) > new Date()).length === 0 && (
                <p className="no-tasks">No upcoming tasks with due dates</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get greeting based on time
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export default Dashboard;