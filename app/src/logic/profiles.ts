/**
 * LOCAL PLANT DB — free, instant, offline profile resolution.
 *
 * This is the ONLY profile source for the app (no Claude API): exact-name
 * matches first, then genus/type substring patterns (first match wins).
 * Covers Jamal's collection, common houseplants, all the popular culinary
 * herbs, edibles, succulents, orchids, and carnivores.
 *
 * To extend coverage, add rows here — never needs the metered API.
 * Pattern ORDER is load-bearing: carnivores → specific herbs → generic herbs
 * → fruiting → specific genera → generic catch-alls. Schlumbergera before
 * `cactus`; `lemon balm`/`lemongrass` before any `lemon`.
 */
import type { PlantProfile, MoisturePref, FertType, WaterSource } from '../types';

function prof(
  b: number,
  m: MoisturePref,
  f: number,
  ft: FertType,
  c: boolean,
  w: WaterSource,
): PlantProfile {
  return {
    species_baseline_days: b,
    moisture_pref: m,
    feed_every_n_waterings: f,
    fert_type: ft,
    carnivore: c,
    water_source: w,
  };
}

// Jamal's collection + common houseplants (original web-app set).
const BASE_PROFILES: Record<string, PlantProfile> = {
  syngonium: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'umbrella tree': prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'dark lord': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'moth orchid': prof(10, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok'),
  'philodendron ring of fire': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'monkey mask': prof(10, 'moderate_dry', 3, 'balanced', false, 'tap_ok'),
  'heart leaf philodendron brasil': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'wax plant variegata': prof(14, 'full_dry', 4, 'high_phosphorus', false, 'tap_ok'),
  'neon pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'inch plant mini purple': prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'snake plant laurentii': prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  'white bird of paradise': prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'corn plant': prof(10, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'philodendron bloody mary': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron spiritus sancti': prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'alocasia platinum': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'alocasia frydek': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'alocasia dragon scale': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron pink princess': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'marble queen pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'cape sundew': prof(3, 'moist', 0, 'none', true, 'distilled_or_rain'),
  'begonia burning bush': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'zz plant': prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  'episcia slinky pink': prof(6, 'moist', 3, 'balanced', false, 'tap_ok'),
  'polka dot begonia benigo pink': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'pitcher plant mixed varieties': prof(3, 'moist', 0, 'none', true, 'distilled_or_rain'),
  'watermelon ivy pulchra': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'satin pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'thai constellation': prof(8, 'moist', 3, 'balanced', false, 'tap_ok'),

  monstera: prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'monstera deliciosa': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'swiss cheese plant': prof(9, 'moderate_dry', 3, 'balanced', false, 'tap_ok'),
  'fiddle leaf fig': prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'rubber plant': prof(10, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'peace lily': prof(6, 'moist', 3, 'balanced', false, 'tap_ok'),
  'spider plant': prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'golden pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  calathea: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  'prayer plant': prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  'boston fern': prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),
  'aloe vera': prof(18, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'jade plant': prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  'string of pearls': prof(14, 'full_dry', 4, 'balanced', false, 'tap_ok'),
  anthurium: prof(7, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  dieffenbachia: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  croton: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'bird of paradise': prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'lucky bamboo': prof(7, 'moist', 4, 'balanced', false, 'distilled_or_rain'),
  orchid: prof(10, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok'),
  'air plant': prof(5, 'moist', 4, 'balanced', false, 'distilled_or_rain'),
  'venus flytrap': prof(3, 'moist', 0, 'none', true, 'distilled_or_rain'),
  peperomia: prof(9, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  pilea: prof(7, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'chinese money plant': prof(7, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'money tree': prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'english ivy': prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'nerve plant': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'polka dot plant': prof(5, 'moist', 3, 'balanced', false, 'tap_ok'),
  coleus: prof(5, 'moist', 3, 'balanced', false, 'tap_ok'),
  'chinese evergreen': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  aglaonema: prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
};

// Expanded coverage: herbs, edibles, more tropicals, succulents, orchids, etc.
const EXTRA_PROFILES: Record<string, PlantProfile> = {
  // culinary herbs — soft (consistent moisture)
  basil: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  'sweet basil': prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  'thai basil': prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  'holy basil': prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  tulsi: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  mint: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  peppermint: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  spearmint: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  'chocolate mint': prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  parsley: prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'flat leaf parsley': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'italian parsley': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'curly parsley': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  cilantro: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  coriander: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  dill: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  chives: prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'garlic chives': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'lemon balm': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  chervil: prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  sorrel: prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'french sorrel': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  stevia: prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'summer savory': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  lemongrass: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  'lemon grass': prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  watercress: prof(2, 'moist', 3, 'balanced', false, 'tap_ok'),
  shiso: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  perilla: prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  tarragon: prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'french tarragon': prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok'),

  // culinary herbs — Mediterranean / woody (drier)
  rosemary: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  thyme: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'lemon thyme': prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'creeping thyme': prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  oregano: prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'greek oregano': prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  marjoram: prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'sweet marjoram': prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  sage: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'common sage': prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'pineapple sage': prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  lavender: prof(9, 'moderate_dry', 6, 'balanced', false, 'tap_ok'),
  'english lavender': prof(9, 'moderate_dry', 6, 'balanced', false, 'tap_ok'),
  'french lavender': prof(9, 'moderate_dry', 6, 'balanced', false, 'tap_ok'),
  'winter savory': prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'bay laurel': prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'bay leaf': prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  fennel: prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),

  // edible / fruiting in pots
  'cherry tomato': prof(2, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  tomato: prof(2, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  pepper: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  'chili pepper': prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  'bell pepper': prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  jalapeno: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  strawberry: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  'lemon tree': prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'meyer lemon': prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'lime tree': prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'orange tree': prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  calamondin: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  kumquat: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  citrus: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  microgreens: prof(1, 'moist', 0, 'none', false, 'tap_ok'),
  'green onion': prof(3, 'moist', 4, 'balanced', false, 'tap_ok'),
  scallion: prof(3, 'moist', 4, 'balanced', false, 'tap_ok'),
  ginger: prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),
  turmeric: prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),

  // tropical foliage / aroids
  'monstera adansonii': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'mini monstera': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  rhaphidophora: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron micans': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron birkin': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron selloum': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron hope': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'philodendron xanadu': prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  pothos: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'jade pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'pearls and jade pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'manjula pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'cebu blue pothos': prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'silver pothos': prof(9, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'silver satin': prof(9, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'arrowhead plant': prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  'arrowhead vine': prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  colocasia: prof(2, 'moist', 3, 'balanced', false, 'tap_ok'),
  'elephant ear': prof(3, 'moist', 3, 'balanced', false, 'tap_ok'),
  caladium: prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),
  'zz raven': prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok'),

  // dracaena / cordyline / ficus
  cordyline: prof(7, 'moist', 4, 'balanced', false, 'distilled_or_rain'),
  'ti plant': prof(7, 'moist', 4, 'balanced', false, 'distilled_or_rain'),
  'dracaena marginata': prof(10, 'light_dry', 4, 'balanced', false, 'distilled_or_rain'),
  'dragon tree': prof(10, 'light_dry', 4, 'balanced', false, 'distilled_or_rain'),
  'janet craig': prof(10, 'light_dry', 4, 'balanced', false, 'distilled_or_rain'),
  'fiddle leaf fig audrey': prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'ficus audrey': prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'ficus benjamina': prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'weeping fig': prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok'),

  // peperomia / pilea / hoya / scindapsus specifics
  'watermelon peperomia': prof(9, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'baby rubber plant': prof(10, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'string of turtles': prof(9, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),
  'hoya carnosa': prof(14, 'full_dry', 4, 'high_phosphorus', false, 'tap_ok'),
  'hoya kerrii': prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'sweetheart hoya': prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),

  // prayer-plant family (distilled)
  goeppertia: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  'rattlesnake plant': prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  'calathea orbifolia': prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  stromanthe: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  'stromanthe triostar': prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  ctenanthe: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),
  'never never plant': prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain'),

  // succulents & cacti
  echeveria: prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  haworthia: prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  gasteria: prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  sedum: prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  sempervivum: prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'hens and chicks': prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  lithops: prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'living stones': prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  kalanchoe: prof(12, 'full_dry', 4, 'high_phosphorus', false, 'tap_ok'),
  'panda plant': prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'burros tail': prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'donkey tail': prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'string of bananas': prof(14, 'full_dry', 4, 'balanced', false, 'tap_ok'),
  'string of dolphins': prof(14, 'full_dry', 4, 'balanced', false, 'tap_ok'),
  'string of hearts': prof(14, 'full_dry', 4, 'balanced', false, 'tap_ok'),
  'christmas cactus': prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  'thanksgiving cactus': prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  'easter cactus': prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  'prickly pear': prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'barrel cactus': prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'moon cactus': prof(18, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'bunny ear cactus': prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  euphorbia: prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'pencil cactus': prof(18, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  agave: prof(18, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok'),
  'ponytail palm': prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  'sago palm': prof(12, 'moderate_dry', 4, 'balanced', false, 'tap_ok'),

  // ferns
  'maidenhair fern': prof(2, 'moist', 4, 'balanced', false, 'tap_ok'),
  'birds nest fern': prof(5, 'moist', 4, 'balanced', false, 'tap_ok'),
  'staghorn fern': prof(5, 'moist', 4, 'balanced', false, 'tap_ok'),
  'kimberly queen fern': prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),
  'rabbits foot fern': prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),
  'button fern': prof(4, 'moist', 4, 'balanced', false, 'tap_ok'),
  'asparagus fern': prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok'),

  // orchids
  phalaenopsis: prof(10, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok'),
  dendrobium: prof(8, 'light_dry', 2, 'orchid_30_10_10', false, 'tap_ok'),
  cattleya: prof(8, 'moderate_dry', 2, 'orchid_30_10_10', false, 'tap_ok'),
  oncidium: prof(7, 'light_dry', 2, 'orchid_30_10_10', false, 'tap_ok'),
  paphiopedilum: prof(7, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok'),
  'ladys slipper orchid': prof(7, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok'),
  vanda: prof(3, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok'),

  // flowering / seasonal
  'african violet': prof(6, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  streptocarpus: prof(6, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  gloxinia: prof(5, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  bromeliad: prof(7, 'light_dry', 4, 'balanced', false, 'distilled_or_rain'),
  guzmania: prof(7, 'light_dry', 4, 'balanced', false, 'distilled_or_rain'),
  aechmea: prof(7, 'light_dry', 4, 'balanced', false, 'distilled_or_rain'),
  cyclamen: prof(5, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  'gerbera daisy': prof(4, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  poinsettia: prof(5, 'light_dry', 3, 'balanced', false, 'tap_ok'),
  hibiscus: prof(4, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  jasmine: prof(5, 'moist', 3, 'high_phosphorus', false, 'tap_ok'),
  gardenia: prof(4, 'moist', 3, 'high_phosphorus', false, 'distilled_or_rain'),
  geranium: prof(6, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  pelargonium: prof(6, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  clivia: prof(9, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),
  amaryllis: prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok'),

  // palms & large foliage
  'areca palm': prof(6, 'moist', 4, 'balanced', false, 'tap_ok'),
  'parlor palm': prof(7, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'majesty palm': prof(5, 'moist', 4, 'balanced', false, 'tap_ok'),
  'kentia palm': prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'cat palm': prof(6, 'moist', 4, 'balanced', false, 'tap_ok'),
  'fishtail palm': prof(6, 'moist', 4, 'balanced', false, 'tap_ok'),
  'banana plant': prof(4, 'moist', 3, 'balanced', false, 'tap_ok'),

  // air plants / epiphytes
  tillandsia: prof(5, 'moist', 4, 'balanced', false, 'distilled_or_rain'),
  'spanish moss': prof(4, 'moist', 4, 'balanced', false, 'distilled_or_rain'),

  // carnivorous
  'cobra lily': prof(3, 'moist', 0, 'none', true, 'distilled_or_rain'),
  darlingtonia: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain'),
  bladderwort: prof(2, 'moist', 0, 'none', true, 'distilled_or_rain'),
  utricularia: prof(2, 'moist', 0, 'none', true, 'distilled_or_rain'),
  'tropical pitcher plant': prof(3, 'moist', 0, 'none', true, 'distilled_or_rain'),

  // misc common
  'snake plant': prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok'),
  pachira: prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok'),
  'norfolk island pine': prof(7, 'moist', 4, 'balanced', false, 'tap_ok'),
};

// Merge via spread so any accidental key overlap silently resolves (no compile error).
export const LOCAL_PROFILES: Record<string, PlantProfile> = {
  ...BASE_PROFILES,
  ...EXTRA_PROFILES,
};

// Substring patterns — FIRST MATCH WINS. Order is load-bearing.
export const LOCAL_PROFILE_PATTERNS: { match: string; p: PlantProfile }[] = [
  // --- carnivores (beat every generic rule) ---
  { match: 'flytrap', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'sundew', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'drosera', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'pitcher', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'nepenthes', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'sarracenia', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'butterwort', p: prof(4, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'pinguicula', p: prof(4, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'cobra lily', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'darlingtonia', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'bladderwort', p: prof(2, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'utricularia', p: prof(2, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'venus', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },
  { match: 'carnivor', p: prof(3, 'moist', 0, 'none', true, 'distilled_or_rain') },

  // --- soft herbs (specific lemon-* before any lemon) ---
  { match: 'lemon balm', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'lemongrass', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'lemon grass', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'lemon thyme', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'holy basil', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'basil', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'ocimum', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'spearmint', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'peppermint', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'mint', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'mentha', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'parsley', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'petroselinum', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'cilantro', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'coriander', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'dill', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'chives', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'chervil', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'sorrel', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'stevia', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'shiso', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'perilla', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'watercress', p: prof(2, 'moist', 3, 'balanced', false, 'tap_ok') },

  // --- Mediterranean / woody herbs (specific sage variants before sage) ---
  { match: 'russian sage', p: prof(9, 'moderate_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'pineapple sage', p: prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'sage', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'salvia', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'rosemary', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'rosmarinus', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'thyme', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'thymus', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'oregano', p: prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'marjoram', p: prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'origanum', p: prof(6, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'winter savory', p: prof(7, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'savory', p: prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'tarragon', p: prof(5, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'lavender', p: prof(9, 'moderate_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'lavandula', p: prof(9, 'moderate_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'bay laurel', p: prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'fennel', p: prof(4, 'moist', 4, 'balanced', false, 'tap_ok') },

  // --- fruiting / edible ---
  { match: 'cherry tomato', p: prof(2, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'tomato', p: prof(2, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'jalapeno', p: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'chili', p: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'pepper', p: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'strawberry', p: prof(3, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'microgreen', p: prof(1, 'moist', 0, 'none', false, 'tap_ok') },
  { match: 'green onion', p: prof(3, 'moist', 4, 'balanced', false, 'tap_ok') },
  { match: 'scallion', p: prof(3, 'moist', 4, 'balanced', false, 'tap_ok') },
  { match: 'ginger', p: prof(4, 'moist', 4, 'balanced', false, 'tap_ok') },
  { match: 'turmeric', p: prof(4, 'moist', 4, 'balanced', false, 'tap_ok') },
  { match: 'meyer lemon', p: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'lemon tree', p: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'calamondin', p: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'kumquat', p: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'citrus', p: prof(6, 'light_dry', 3, 'balanced', false, 'tap_ok') },

  // --- orchids ---
  { match: 'orchid', p: prof(10, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok') },
  { match: 'phalaenopsis', p: prof(10, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok') },
  { match: 'dendrobium', p: prof(8, 'light_dry', 2, 'orchid_30_10_10', false, 'tap_ok') },
  { match: 'cattleya', p: prof(8, 'moderate_dry', 2, 'orchid_30_10_10', false, 'tap_ok') },
  { match: 'oncidium', p: prof(7, 'light_dry', 2, 'orchid_30_10_10', false, 'tap_ok') },
  { match: 'paphiopedilum', p: prof(7, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok') },
  { match: 'vanda', p: prof(3, 'moist', 2, 'orchid_30_10_10', false, 'tap_ok') },

  // --- hoya / wax ---
  { match: 'wax plant', p: prof(14, 'full_dry', 4, 'high_phosphorus', false, 'tap_ok') },
  { match: 'hoya', p: prof(14, 'full_dry', 4, 'high_phosphorus', false, 'tap_ok') },

  // --- snake / zz ---
  { match: 'snake plant', p: prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'sansevieria', p: prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'zz', p: prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok') },

  // --- prayer-plant family (distilled) — specific genera before calathea ---
  { match: 'goeppertia', p: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain') },
  { match: 'stromanthe', p: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain') },
  { match: 'ctenanthe', p: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain') },
  { match: 'calathea', p: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain') },
  { match: 'maranta', p: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain') },
  { match: 'prayer plant', p: prof(5, 'moist', 3, 'balanced', false, 'distilled_or_rain') },
  { match: 'fittonia', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'nerve plant', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },

  // --- succulents & cacti — Schlumbergera before cactus ---
  { match: 'christmas cactus', p: prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'thanksgiving cactus', p: prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'easter cactus', p: prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'lithops', p: prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'sempervivum', p: prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'kalanchoe', p: prof(12, 'full_dry', 4, 'high_phosphorus', false, 'tap_ok') },
  { match: 'sedum', p: prof(14, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'gasteria', p: prof(18, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'agave', p: prof(18, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'euphorbia', p: prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'ponytail', p: prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'sago', p: prof(12, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'cactus', p: prof(21, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'succulent', p: prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'echeveria', p: prof(16, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'haworthia', p: prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'aloe', p: prof(18, 'full_dry', 6, 'high_phosphorus', false, 'tap_ok') },
  { match: 'jade plant', p: prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'crassula', p: prof(16, 'full_dry', 6, 'balanced', false, 'tap_ok') },
  { match: 'string of', p: prof(14, 'full_dry', 4, 'balanced', false, 'tap_ok') },

  // --- ferns ---
  { match: 'fern', p: prof(4, 'moist', 4, 'balanced', false, 'tap_ok') },

  // --- aroids / foliage ---
  { match: 'alocasia', p: prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'colocasia', p: prof(2, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'caladium', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'elephant ear', p: prof(3, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'rhaphidophora', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'philodendron', p: prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'monstera', p: prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'pothos', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'epipremnum', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'scindapsus', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'syngonium', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'arrowhead', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'anthurium', p: prof(7, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'aglaonema', p: prof(9, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'dieffenbachia', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },

  // --- other foliage ---
  { match: 'begonia', p: prof(8, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'peperomia', p: prof(9, 'moderate_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'hypoestes', p: prof(5, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'polka dot', p: prof(5, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'tradescantia', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'inch plant', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'wandering', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'pilea', p: prof(7, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'cordyline', p: prof(7, 'moist', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'ti plant', p: prof(7, 'moist', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'dracaena', p: prof(10, 'light_dry', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'corn plant', p: prof(10, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'ficus', p: prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'fig', p: prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'rubber', p: prof(10, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'schefflera', p: prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'umbrella', p: prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'bird of paradise', p: prof(10, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'spider plant', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'pachira', p: prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'money tree', p: prof(9, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'peace lily', p: prof(6, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'spathiphyllum', p: prof(6, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'norfolk', p: prof(7, 'moist', 4, 'balanced', false, 'tap_ok') },
  { match: 'banana', p: prof(4, 'moist', 3, 'balanced', false, 'tap_ok') },

  // --- flowering / seasonal ---
  { match: 'african violet', p: prof(6, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'saintpaulia', p: prof(6, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'streptocarpus', p: prof(6, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'gloxinia', p: prof(5, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'bromeliad', p: prof(7, 'light_dry', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'guzmania', p: prof(7, 'light_dry', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'aechmea', p: prof(7, 'light_dry', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'cyclamen', p: prof(5, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'gerbera', p: prof(4, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'poinsettia', p: prof(5, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'hibiscus', p: prof(4, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'jasmine', p: prof(5, 'moist', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'gardenia', p: prof(4, 'moist', 3, 'high_phosphorus', false, 'distilled_or_rain') },
  { match: 'geranium', p: prof(6, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'pelargonium', p: prof(6, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'clivia', p: prof(9, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'amaryllis', p: prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },
  { match: 'hippeastrum', p: prof(8, 'light_dry', 3, 'high_phosphorus', false, 'tap_ok') },

  // --- generic catch-alls (broadest — last) ---
  { match: 'palm', p: prof(8, 'light_dry', 4, 'balanced', false, 'tap_ok') },
  { match: 'croton', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
  { match: 'coleus', p: prof(5, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'episcia', p: prof(6, 'moist', 3, 'balanced', false, 'tap_ok') },
  { match: 'bamboo', p: prof(7, 'moist', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'air plant', p: prof(5, 'moist', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'tillandsia', p: prof(5, 'moist', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'spanish moss', p: prof(4, 'moist', 4, 'balanced', false, 'distilled_or_rain') },
  { match: 'ivy', p: prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok') },
];

/**
 * CARE-TASK DEFAULTS (Phase 2) — misting + leaf-cleaning cadences layered
 * onto every profile match (exact or pattern) by name. FIRST MATCH WINS per
 * task. Humidity lovers (prayer-plant family, ferns, carnivores, aroids with
 * thin leaves) get misting; big smooth-leaf plants (ficus, monstera,
 * dracaena…) get monthly leaf cleaning. Plants matching neither get nothing —
 * zero noise.
 */
const TASK_DEFAULT_PATTERNS: { match: string; mist?: number; clean?: number }[] = [
  // prayer-plant family + thin-leaf humidity lovers — frequent misting
  { match: 'calathea', mist: 2 },
  { match: 'goeppertia', mist: 2 },
  { match: 'maranta', mist: 2 },
  { match: 'ctenanthe', mist: 2 },
  { match: 'stromanthe', mist: 2 },
  { match: 'prayer plant', mist: 2 },
  { match: 'fern', mist: 2 },
  { match: 'fittonia', mist: 2 },
  { match: 'nerve plant', mist: 2 },
  { match: 'air plant', mist: 3 },
  { match: 'tillandsia', mist: 3 },
  { match: 'spanish moss', mist: 2 },
  // carnivores that appreciate humidity
  { match: 'sundew', mist: 2 },
  { match: 'drosera', mist: 2 },
  { match: 'nepenthes', mist: 2 },
  { match: 'pitcher', mist: 2 },
  { match: 'flytrap', mist: 3 },
  { match: 'venus', mist: 3 },
  // other humidity lovers
  { match: 'episcia', mist: 3 },
  { match: 'caladium', mist: 3 },
  { match: 'polka dot', mist: 3 },
  { match: 'hypoestes', mist: 3 },
  { match: 'banana', mist: 3 },
  { match: 'orchid', mist: 3 },
  { match: 'phalaenopsis', mist: 3 },
  { match: 'anthurium', mist: 3, clean: 30 },
  { match: 'alocasia', mist: 3, clean: 30 },
  { match: 'elephant ear', mist: 3, clean: 30 },
  { match: 'peace lily', mist: 3, clean: 30 },
  { match: 'spathiphyllum', mist: 3, clean: 30 },

  // big smooth leaves — monthly cleaning keeps photosynthesis humming
  { match: 'fiddle leaf', clean: 30 },
  { match: 'rubber', clean: 30 },
  { match: 'ficus', clean: 30 },
  { match: 'fig', clean: 30 },
  { match: 'monstera', clean: 30 },
  { match: 'swiss cheese', clean: 30 },
  { match: 'thai constellation', clean: 30 },
  { match: 'monkey mask', clean: 30 },
  { match: 'philodendron', clean: 30 },
  { match: 'pothos', clean: 45 },
  { match: 'epipremnum', clean: 45 },
  { match: 'scindapsus', clean: 45 },
  { match: 'dracaena', clean: 30 },
  { match: 'corn plant', clean: 30 },
  { match: 'dieffenbachia', clean: 30 },
  { match: 'aglaonema', clean: 30 },
  { match: 'chinese evergreen', clean: 30 },
  { match: 'schefflera', clean: 30 },
  { match: 'umbrella', clean: 30 },
  { match: 'bird of paradise', clean: 30 },
  { match: 'money tree', clean: 45 },
  { match: 'pachira', clean: 45 },
  { match: 'croton', clean: 30 },
  { match: 'snake plant', clean: 45 },
  { match: 'sansevieria', clean: 45 },
  { match: 'zz', clean: 45 },
  { match: 'hoya', clean: 45 },
  { match: 'wax plant', clean: 45 },
];

/** Mist/clean defaults for a plant name (empty object when none apply). */
export function taskDefaultsFor(name: string): {
  mist_every_days?: number;
  clean_every_days?: number;
} {
  const n = normalizePlantName(name);
  if (!n) return {};
  let mist: number | undefined;
  let clean: number | undefined;
  for (const t of TASK_DEFAULT_PATTERNS) {
    if (n.indexOf(t.match) === -1) continue;
    if (mist === undefined && t.mist !== undefined) mist = t.mist;
    if (clean === undefined && t.clean !== undefined) clean = t.clean;
    if (mist !== undefined && clean !== undefined) break;
  }
  const out: { mist_every_days?: number; clean_every_days?: number } = {};
  if (mist !== undefined) out.mist_every_days = mist;
  if (clean !== undefined) out.clean_every_days = clean;
  return out;
}

export function normalizePlantName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/['"`’]/g, '') // drop quotes/apostrophes
    .replace(/[^a-z0-9]+/g, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fresh profile from the bundled DB (with task defaults), or null if unknown. */
export function localProfileLookup(name: string): PlantProfile | null {
  const n = normalizePlantName(name);
  if (!n) return null;
  if (LOCAL_PROFILES[n]) return { ...LOCAL_PROFILES[n], ...taskDefaultsFor(name) };
  for (const { match, p } of LOCAL_PROFILE_PATTERNS) {
    if (n.indexOf(match) !== -1) return { ...p, ...taskDefaultsFor(name) };
  }
  return null;
}

/** Manual-entry default when nothing matches (user reviews/edits before saving). */
export function defaultProfile(): PlantProfile {
  return prof(7, 'light_dry', 3, 'balanced', false, 'tap_ok');
}

/** Total coverage count (for display/debug). */
export const PROFILE_COUNT =
  Object.keys(LOCAL_PROFILES).length + LOCAL_PROFILE_PATTERNS.length;
