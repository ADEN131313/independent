import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTaskById, clearCurrentTask } from '../../redux/slices/tasksSlice';
import LoadingSpinner from '../common/LoadingSpinner';

const TaskDetails = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentTask, loading } = useSelector(state => state.tasks);

  useEffect(() => {
    if (id) {
      dispatch(fetchTaskById(id));
    }

    return () => {
      dispatch(clearCurrentTask());
    };
  }, [dispatch, id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!currentTask) {
    return (
      <div className="task-details-container">
        <div className="no-task-found">
          <h2>Task Not Found</h2>
          <p>The task you're looking for doesn't exist or you don't have permission to view it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="task-details-container">
      <div className="task-details-header">
        <h1>{currentTask.title}</h1>
        <div className="task-status-badge">
          {currentTask.status.replace('_', ' ')}
        </div>
      </div>

      <div className="task-details-content">
        <div className="task-info-grid">
          <div className="info-item">
            <label>Priority</label>
            <span className={`priority-${currentTask.priority}`}>
              {currentTask.priority}
            </span>
          </div>

          <div className="info-item">
            <label>Category</label>
            <span>{currentTask.category}</span>
          </div>

          <div className="info-item">
            <label>Due Date</label>
            <span>
              {currentTask.dueDate
                ? new Date(currentTask.dueDate).toLocaleDateString()
                : 'No due date'
              }
            </span>
          </div>

          <div className="info-item">
            <label>Estimated Hours</label>
            <span>{currentTask.estimatedHours || 'Not set'}</span>
          </div>
        </div>

        {currentTask.description && (
          <div className="task-description">
            <h3>Description</h3>
            <p>{currentTask.description}</p>
          </div>
        )}

        {currentTask.tags && currentTask.tags.length > 0 && (
          <div className="task-tags">
            <h3>Tags</h3>
            <div className="tags-list">
              {currentTask.tags.map((tag, index) => (
                <span key={index} className="tag">#{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskDetails;