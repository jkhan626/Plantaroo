import React, { useState } from 'react'
import PlantCard from './PlantCard'
import { ROOMS } from '../db'
import { getDaysUntil } from '../scheduling'

export default function AllPlantsTab({ plants, onRefresh, onAddPlant }) {
  const [selectedRooms, setSelectedRooms] = useState([])
  const [lightFilter, setLightFilter] = useState(null) // null | 'grow' | 'natural'

  const toggleRoom = (room) => {
    setSelectedRooms(prev =>
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    )
  }

  const toggleLight = (type) => {
    setLightFilter(prev => prev === type ? null : type)
  }

  let filtered = plants
  if (selectedRooms.length > 0) {
    filtered = filtered.filter(p => selectedRooms.includes(p.room))
  }
  if (lightFilter) {
    filtered = filtered.filter(p => p.light_type === lightFilter)
  }

  // Sort: due soonest first, then by name
  filtered.sort((a, b) => {
    const da = getDaysUntil(a)
    const db = getDaysUntil(b)
    if (da === null && db === null) return a.name.localeCompare(b.name)
    if (da === null) return 1
    if (db === null) return -1
    return da - db
  })

  // Unique rooms from actual plants
  const activeRooms = [...new Set(plants.map(p => p.room))]

  return (
    <div className="tab-content">
      <h1 className="tab-title">All Plants</h1>

      <div className="filter-bar">
        <div className="filter-row">
          {activeRooms.map(room => (
            <button
              key={room}
              className={`filter-chip ${selectedRooms.includes(room) ? 'active' : ''}`}
              onClick={() => toggleRoom(room)}
            >
              {room}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <button
            className={`filter-chip ${lightFilter === 'grow' ? 'active' : ''}`}
            onClick={() => toggleLight('grow')}
          >
            Grow light
          </button>
          <button
            className={`filter-chip ${lightFilter === 'natural' ? 'active' : ''}`}
            onClick={() => toggleLight('natural')}
          >
            Natural light
          </button>
        </div>
      </div>

      <div className="plant-count">{filtered.length} plant{filtered.length !== 1 ? 's' : ''}</div>

      {filtered.map(plant => (
        <PlantCard key={plant.id} plant={plant} onRefresh={onRefresh} />
      ))}

      {filtered.length === 0 && (
        <div className="empty-state">
          <p>No plants match your filters.</p>
        </div>
      )}
    </div>
  )
}
