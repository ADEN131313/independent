import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateProfile } from '../../redux/slices/authSlice';
import { addNotification } from '../../redux/slices/uiSlice';
import LoadingSpinner from '../common/LoadingSpinner';
import './Profile.css';

const Profile = () => {
  const dispatch = useDispatch();
  const { user, loading } = useSelector(state => state.auth);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    preferences: {
      theme: 'light',
      notifications: {
        email: true,
        push: true
      },
      timezone: 'UTC'
    }
  });

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        preferences: {
          theme: user.preferences?.theme || 'light',
          notifications: {
            email: user.preferences?.notifications?.email ?? true,
            push: user.preferences?.notifications?.push ?? true,
          },
          timezone: user.preferences?.timezone || 'UTC'
        }
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: type === 'checkbox' ? checked : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await dispatch(updateProfile(formData)).unwrap();
      dispatch(addNotification({
        type: 'success',
        message: 'Profile updated successfully!',
        duration: 3000
      }));
      setIsEditing(false);
    } catch (error) {
      dispatch(addNotification({
        type: 'error',
        message: 'Failed to update profile',
        duration: 5000
      }));
    }
  };

  const handleCancel = () => {
    // Reset form to original values
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        preferences: {
          theme: user.preferences?.theme || 'light',
          notifications: {
            email: user.preferences?.notifications?.email ?? true,
            push: user.preferences?.notifications?.push ?? true,
          },
          timezone: user.preferences?.timezone || 'UTC'
        }
      });
    }
    setIsEditing(false);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <div>No user data available</div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Profile Settings</h1>
        <p>Manage your account information and preferences</p>
      </div>

      <div className="profile-content">
        {/* Account Information */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Account Information</h2>
            {!isEditing && (
              <button
                className="edit-btn"
                onClick={() => setIsEditing(true)}
              >
                Edit Profile
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  disabled={!isEditing}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  disabled={!isEditing}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="disabled-input"
                />
                <small className="form-help">Email cannot be changed</small>
              </div>

              <div className="form-group">
                <label>Account Age</label>
                <input
                  type="text"
                  value={`${user.accountAge} days`}
                  disabled
                  className="disabled-input"
                />
              </div>
            </div>

            {isEditing && (
              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Preferences */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Preferences</h2>
          </div>

          <form className="profile-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="theme">Theme</label>
                <select
                  id="theme"
                  name="preferences.theme"
                  value={formData.preferences.theme}
                  onChange={handleChange}
                  disabled={!isEditing}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="timezone">Timezone</label>
                <select
                  id="timezone"
                  name="preferences.timezone"
                  value={formData.preferences.timezone}
                  onChange={handleChange}
                  disabled={!isEditing}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="preferences.notifications.email"
                  checked={formData.preferences.notifications.email}
                  onChange={handleChange}
                  disabled={!isEditing}
                />
                Email notifications
              </label>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="preferences.notifications.push"
                  checked={formData.preferences.notifications.push}
                  onChange={handleChange}
                  disabled={!isEditing}
                />
                Push notifications
              </label>
            </div>
          </form>
        </div>

        {/* Subscription Info */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Subscription</h2>
          </div>

          <div className="subscription-info">
            <div className="subscription-item">
              <span className="label">Plan:</span>
              <span className="value capitalize">{user.subscription?.plan}</span>
            </div>
            {user.subscription?.currentPeriodEnd && (
              <div className="subscription-item">
                <span className="label">Next billing:</span>
                <span className="value">
                  {new Date(user.subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="subscription-item">
              <span className="label">Status:</span>
              <span className={`status ${user.subscription?.status}`}>
                {user.subscription?.status}
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="profile-section">
          <div className="section-header">
            <h2>Statistics</h2>
          </div>

          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{user.stats?.tasksCreated || 0}</div>
              <div className="stat-label">Tasks Created</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{user.stats?.tasksCompleted || 0}</div>
              <div className="stat-label">Tasks Completed</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{user.stats?.aiInteractions || 0}</div>
              <div className="stat-label">AI Interactions</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{user.stats?.streakDays || 0}</div>
              <div className="stat-label">Day Streak</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;