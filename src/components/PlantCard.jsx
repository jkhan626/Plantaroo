import React, { useState } from 'react'
import { updatePlant, addHistoryEntry, removePlant } from '../db'
import { getStatusText, getStatusColor, isLate, isFeedDue, processWatering } from '../scheduling'

export default function PlantCard({ plant, onRefresh, showRoom = true }) {
  const [showLatePrompt, setShowLatePrompt] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const statusText = getStatusText(plant)
  const statusColor = getStatusColor(plant)
  const feedDue = isFeedDue(plant)
  const late = isLate(plant)

  const handleWater = async (reason = 'on_time') => {
    const updates = processWatering(plant, reason)

    if (feedDue) {
      updates.last_fertilized = new Date().toISOString()
    }

    await updatePlant(plant.id, updates)
    await addHistoryEntry({
      plantId: plant.id,
      type: feedDue ? 'water+feed' : 'water',
      reason,
    })
    setShowLatePrompt(false)
    onRefresh()
  }

  const handleTapWater = () => {
    if (late) {
      setShowLatePrompt(true)
    } else {
      handleWater('on_time')
    }
  }

  const handleDelete = async () => {
    if (window.confirm(`Remove ${plant.name}?`)) {
      await removePlant(plant.id)
      onRefresh()
    }
  }

  return (
    <div className="plant-card">
      <div className="plant-photo-wrap" onClick={handleTapWater}>
        {plant.photo ? (
          <img src={plant.photo} alt={plant.name} className="plant-photo" />
        ) : (
          <div className="plant-photo plant-photo-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
              <path d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12z" />
            </svg>
          </div>
        )}
      </div>

      <div className="plant-info" onClick={handleTapWater}>
        <div className="plant-name">{plant.name}</div>
        {showRoom && <div className="plant-room">{plant.room}</div>}
        <div className="plant-status-row">
          {plant.last_watered && (
            <span className={`status-pill ${statusColor}`}>{statusText}</span>
          )}
          {feedDue && <span className="status-pill feed">+ feed</span>}
          {!plant.last_watered && (
            <span className="status-pill new">Tap to water</span>
          )}
        </div>
      </div>

      <button className="plant-menu-btn" onClick={() => setShowMenu(!showMenu)}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {showMenu && (
        <div className="plant-menu">
          <button onClick={handleDelete}>Remove plant</button>
          <button onClick={() => setShowMenu(false)}>Cancel</button>
        </div>
      )}

      {showLatePrompt && (
        <div className="late-prompt">
          <span>Late watering — why?</span>
          <div className="late-buttons">
            <button className="late-btn wet" onClick={() => handleWater('still_wet')}>
              Still wet
            </button>
            <button className="late-btn busy" onClick={() => handleWater('too_busy')}>
              Too busy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
