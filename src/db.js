import Dexie from 'dexie'

export const db = new Dexie('PlantarooDB')

db.version(1).stores({
  plants: '++id, name, room, light_type',
  history: '++id, plantId, type, date',
  profileCache: 'cacheKey',
})

// Soil multiplier table — never from API
export const SOIL_MULTIPLIERS = {
  'chunky_aroid': { label: 'Forbidden Cereal / Chunky Aroid', multiplier: 0.45 },
  'orchid_bark': { label: 'Pure Orchid Bark', multiplier: 0.5 },
  'sphagnum_moss': { label: 'Sphagnum Moss', multiplier: 0.7 },
  'regular_perlite': { label: 'Regular Potting + Perlite', multiplier: 1.0 },
  'cactus_gritty': { label: 'Cactus / Succulent Gritty', multiplier: 1.3 },
  'carnivore_peat': { label: 'Carnivore Peat/Perlite', multiplier: null }, // kept-wet mode
}

export const ROOMS = ['Bedroom', 'Living Room', 'Office', 'Front Window', 'Side Window', 'Kitchen', 'Bathroom']

export const MOISTURE_PREFS = ['moist', 'light_dry', 'moderate_dry', 'full_dry']
export const FERT_TYPES = ['balanced', 'orchid_30_10_10', 'high_phosphorus', 'none']
export const WATER_SOURCES = ['tap_ok', 'distilled_or_rain']

export async function addPlant(plantData) {
  const id = await db.plants.add({
    ...plantData,
    current_interval: plantData.effective_starting_interval,
    recent_valid_gaps: [],
    last_watered: null,
    last_fertilized: null,
    no_fert_until: null,
    watering_count: 0,
    created_at: new Date().toISOString(),
  })
  return id
}

export async function removePlant(id) {
  await db.plants.delete(id)
  await db.history.where('plantId').equals(id).delete()
}

export async function getAllPlants() {
  return db.plants.toArray()
}

export async function getPlant(id) {
  return db.plants.get(id)
}

export async function updatePlant(id, changes) {
  await db.plants.update(id, changes)
}

export async function addHistoryEntry(entry) {
  await db.history.add({
    ...entry,
    date: new Date().toISOString(),
  })
}

export async function getHistory(plantId) {
  if (plantId) {
    return db.history.where('plantId').equals(plantId).reverse().sortBy('date')
  }
  return db.history.reverse().sortBy('date')
}

export async function getCachedProfile(key) {
  return db.profileCache.get(key)
}

export async function setCachedProfile(key, profile) {
  await db.profileCache.put({ cacheKey: key, ...profile })
}
