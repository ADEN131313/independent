import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createTask, clearError } from '../../redux/slices/tasksSlice';
import { closeModal, addNotification } from '../../redux/slices/uiSlice';
import LoadingSpinner from '../common/LoadingSpinner';
import './CreateTaskModal.css';

const CreateTaskModal = () => {
  const dispatch = useDispatch();
  const { loading, error } = useSelector(state => state.tasks);
  const isOpen = useSelector(state => state.ui.modals.createTask);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'other',
    dueDate: '',
    tags: ''
  });

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

  const handleClose = () => {
    dispatch(closeModal('createTask'));
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      category: 'other',
      dueDate: '',
      tags: ''
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const taskData = {
      ...formData,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null
    };

    try {
      await dispatch(createTask(taskData)).unwrap();
      dispatch(addNotification({
        type: 'success',
        message: 'Task created successfully!',
        duration: 3000
      }));
      handleClose();
    } catch (err) {
      // Error handled in useEffect
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Task</h2>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="Enter task title"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter task description"
              rows="3"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
              >
                <option value="work">Work</option>
                <option value="personal">Personal</option>
                <option value="health">Health</option>
                <option value="finance">Finance</option>
                <option value="learning">Learning</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="dueDate">Due Date</label>
            <input
              type="datetime-local"
              id="dueDate"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags (comma separated)</label>
            <input
              type="text"
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder="urgent, project-x, meeting"
            />
          </div>

          <div className="modal-footer">
            <button type="button" onClick={handleClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? <LoadingSpinner small /> : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTaskModal;