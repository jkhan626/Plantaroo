import React, { useState, useEffect, useCallback } from 'react'
import { getAllPlants } from './db'
import TodayTab from './components/TodayTab'
import AllPlantsTab from './components/AllPlantsTab'
import HistoryTab from './components/HistoryTab'
import AddPlant from './components/AddPlant'
import BottomNav from './components/BottomNav'

export default function App() {
  const [tab, setTab] = useState('today')
  const [plants, setPlants] = useState([])
  const [showAddPlant, setShowAddPlant] = useState(false)

  const refreshPlants = useCallback(async () => {
    const all = await getAllPlants()
    setPlants(all)
  }, [])

  useEffect(() => {
    refreshPlants()
  }, [refreshPlants])

  return (
    <div className="app">
      <div className="app-content">
        {tab === 'today' && (
          <TodayTab plants={plants} onRefresh={refreshPlants} />
        )}
        {tab === 'plants' && (
          <AllPlantsTab
            plants={plants}
            onRefresh={refreshPlants}
            onAddPlant={() => setShowAddPlant(true)}
          />
        )}
        {tab === 'history' && (
          <HistoryTab plants={plants} />
        )}
      </div>

      {showAddPlant && (
        <AddPlant
          onClose={() => setShowAddPlant(false)}
          onSaved={() => {
            setShowAddPlant(false)
            refreshPlants()
          }}
        />
      )}

      <button className="fab" onClick={() => setShowAddPlant(true)}>+</button>
      <BottomNav tab={tab} onTabChange={setTab} />
    </div>
  )
}
