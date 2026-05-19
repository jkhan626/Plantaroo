import { SOIL_MULTIPLIERS } from './db'

// Compute effective starting interval from API baseline + soil
export function computeStartingInterval(baselineDays, soilType) {
  const soil = SOIL_MULTIPLIERS[soilType]
  if (!soil || soil.multiplier === null) {
    // Carnivore peat — kept-wet mode, use short interval
    return 2
  }
  return Math.round(baselineDays * soil.multiplier * 10) / 10
}

// Seasonal multiplier — applied at display time, never stored
export function getSeasonalMultiplier(lightType) {
  if (lightType === 'grow') return 1.0

  const month = new Date().getMonth() + 1 // 1-12
  if (month >= 11 || month <= 2) return 1.3       // Nov–Feb deep winter
  if (month >= 9 && month <= 10) return 1.15       // Sep–Oct shoulder
  return 1.0
}

// Clamp learned interval to 0.5x–2x of starting interval
function clampInterval(learned, starting) {
  return Math.max(starting * 0.5, Math.min(starting * 2, learned))
}

// Compute next due date
export function getNextDue(plant) {
  if (!plant.last_watered) return null

  const starting = computeStartingInterval(plant.species_baseline_days, plant.soil_type)
  const clamped = clampInterval(plant.current_interval, starting)
  const seasonal = getSeasonalMultiplier(plant.light_type)
  const effectiveDays = clamped * seasonal

  const lastWatered = new Date(plant.last_watered)
  const nextDue = new Date(lastWatered)
  nextDue.setDate(nextDue.getDate() + Math.round(effectiveDays))
  return nextDue
}

// Days until next watering (negative = overdue)
export function getDaysUntil(plant) {
  const nextDue = getNextDue(plant)
  if (!nextDue) return null

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(nextDue)
  due.setHours(0, 0, 0, 0)

  return Math.round((due - now) / (1000 * 60 * 60 * 24))
}

// Is a feed due on the next watering?
export function isFeedDue(plant) {
  if (plant.carnivore || plant.fert_type === 'none') return false
  if (plant.no_fert_until && new Date() < new Date(plant.no_fert_until)) return false
  if (!plant.feed_every_n_waterings || plant.feed_every_n_waterings <= 0) return false

  return (plant.watering_count + 1) % plant.feed_every_n_waterings === 0
}

// Record a watering and update the learning model
export function processWatering(plant, reason) {
  const now = new Date()
  const updates = {
    last_watered: now.toISOString(),
    watering_count: (plant.watering_count || 0) + 1,
  }

  if (plant.last_watered) {
    const lastDate = new Date(plant.last_watered)
    const gapDays = (now - lastDate) / (1000 * 60 * 60 * 24)

    // reason: 'on_time' | 'still_wet' | 'too_busy'
    if (reason !== 'too_busy') {
      // Valid gap — add to rolling average
      const gaps = [...(plant.recent_valid_gaps || []), gapDays].slice(-5)
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
      updates.recent_valid_gaps = gaps
      updates.current_interval = Math.round(avg * 10) / 10
    }
    // too_busy: discard gap, reset anchor to now, interval unchanged
  }

  return updates
}

// Check if a watering is late
export function isLate(plant) {
  const daysUntil = getDaysUntil(plant)
  return daysUntil !== null && daysUntil < 0
}

// Status text for display
export function getStatusText(plant) {
  if (!plant.last_watered) return 'Not watered yet'

  const days = getDaysUntil(plant)
  if (days === null) return 'Not watered yet'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `in ${days} days`
}

// Status color class
export function getStatusColor(plant) {
  const days = getDaysUntil(plant)
  if (days === null) return 'new'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 2) return 'soon'
  return 'upcoming'
}
