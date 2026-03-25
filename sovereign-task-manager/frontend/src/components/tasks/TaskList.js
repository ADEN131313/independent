import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTasks, setFilters, clearError } from '../../redux/slices/tasksSlice';
import { addNotification, openModal } from '../../redux/slices/uiSlice';
import LoadingSpinner from '../common/LoadingSpinner';
import TaskCard from './TaskCard';
import TaskFilters from './TaskFilters';
import './TaskList.css';

const TaskList = () => {
  const dispatch = useDispatch();
  const { tasks, pagination, filters, loading, error } = useSelector(state => state.tasks);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    dispatch(fetchTasks(filters));
  }, [dispatch, filters]);

  useEffect(() => {
    if (error) {
      dispatch(addNotification({
        type: 'error',
        message: error,
        duration: 5000
      }));
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const handleFilterChange = (newFilters) => {
    dispatch(setFilters({ ...filters, ...newFilters, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    dispatch(setFilters({ ...filters, page: newPage }));
  };

  const handleCreateTask = () => {
    dispatch(openModal('createTask'));
  };

  const filteredTasks = tasks.filter(task =>
    task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="task-list-container">
      <div className="task-list-header">
        <div className="header-content">
          <h1>My Tasks</h1>
          <p>Manage and track your tasks efficiently</p>
        </div>
        <button
          className="create-task-btn"
          onClick={handleCreateTask}
        >
          ➕ New Task
        </button>
      </div>

      {/* Search and Filters */}
      <div className="task-list-controls">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <TaskFilters filters={filters} onFilterChange={handleFilterChange} />
      </div>

      {/* Task List */}
      <div className="task-list-content">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {filteredTasks.length > 0 ? (
              <>
                <div className="tasks-count">
                  Showing {filteredTasks.length} of {pagination.total} tasks
                </div>
                <div className="task-grid">
                  {filteredTasks.map(task => (
                    <TaskCard key={task._id} task={task} />
                  ))}
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="pagination">
                    <button
                      className="page-btn"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      ← Previous
                    </button>

                    <span className="page-info">
                      Page {pagination.page} of {pagination.pages}
                    </span>

                    <button
                      className="page-btn"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.pages}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="no-tasks">
                <div className="no-tasks-icon">📋</div>
                <h3>No tasks found</h3>
                <p>
                  {searchTerm || Object.keys(filters).some(key => filters[key])
                    ? 'Try adjusting your search or filters'
                    : 'Create your first task to get started'
                  }
                </p>
                {!searchTerm && !Object.keys(filters).some(key => filters[key]) && (
                  <button
                    className="create-first-task-btn"
                    onClick={handleCreateTask}
                  >
                    Create Your First Task
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TaskList;