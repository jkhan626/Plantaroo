import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'

const app = express()
app.use(cors())
app.use(express.json())

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

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Plantaroo server running on port ${PORT}`)
})
