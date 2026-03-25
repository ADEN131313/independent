import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentUser } from './redux/slices/authSlice';
import { setTheme } from './redux/slices/uiSlice';

// Components
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './components/dashboard/Dashboard';
import TaskList from './components/tasks/TaskList';
import TaskDetails from './components/tasks/TaskDetails';
import Profile from './components/auth/Profile';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';
import NotificationContainer from './components/common/NotificationContainer';
import CreateTaskModal from './components/tasks/CreateTaskModal';

// Styles
import './App.css';

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, loading } = useSelector(state => state.auth);
  const { theme } = useSelector(state => state.ui);

  useEffect(() => {
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'light';
    dispatch(setTheme(savedTheme));

    // Check if user is authenticated on app load
    const token = localStorage.getItem('token');
    if (token) {
      dispatch(getCurrentUser());
    }
  }, [dispatch]);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="App">
      <NotificationContainer />
      <CreateTaskModal />
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />}
        />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Layout>
                <Navigate to="/dashboard" />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            isAuthenticated ? (
              <Layout>
                <Dashboard />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/tasks"
          element={
            isAuthenticated ? (
              <Layout>
                <TaskList />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/tasks/:id"
          element={
            isAuthenticated ? (
              <Layout>
                <TaskDetails />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/profile"
          element={
            isAuthenticated ? (
              <Layout>
                <Profile />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Catch all route */}
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />}
        />
      </Routes>
    </div>
  );
}

export default App;