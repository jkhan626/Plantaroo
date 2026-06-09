import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import jwt from 'jsonwebtoken'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors({
  origin: ['https://jkhan626.github.io', 'http://localhost:5173', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'OPTIONS']
}))
app.use(express.json())

// Health check for Render keep-alive
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve index.html at root (for local dev)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'))
})

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

app.post('/api/plant-profile', async (req, res) => {
  const { name, soilType } = req.body

  if (!name) {
    return res.status(400).json({ error: 'Plant name is required' })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `You are a plant care expert. Given the plant "${name}" grown in "${soilType || 'regular potting mix with perlite'}" soil, return ONLY a JSON object with exactly these 6 fields, no prose, no markdown fences:

{
  "species_baseline_days": <number, days between waterings in average indoor conditions>,
  "moisture_pref": "<moist | light_dry | moderate_dry | full_dry>",
  "feed_every_n_waterings": <number>,
  "fert_type": "<balanced | orchid_30_10_10 | high_phosphorus | none>",
  "carnivore": <true | false>,
  "water_source": "<tap_ok | distilled_or_rain>"
}

Return ONLY the JSON object.`,
        },
      ],
    })

    const text = message.content[0].text.trim()
    const profile = JSON.parse(text)
    res.json(profile)
  } catch (err) {
    console.error('Plant profile error:', err.message)
    res.status(500).json({ error: 'Failed to get plant profile' })
  }
})

// Sign in with Apple token revocation (App Store 5.1.1(v)) — called by the iOS
// app during account deletion with the authorizationCode from a fresh sign-in.
// Requires a SiwA key from the Apple Developer portal, configured on Render as:
//   APPLE_TEAM_ID      (e.g. AK6GDSF62K)
//   APPLE_KEY_ID       (the .p8 key id)
//   APPLE_PRIVATE_KEY  (the .p8 file contents; \n-escaped is fine)
// Until those are set this returns 501 and the app treats revocation as
// best-effort, so deletion still completes.
const APPLE_CLIENT_ID = 'com.jamalkhan.plantaroo'

app.post('/api/apple-revoke', async (req, res) => {
  const { authorizationCode } = req.body ?? {}
  if (!authorizationCode) {
    return res.status(400).json({ error: 'authorizationCode is required' })
  }
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = process.env
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    return res.status(501).json({ error: 'Apple revocation not configured' })
  }

  try {
    const clientSecret = jwt.sign({}, APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), {
      algorithm: 'ES256',
      expiresIn: '5m',
      audience: 'https://appleid.apple.com',
      issuer: APPLE_TEAM_ID,
      subject: APPLE_CLIENT_ID,
      keyid: APPLE_KEY_ID,
    })

    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APPLE_CLIENT_ID,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    const token = tokens.refresh_token ?? tokens.access_token
    if (!token) {
      console.error('Apple token exchange failed:', tokens.error ?? tokenRes.status)
      return res.status(502).json({ error: 'Apple token exchange failed' })
    }

    const revokeRes = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APPLE_CLIENT_ID,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
      }),
    })
    if (!revokeRes.ok) {
      console.error('Apple revoke failed:', revokeRes.status)
      return res.status(502).json({ error: 'Apple revoke failed' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Apple revocation error:', err.message)
    res.status(500).json({ error: 'Apple revocation failed' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Plantaroo server running on port ${PORT}`)
})
