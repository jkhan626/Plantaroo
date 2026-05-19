import React from 'react'
import PlantCard from './PlantCard'
import { getDaysUntil } from '../scheduling'

export default function TodayTab({ plants, onRefresh }) {
  // Plants due today or overdue, grouped by room
  const duePlants = plants
    .filter(p => {
      const days = getDaysUntil(p)
      return days !== null && days <= 0
    })
    .sort((a, b) => getDaysUntil(a) - getDaysUntil(b))

  // Plants not yet watered
  const newPlants = plants.filter(p => !p.last_watered)

  // Group by room
  const roomGroups = {}
  duePlants.forEach(p => {
    if (!roomGroups[p.room]) roomGroups[p.room] = []
    roomGroups[p.room].push(p)
  })

  const hasNothing = duePlants.length === 0 && newPlants.length === 0

  return (
    <div className="tab-content">
      <h1 className="tab-title">Today</h1>

      {hasNothing && (
        <div className="empty-state">
          <p>Nothing needs water today.</p>
          <p className="empty-sub">Tap + to add your first plant.</p>
        </div>
      )}

      {Object.keys(roomGroups).map(room => (
        <div key={room} className="room-group">
          <h2 className="room-title">{room}</h2>
          {roomGroups[room].map(plant => (
            <PlantCard key={plant.id} plant={plant} onRefresh={onRefresh} />
          ))}
        </div>
      ))}

      {newPlants.length > 0 && (
        <div className="room-group">
          <h2 className="room-title">New — needs first watering</h2>
          {newPlants.map(plant => (
            <PlantCard key={plant.id} plant={plant} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  )
}
