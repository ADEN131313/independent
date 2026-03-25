import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { logout } from '../../redux/slices/authSlice';
import { toggleSidebar } from '../../redux/slices/uiSlice';
import './Layout.css';

const Layout = ({ children }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(state => state.auth);
  const { sidebarOpen } = useSelector(state => state.ui);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleNavigation = (path) => {
    navigate(path);
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Sovereign Tasks</h2>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li>
              <button
                className="nav-link"
                onClick={() => handleNavigation('/dashboard')}
              >
                <span className="nav-icon">📊</span>
                Dashboard
              </button>
            </li>
            <li>
              <button
                className="nav-link"
                onClick={() => handleNavigation('/tasks')}
              >
                <span className="nav-icon">📋</span>
                Tasks
              </button>
            </li>
            <li>
              <button
                className="nav-link"
                onClick={() => handleNavigation('/profile')}
              >
                <span className="nav-icon">👤</span>
                Profile
              </button>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="user-details">
              <div className="user-name">{user?.fullName}</div>
              <div className="user-plan">{user?.subscription?.plan}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Header */}
        <header className="header">
          <button
            className="sidebar-toggle"
            onClick={() => dispatch(toggleSidebar())}
          >
            ☰
          </button>

          <div className="header-title">
            <h1>Sovereign Task Manager</h1>
          </div>

          <div className="header-actions">
            {/* Add any header actions here */}
          </div>
        </header>

        {/* Page content */}
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;