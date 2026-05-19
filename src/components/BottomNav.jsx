import React from 'react'

export default function BottomNav({ tab, onTabChange }) {
  return (
    <nav className="bottom-nav">
      <button
        className={`nav-btn ${tab === 'today' ? 'active' : ''}`}
        onClick={() => onTabChange('today')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <span>Today</span>
      </button>
      <button
        className={`nav-btn ${tab === 'plants' ? 'active' : ''}`}
        onClick={() => onTabChange('plants')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span>All Plants</span>
      </button>
      <button
        className={`nav-btn ${tab === 'history' ? 'active' : ''}`}
        onClick={() => onTabChange('history')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>History</span>
      </button>
    </nav>
  )
}
