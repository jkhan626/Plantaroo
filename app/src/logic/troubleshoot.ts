/**
 * SYMPTOM TROUBLESHOOTER (Phase 3) — a rule-based decision tree, $0 forever.
 *
 * Pick a symptom → answer 1–2 follow-ups → diagnosis + fix. The twist that
 * paid "AI diagnosis" apps can't match: diagnoses are informed by the
 * plant's OWN watering history (learned interval vs species baseline,
 * current overdue state, water source, humidity preference).
 */
import type { Plant } from '../types';
import {
  getClampedInterval,
  getEffectiveStartingInterval,
  getDaysUntilDue,
} from './schedule';
import { careInfoLookup } from './careInfo';

export interface TSOption {
  label: string;
  value: string;
}
export interface TSQuestion {
  id: string;
  text: string;
  options: TSOption[];
}
export interface TSDiagnosis {
  title: string;
  body: string;
  /** "From this plant's data" line — the part competitors can't do. */
  dataNote?: string;
}

export const SYMPTOMS: { id: string; label: string }[] = [
  { id: 'yellow', label: 'Yellow leaves' },
  { id: 'brown_tips', label: 'Brown tips or edges' },
  { id: 'drooping', label: 'Drooping or wilting' },
  { id: 'leggy', label: 'Leggy, stretched growth' },
  { id: 'leaf_drop', label: 'Dropping leaves' },
  { id: 'pests', label: 'Bugs or sticky residue' },
  { id: 'mushy', label: 'Mushy stems or smelly soil' },
  { id: 'no_growth', label: 'Not growing' },
];

// ---- watering-pace analysis (the data-informed core) --------------------
type Pace = 'fast' | 'slow' | 'normal';

function getPace(plant: Plant): { pace: Pace; learned: number; baseline: number } {
  const learned = getClampedInterval(plant);
  const baseline = getEffectiveStartingInterval(plant);
  const ratio = learned / baseline;
  const pace: Pace = ratio < 0.8 ? 'fast' : ratio > 1.25 ? 'slow' : 'normal';
  return { pace, learned, baseline };
}

function paceNote(plant: Plant): string | undefined {
  const { pace, learned, baseline } = getPace(plant);
  if ((plant.recent_valid_gaps || []).length < 2) return undefined; // not enough evidence
  if (pace === 'fast') {
    return `You water ${plant.name} about every ${learned.toFixed(1)} days — noticeably faster than the ~${baseline.toFixed(0)}-day rhythm typical for it in your soil. That points toward overwatering.`;
  }
  if (pace === 'slow') {
    return `You water ${plant.name} about every ${learned.toFixed(1)} days — slower than the ~${baseline.toFixed(0)}-day rhythm typical for it in your soil. That points toward underwatering.`;
  }
  return undefined;
}

function overdueNote(plant: Plant): string | undefined {
  if (!plant.last_watered) return undefined;
  const d = getDaysUntilDue(plant);
  if (d < -1) return `It's currently ${Math.abs(d)} days past its watering due date.`;
  if (d === -1) return `It's currently 1 day past its watering due date.`;
  return undefined;
}

// ---- follow-up questions per symptom ------------------------------------
const WET_DRY: TSQuestion = {
  id: 'soil',
  text: 'How does the soil feel an inch or two down?',
  options: [
    { label: 'Wet or soggy', value: 'wet' },
    { label: 'Bone dry', value: 'dry' },
    { label: 'Lightly moist — about right', value: 'ok' },
  ],
};

