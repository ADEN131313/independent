import React from 'react';
import './StatsOverview.css';

const StatsOverview = ({ stats }) => {
  if (!stats) {
    return (
      <div className="stats-overview">
        <div className="stat-card loading">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">--</div>
            <div className="stat-label">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const statsData = [
    {
      icon: '✅',
      value: stats.total,
      label: 'Total Tasks',
      color: 'primary'
    },
    {
      icon: '🎯',
      value: stats.completed,
      label: 'Completed',
      color: 'success'
    },
    {
      icon: '⏳',
      value: stats.inProgress,
      label: 'In Progress',
      color: 'warning'
    },
    {
      icon: '🚨',
      value: stats.overdue,
      label: 'Overdue',
      color: 'error'
    },
    {
      icon: '📈',
      value: `${stats.completionRate}%`,
      label: 'Completion Rate',
      color: 'info'
    }
  ];

  return (
    <div className="stats-overview">
      {statsData.map((stat, index) => (
        <div key={index} className={`stat-card ${stat.color}`}>
          <div className="stat-icon">{stat.icon}</div>
          <div className="stat-content">
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsOverview;