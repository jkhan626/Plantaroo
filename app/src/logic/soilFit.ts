/**
 * SOIL SUITABILITY (reviewed against the full bundled plant DB) — which of
 * the six soil mixes suit each plant family. Used to warn (never block) when
 * a chosen mix is a poor fit: wrong soil holds too much or too little water
 * AND skews the soil multiplier that anchors the watering schedule.
 *
 * Pattern rules mirror profiles.ts — FIRST MATCH WINS, order load-bearing
 * (soft 'lemon balm' before citrus 'lemon', 'christmas cactus' grouped with
 * succulents, etc). First soil in each list is the recommendation.
 * Plants with no entry (and non-carnivores in anything except carnivore
 * peat) never warn — unknown plants are the user's call.
 */
import type { SoilType } from '../types';
import { SOIL_TABLE } from './constants';
import { normalizePlantName } from './profiles';

type Fit = { match: string; soils: SoilType[] };

const group = (soils: SoilType[], matches: string[]): Fit[] =>
  matches.map((match) => ({ match, soils }));

const SOIL_FIT_PATTERNS: Fit[] = [
  // --- soft herbs (before citrus so 'lemon balm'/'lemongrass' resolve here) ---
  ...group(
    ['regular_perlite'],
    ['lemon balm', 'lemongrass', 'lemon grass', 'basil', 'ocimum', 'mint', 'mentha',
     'parsley', 'cilantro', 'coriander', 'dill', 'chives', 'chervil', 'sorrel',
     'stevia', 'shiso', 'perilla', 'watercress', 'fennel'],
  ),
  // --- Mediterranean / woody herbs — standard or gritty, never water-retentive ---
  ...group(
    ['regular_perlite', 'cactus_gritty'],
    ['rosemary', 'rosmarinus', 'thyme', 'thymus', 'sage', 'salvia', 'oregano',
     'marjoram', 'origanum', 'savory', 'tarragon', 'lavender', 'lavandula',
     'bay laurel', 'geranium', 'pelargonium'],
  ),
  // --- fruiting / edible ---
  ...group(
    ['regular_perlite'],
    ['tomato', 'jalapeno', 'chili', 'pepper', 'strawberry', 'microgreen',
     'green onion', 'scallion', 'ginger', 'turmeric', 'meyer lemon', 'lemon tree',
     'calamondin', 'kumquat', 'citrus', 'banana'],
  ),
  // --- orchids — bark (or moss), never potting soil ---
  ...group(
    ['orchid_bark', 'sphagnum_moss'],
    ['phalaenopsis', 'moth orchid', 'dendrobium', 'cattleya', 'oncidium',
     'paphiopedilum', 'vanda', 'orchid'],
  ),
  // --- epiphytes that want airy chunky mixes ---
  ...group(
    ['chunky_aroid', 'orchid_bark', 'regular_perlite'],
    ['hoya', 'wax plant', 'bromeliad', 'guzmania', 'aechmea', 'anthurium'],
  ),
  // --- air plants — no soil at all; sphagnum only as display ---
  ...group(['sphagnum_moss'], ['air plant', 'tillandsia', 'spanish moss']),
  // --- succulents, cacti & drought storers ---
  ...group(
    ['cactus_gritty', 'regular_perlite'],
    ['christmas cactus', 'thanksgiving cactus', 'easter cactus', 'lithops',
     'sempervivum', 'kalanchoe', 'sedum', 'gasteria', 'agave', 'euphorbia',
     'ponytail', 'sago', 'cactus', 'succulent', 'echeveria', 'haworthia', 'aloe',
     'jade plant', 'crassula', 'string of', 'snake plant', 'sansevieria', 'zz',
     'peperomia', 'pilea', 'chinese money'],
  ),
  // --- prayer plants, ferns & moisture-loving softies ---
  ...group(
    ['regular_perlite', 'sphagnum_moss'],
    ['fern', 'calathea', 'goeppertia', 'maranta', 'ctenanthe', 'stromanthe',
     'prayer plant', 'fittonia', 'nerve plant', 'episcia', 'african violet',
     'saintpaulia', 'streptocarpus', 'gloxinia', 'begonia'],
  ),
  // --- climbing aroids — chunky first ---
  ...group(
    ['chunky_aroid', 'regular_perlite'],
    ['monstera', 'swiss cheese', 'thai constellation', 'monkey mask', 'dark lord',
     'philodendron', 'pothos', 'epipremnum', 'scindapsus', 'rhaphidophora',
     'syngonium', 'arrowhead'],
  ),
  // --- ground aroids & moisture-retaining tropicals — standard first ---
  ...group(
    ['regular_perlite', 'chunky_aroid'],
    ['alocasia', 'colocasia', 'caladium', 'elephant ear', 'aglaonema',
     'chinese evergreen', 'dieffenbachia', 'peace lily', 'spathiphyllum'],
  ),
  // --- common foliage & flowering — standard potting + perlite ---
  ...group(
    ['regular_perlite'],
    ['ficus', 'fig', 'rubber', 'fiddle', 'dracaena', 'corn plant', 'cordyline',
     'ti plant', 'schefflera', 'umbrella', 'bird of paradise', 'spider plant',
     'money tree', 'pachira', 'croton', 'coleus', 'tradescantia', 'inch plant',
     'wandering', 'polka dot', 'hypoestes', 'ivy', 'palm', 'norfolk', 'hibiscus',
     'jasmine', 'gardenia', 'cyclamen', 'gerbera', 'poinsettia', 'clivia',
     'amaryllis', 'hippeastrum'],
  ),
];

function fitFor(name: string): SoilType[] | null {
  const n = normalizePlantName(name);
  if (!n) return null;
  for (const { match, soils } of SOIL_FIT_PATTERNS) {
    if (n.indexOf(match) !== -1) return soils;
  }
  return null;
}

export interface SoilWarning {
  title: string;
  message: string;
  /** Best soil to offer as the one-tap fix. */
  recommended: SoilType;
}

function labelList(soils: SoilType[]): string {
  const labels = soils.map((s) => SOIL_TABLE[s].short);
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

/**
 * Warn (or null) for a plant + chosen soil. Carnivores are the hard case:
 * any nutrient-holding mix can kill them. Non-carnivores warn on carnivore
 * peat universally, and on family mismatches when the plant is recognized.
 */
export function soilWarning(
  name: string,
  carnivore: boolean,
  chosen: SoilType,
): SoilWarning | null {
  if (carnivore) {
    if (chosen === 'carnivore_peat' || chosen === 'sphagnum_moss') return null;
    return {
      title: 'Risky soil for a carnivore',
      message: `${SOIL_TABLE[chosen].short} contains minerals and nutrients that burn carnivorous plants' roots — it can kill them. They need mineral-free carnivore peat (or pure sphagnum).`,
      recommended: 'carnivore_peat',
    };
  }
  if (chosen === 'carnivore_peat') {
    const fit = fitFor(name);
    return {
      title: 'Carnivore peat is a special case',
      message:
        'Carnivore peat is kept permanently wet and has no nutrients — it only suits carnivorous plants. Most other plants will rot or starve in it.',
      recommended: fit?.[0] ?? 'regular_perlite',
    };
  }
  const fit = fitFor(name);
  if (!fit || fit.indexOf(chosen) !== -1) return null;
  const plantLabel = name.trim() || 'This plant';
  return {
    title: 'Unusual soil for this plant',
    message: `${plantLabel} usually does best in ${labelList(fit)}. ${SOIL_TABLE[chosen].short} may hold too much or too little water for it, and it also skews the watering schedule Plantaroo computes from the soil.`,
    recommended: fit[0],
  };
}