export function getQuestions(symptomId: string): TSQuestion[] {
  switch (symptomId) {
    case 'yellow':
      return [
        {
          id: 'which',
          text: 'Which leaves are turning yellow?',
          options: [
            { label: 'Older, lower leaves', value: 'old' },
            { label: 'New growth', value: 'new' },
            { label: 'All over', value: 'all' },
          ],
        },
        WET_DRY,
      ];
    case 'brown_tips':
      return [
        {
          id: 'pattern',
          text: 'What does the browning look like?',
          options: [
            { label: 'Crispy tips and edges', value: 'tips' },
            { label: 'Brown patches mid-leaf', value: 'patches' },
            { label: 'Soft brown areas', value: 'soft' },
          ],
        },
        {
          id: 'water',
          text: 'What water does it usually get?',
          options: [
            { label: 'Straight tap water', value: 'tap' },
            { label: 'Filtered, distilled, or rain', value: 'filtered' },
          ],
        },
      ];
    case 'drooping':
      return [
        WET_DRY,
        {
          id: 'recent',
          text: 'Any big changes in the last two weeks?',
          options: [
            { label: 'Moved, repotted, or near a draft', value: 'yes' },
            { label: 'Nothing changed', value: 'no' },
          ],
        },
      ];
    case 'leggy':
      return [
        {
          id: 'lean',
          text: 'Is it leaning or stretching toward the window?',
          options: [
            { label: 'Yes, noticeably', value: 'yes' },
            { label: 'No, just sparse all over', value: 'no' },
          ],
        },
      ];
    case 'leaf_drop':
      return [
        {
          id: 'recent',
          text: 'Any big changes recently?',
          options: [
            { label: 'Moved, repotted, or season changed', value: 'yes' },
            { label: 'Nothing changed', value: 'no' },
          ],
        },
        WET_DRY,
      ];
    case 'pests':
      return [
        {
          id: 'kind',
          text: 'What are you seeing?',
          options: [
            { label: 'Fine webbing, tiny specks', value: 'mites' },
            { label: 'White cottony fluff', value: 'mealy' },
            { label: 'Tiny flies around the soil', value: 'gnats' },
            { label: 'Sticky residue or brown bumps', value: 'scale' },
          ],
        },
      ];
    case 'mushy':
      return [
        {
          id: 'smell',
          text: 'Does the soil smell sour or rotten?',
          options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ],
        },
      ];
    case 'no_growth':
      return [
        {
          id: 'roots',
          text: 'Are roots circling the surface or poking out the drainage holes?',
          options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ],
        },
      ];
    default:
      return [];
  }
}

