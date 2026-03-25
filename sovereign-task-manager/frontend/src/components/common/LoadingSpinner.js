import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', fullScreen = false }) => {
  const spinnerClass = `loading-spinner ${size} ${fullScreen ? 'fullscreen' : ''}`;

  return (
    <div className={spinnerClass}>
      <div className="spinner"></div>
    </div>
  );
};

export default LoadingSpinner;