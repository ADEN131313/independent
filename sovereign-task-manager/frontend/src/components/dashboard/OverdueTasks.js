import React from 'react';
import TaskCard from '../tasks/TaskCard';
import './OverdueTasks.css';

const OverdueTasks = ({ tasks }) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3>Overdue Tasks</h3>
        {tasks.length > 0 && (
          <span className="overdue-count">{tasks.length}</span>
        )}
      </div>

      <div className="overdue-tasks-list">
        {tasks.length > 0 ? (
          tasks.slice(0, 3).map(task => (
            <TaskCard key={task._id} task={task} compact overdue />
          ))
        ) : (
          <div className="no-overdue">
            <p>🎉 All caught up! No overdue tasks.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OverdueTasks;