// ---- diagnosis -----------------------------------------------------------
export function diagnose(
  plant: Plant,
  symptomId: string,
  answers: Record<string, string>,
): TSDiagnosis {
  const care = careInfoLookup(plant.name);
  const { pace } = getPace(plant);
  const month = new Date().getMonth() + 1;
  const isWinter = month >= 11 || month <= 2;

  switch (symptomId) {
    case 'yellow': {
      if (answers.soil === 'wet' || (answers.soil === 'ok' && pace === 'fast')) {
        return {
          title: 'Likely overwatering',
          body: 'Yellowing with wet soil means the roots are suffocating. Let the pot dry out properly before the next watering, and when Plantaroo prompts a late watering, choose "Still wet — it lasted" so the schedule stretches to match.',
          dataNote: paceNote(plant),
        };
      }
      if (answers.soil === 'dry') {
        return {
          title: 'Likely underwatering',
          body: 'Yellowing plus bone-dry soil means it ran out before you got there. Water thoroughly until it drains, and try to water when the app says due rather than after.',
          dataNote: paceNote(plant) ?? overdueNote(plant),
        };
      }
      if (answers.which === 'old') {
        return {
          title: 'Normal leaf aging',
          body: 'A plant retiring its oldest, lowest leaves now and then is healthy housekeeping, not a problem. Snip them off and move on — if several yellow at once, recheck the watering.',
        };
      }
      if (answers.which === 'new') {
        return {
          title: 'Possible nutrient shortfall',
          body: 'Yellow NEW growth (especially with green veins) usually means iron or general nutrition. Check the feed schedule is actually happening, and refresh the top inch of soil if it has been over a year.',
        };
      }
      return {
        title: 'Watering rhythm is the first suspect',
        body: 'All-over yellowing without an obvious soil clue usually traces back to watering rhythm or light. Confirm the soil check before each watering and that it gets the light it wants.',
        dataNote: paceNote(plant),
      };
    }

    case 'brown_tips': {
      const mineralSensitive = plant.water_source === 'distilled_or_rain';
      if (answers.pattern === 'tips' && answers.water === 'tap' && mineralSensitive) {
        return {
          title: 'Tap-water mineral burn',
          body: `${plant.name} is sensitive to the minerals, chlorine, and fluoride in tap water — crispy tips are the classic symptom. Switch to distilled, rain, or filtered water; existing brown tips won't heal, but new growth will come in clean.`,
          dataNote: 'This plant is flagged distilled-or-rain in its care profile.',
        };
      }
      if (answers.pattern === 'tips' && care?.humidity_pref === 'high') {
        return {
          title: 'Dry air',
          body: 'This is a high-humidity plant, and crispy edges are how it complains about dry rooms. Group it with other plants, use a pebble tray, or run a humidifier nearby — misting helps briefly but a humidifier actually fixes it.',
          dataNote: paceNote(plant),
        };
      }
      if (answers.pattern === 'patches') {
        return {
          title: 'Possible sunburn',
          body: 'Brown patches in the middle of leaves usually mean direct sun is hitting foliage that wants filtered light. Pull it back from the glass or add a sheer curtain.',
        };
      }
      if (answers.pattern === 'soft') {
        return {
          title: 'Water stress',
          body: 'Soft brown areas point at watering rather than air. Check the soil before each watering and make sure the pot drains freely.',
          dataNote: paceNote(plant),
        };
      }
      return {
        title: 'Dry air or salts',
        body: 'Crispy tips on an otherwise healthy plant are usually dry air or fertilizer salt buildup. Flush the pot through with plenty of water once, and raise humidity if you can.',
      };
    }

    case 'drooping': {
      if (answers.soil === 'dry') {
        return {
          title: 'Thirsty',
          body: 'Dry soil plus drooping is straightforward — water thoroughly until it drains and it should perk up within hours.',
          dataNote: overdueNote(plant) ?? paceNote(plant),
        };
      }
      if (answers.soil === 'wet') {
        return {
          title: 'Drooping from overwatering',
          body: "Wilting with WET soil is the dangerous kind — roots can't breathe, so the plant can't drink. Hold off watering until it dries well down, and check the roots if it doesn't improve: white is healthy, brown and soft is rot.",
          dataNote: paceNote(plant),
        };
      }
      if (answers.recent === 'yes') {
        return {
          title: 'Transplant or relocation shock',
          body: 'Moves, repots, and drafts all cause temporary sulking. Keep conditions steady and care normal — most plants settle within a couple of weeks.',
        };
      }
      return {
        title: 'Check roots and rhythm',
        body: 'Moist soil, no recent changes, but still drooping — slide it out of the pot and look at the roots. White and firm: keep watch. Brown and mushy: trim the rot and repot in fresh dry mix.',
        dataNote: paceNote(plant),
      };
    }

    case 'leggy': {
      const note =
        plant.light_type === 'grow'
          ? 'It’s under a grow light — try lengthening the on-time to 12–14 hours or moving the light closer.'
          : care?.light_needs === 'full_sun'
            ? 'Its care profile calls for full sun — a typical windowsill may simply not be enough.'
            : undefined;
      return {
        title: 'Not enough light',
        body:
          answers.lean === 'yes'
            ? 'Stretching toward the window is a plant begging for more light. Move it closer, rotate the pot a quarter-turn weekly, and trim the leggiest stems to encourage bushier regrowth.'
            : 'Sparse, stretched growth with long gaps between leaves means the light is too weak overall. Brighter placement first, then trim back the leggy stems — they fill in once the light supports it.',
        dataNote: note,
      };
    }

    case 'leaf_drop': {
      if (answers.recent === 'yes') {
        return {
          title: 'Adjustment shock',
          body: 'Sudden leaf drop right after a move, repot, or season change is a tantrum, not a death spiral (ficus are famous for it). Hold conditions steady and keep watering normally — new leaves follow once it settles.',
        };
      }
      if (answers.soil === 'wet') {
        return {
          title: 'Overwatering',
          body: 'Steady leaf drop with wet soil points at struggling roots. Let it dry out properly and confirm the pot actually drains.',
          dataNote: paceNote(plant),
        };
      }
      if (answers.soil === 'dry') {
        return {
          title: 'Underwatering',
          body: 'Dropping leaves to save water is a drought response. Water thoroughly now and tighten up the schedule.',
          dataNote: overdueNote(plant) ?? paceNote(plant),
        };
      }
      return {
        title: 'Watch the pattern',
        body: 'Occasional single leaves are normal turnover. If it accelerates, check light (too little drops inner leaves) and drafts from vents or cold windows.',
      };
    }

    case 'pests': {
      if (answers.kind === 'mites') {
        return {
          title: 'Spider mites',
          body: 'Webbing plus tiny specks = spider mites, and they love dry air. Shower the whole plant, then spray all leaf undersides with insecticidal soap or neem weekly for 3 weeks. Raising humidity slows them way down.',
          dataNote: care?.humidity_pref === 'high' ? 'This plant wants high humidity anyway — fixing the air helps both problems.' : undefined,
        };
      }
      if (answers.kind === 'mealy') {
        return {
          title: 'Mealybugs',
          body: 'The white fluff hides slow-moving sap suckers. Dab each cluster with a cotton swab dipped in rubbing alcohol, repeat weekly, and quarantine the plant — they travel.',
        };
      }
      if (answers.kind === 'gnats') {
        return {
          title: 'Fungus gnats',
          body: 'The flies are annoying; their larvae live in constantly damp topsoil. Let the top two inches dry out between waterings, add yellow sticky traps, and consider a top layer of sand or grit.',
          dataNote: paceNote(plant) ?? 'Gnats almost always mean the soil surface is staying wet too long.',
        };
      }
      return {
        title: 'Scale or aphids',
        body: 'Sticky honeydew with brown bumps is scale; on soft new growth it’s aphids. Scrape bumps off with a fingernail or alcohol swab, spray new growth with insecticidal soap, and repeat weekly until clear.',
      };
    }

    case 'mushy': {
      return {
        title: answers.smell === 'yes' ? 'Root rot — act now' : 'Early rot risk',
        body:
          answers.smell === 'yes'
            ? 'Sour smell plus mush means active rot. Unpot today: trim every brown, soft root with clean scissors, rinse, and repot in fresh dry mix in a clean pot. Water lightly and not again until it truly dries.'
            : 'Mushy stems without smell may still be early rot or stem damage. Unpot and inspect the roots — white and firm is fine; trim anything brown and soft and repot in fresh mix.',
        dataNote: paceNote(plant),
      };
    }

    case 'no_growth': {
      if (isWinter && plant.light_type !== 'grow') {
        return {
          title: 'Winter rest — this is normal',
          body: 'Most houseplants pause or crawl from November through February; light is the limit, not your care. Plantaroo already slows its watering schedule in winter. Growth resumes with the spring light.',
          dataNote: 'Its seasonal multiplier is active right now, so the schedule already expects this.',
        };
      }
      if (answers.roots === 'yes') {
        return {
          title: 'Rootbound',
          body: 'Circling, escaping roots mean the pot is the bottleneck. Repot one size up (about 2 inches wider) in spring, and log it with the Repot action so feeding pauses while it recovers.',
        };
      }
      return {
        title: 'Probably light or food',
        body: 'In the growing season, stalled growth is usually light first and nutrition second. Brighter placement beats more fertilizer — but if it hasn’t been fed in months, resume the feed schedule too.',
        dataNote: paceNote(plant),
      };
    }

    default:
      return {
        title: 'No diagnosis',
        body: 'Pick a symptom to get started.',
      };
  }
}
