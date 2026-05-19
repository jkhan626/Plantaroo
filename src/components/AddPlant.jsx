import React, { useState } from 'react'
import { addPlant, SOIL_MULTIPLIERS, ROOMS, getCachedProfile, setCachedProfile } from '../db'
import { computeStartingInterval } from '../scheduling'

export default function AddPlant({ onClose, onSaved }) {
  const [step, setStep] = useState('form') // form | profile | saving
  const [name, setName] = useState('')
  const [room, setRoom] = useState(ROOMS[0])
  const [lightType, setLightType] = useState('grow')
  const [soilType, setSoilType] = useState('regular_perlite')
  const [photo, setPhoto] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPhoto(ev.target.result)
    reader.readAsDataURL(file)
  }

  const fetchProfile = async () => {
    setLoading(true)
    setError(null)

    const cacheKey = `${name.toLowerCase().trim()}__${soilType}`

    try {
      // Check cache first
      const cached = await getCachedProfile(cacheKey)
      if (cached) {
        const { cacheKey: _, ...rest } = cached
        setProfile(rest)
        setStep('profile')
        setLoading(false)
        return
      }

      const res = await fetch('/api/plant-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), soilType }),
      })

      if (!res.ok) throw new Error('Failed to get profile')

      const data = await res.json()
      setProfile(data)
      await setCachedProfile(cacheKey, data)
      setStep('profile')
    } catch (err) {
      setError('Could not fetch plant profile. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    const startingInterval = computeStartingInterval(profile.species_baseline_days, soilType)

    await addPlant({
      name: name.trim(),
      room,
      light_type: lightType,
      soil_type: soilType,
      photo,
      species_baseline_days: profile.species_baseline_days,
      moisture_pref: profile.moisture_pref,
      feed_every_n_waterings: profile.feed_every_n_waterings,
      fert_type: profile.fert_type,
      carnivore: profile.carnivore,
      water_source: profile.water_source,
      effective_starting_interval: startingInterval,
    })

    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{step === 'form' ? 'Add Plant' : 'Plant Profile'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {step === 'form' && (
          <div className="modal-body">
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alocasia Frydek"
                autoFocus
              />
            </label>

            <label className="field">
              <span>Room / Location</span>
              <select value={room} onChange={e => setRoom(e.target.value)}>
                {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>

            <label className="field">
              <span>Light Type</span>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${lightType === 'grow' ? 'active' : ''}`}
                  onClick={() => setLightType('grow')}
                  type="button"
                >
                  Grow light
                </button>
                <button
                  className={`toggle-btn ${lightType === 'natural' ? 'active' : ''}`}
                  onClick={() => setLightType('natural')}
                  type="button"
                >
                  Natural light
                </button>
              </div>
            </label>

            <label className="field">
              <span>Soil Type</span>
              <select value={soilType} onChange={e => setSoilType(e.target.value)}>
                {Object.entries(SOIL_MULTIPLIERS).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                className="photo-input"
              />
              {photo && <img src={photo} alt="Preview" className="photo-preview" />}
            </label>

            {error && <div className="error-msg">{error}</div>}

            <button
              className="primary-btn"
              onClick={fetchProfile}
              disabled={!name.trim() || loading}
            >
              {loading ? 'Looking up...' : 'Next'}
            </button>
          </div>
        )}

        {step === 'profile' && profile && (
          <div className="modal-body">
            <p className="profile-note">Review and adjust if needed:</p>

            <label className="field">
              <span>Baseline watering interval (days)</span>
              <input
                type="number"
                value={profile.species_baseline_days}
                onChange={e => setProfile({ ...profile, species_baseline_days: parseInt(e.target.value) || 7 })}
              />
            </label>

            <label className="field">
              <span>Moisture preference</span>
              <select
                value={profile.moisture_pref}
                onChange={e => setProfile({ ...profile, moisture_pref: e.target.value })}
              >
                <option value="moist">Moist</option>
                <option value="light_dry">Light dry (top inch)</option>
                <option value="moderate_dry">Moderate dry (top half)</option>
                <option value="full_dry">Full dry (whole pot)</option>
              </select>
            </label>

            <label className="field">
              <span>Feed every N waterings</span>
              <input
                type="number"
                value={profile.feed_every_n_waterings}
                onChange={e => setProfile({ ...profile, feed_every_n_waterings: parseInt(e.target.value) || 0 })}
              />
            </label>

            <label className="field">
              <span>Fertilizer type</span>
              <select
                value={profile.fert_type}
                onChange={e => setProfile({ ...profile, fert_type: e.target.value })}
              >
                <option value="balanced">Balanced</option>
                <option value="orchid_30_10_10">Orchid 30-10-10</option>
                <option value="high_phosphorus">High Phosphorus</option>
                <option value="none">None</option>
              </select>
            </label>

            <label className="field inline">
              <input
                type="checkbox"
                checked={profile.carnivore}
                onChange={e => setProfile({ ...profile, carnivore: e.target.checked })}
              />
              <span>Carnivorous plant</span>
            </label>

            <label className="field">
              <span>Water source</span>
              <select
                value={profile.water_source}
                onChange={e => setProfile({ ...profile, water_source: e.target.value })}
              >
                <option value="tap_ok">Tap OK</option>
                <option value="distilled_or_rain">Distilled or rain only</option>
              </select>
            </label>

            <div className="btn-row">
              <button className="secondary-btn" onClick={() => setStep('form')}>Back</button>
              <button className="primary-btn" onClick={handleSave}>Save Plant</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
