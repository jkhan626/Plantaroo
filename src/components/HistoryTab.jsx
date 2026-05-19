import React, { useState, useEffect } from 'react'
import { getHistory } from '../db'

export default function HistoryTab({ plants }) {
  const [entries, setEntries] = useState([])
  const [filterPlantId, setFilterPlantId] = useState(null)

  useEffect(() => {
    loadHistory()
  }, [filterPlantId])

  const loadHistory = async () => {
    const all = await getHistory(filterPlantId)
    setEntries(all)
  }

  const getPlantName = (plantId) => {
    const p = plants.find(pl => pl.id === plantId)
    return p ? p.name : 'Deleted plant'
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7) return `${diff} days ago`
    return d.toLocaleDateString()
  }

  const typeLabel = (type) => {
    switch (type) {
      case 'water': return 'Watered'
      case 'water+feed': return 'Watered + Fed'
      case 'repot': return 'Repotted'
      default: return type
    }
  }

  return (
    <div className="tab-content">
      <h1 className="tab-title">History</h1>

      <div className="filter-bar">
        <div className="filter-row">
          <button
            className={`filter-chip ${filterPlantId === null ? 'active' : ''}`}
            onClick={() => setFilterPlantId(null)}
          >
            All
          </button>
          {plants.map(p => (
            <button
              key={p.id}
              className={`filter-chip ${filterPlantId === p.id ? 'active' : ''}`}
              onClick={() => setFilterPlantId(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 && (
        <div className="empty-state">
          <p>No history yet. Water a plant to get started.</p>
        </div>
      )}

      <div className="history-list">
        {entries.map(entry => (
          <div key={entry.id} className="history-entry">
            <div className="history-type">{typeLabel(entry.type)}</div>
            <div className="history-details">
              <span className="history-plant">{getPlantName(entry.plantId)}</span>
              <span className="history-date">{formatDate(entry.date)}</span>
            </div>
            {entry.reason && entry.reason !== 'on_time' && (
              <span className="history-reason">
                {entry.reason === 'still_wet' ? 'Was still wet' : 'Was too busy'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
