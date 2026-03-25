import React from 'react';
import { Link } from 'react-router-dom';
import './TaskCard.css';

const TaskCard = ({ task, compact = false, overdue = false }) => {
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'urgent';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'review': return '👀';
      case 'cancelled': return '❌';
      default: return '📋';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0) return `In ${diffDays} days`;
    return `${Math.abs(diffDays)} days ago`;
  };

  const cardClass = `task-card ${compact ? 'compact' : ''} ${overdue ? 'overdue' : ''} priority-${getPriorityColor(task.priority)}`;

  return (
    <Link to={`/tasks/${task._id}`} className={cardClass}>
      <div className="task-header">
        <div className="task-status">
          <span className="status-icon">{getStatusIcon(task.status)}</span>
        </div>
        <div className="task-priority">
          <span className={`priority-dot ${getPriorityColor(task.priority)}`}></span>
        </div>
      </div>

      <div className="task-content">
        <h4 className="task-title">{task.title}</h4>
        {!compact && task.description && (
          <p className="task-description">
            {task.description.length > 100
              ? `${task.description.substring(0, 100)}...`
              : task.description
            }
          </p>
        )}

        <div className="task-meta">
          <span className="task-category">{task.category}</span>
          {task.dueDate && (
            <span className={`task-due-date ${overdue ? 'overdue' : ''}`}>
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>

        {!compact && (
          <div className="task-footer">
            {task.tags && task.tags.length > 0 && (
              <div className="task-tags">
                {task.tags.slice(0, 3).map((tag, index) => (
                  <span key={index} className="task-tag">#{tag}</span>
                ))}
                {task.tags.length > 3 && (
                  <span className="task-tag">+{task.tags.length - 3}</span>
                )}
              </div>
            )}

            <div className="task-assignee">
              {task.assignee?.firstName} {task.assignee?.lastName}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default TaskCard;