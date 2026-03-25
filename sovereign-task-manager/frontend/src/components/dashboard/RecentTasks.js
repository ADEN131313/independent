import React from 'react';
import { Link } from 'react-router-dom';
import TaskCard from '../tasks/TaskCard';
import './RecentTasks.css';

const RecentTasks = ({ tasks }) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3>Recent Tasks</h3>
        <Link to="/tasks" className="view-all-link">
          View All →
        </Link>
      </div>

      <div className="recent-tasks-list">
        {tasks.length > 0 ? (
          tasks.map(task => (
            <TaskCard key={task._id} task={task} compact />
          ))
        ) : (
          <div className="no-tasks">
            <p>No tasks yet. Create your first task to get started!</p>
            <Link to="/tasks" className="create-task-link">
              Create Task
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentTasks;