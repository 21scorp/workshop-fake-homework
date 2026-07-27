/**
 * astra.js — the roster.
 *
 * Design rules for the roster:
 *  • Every rarity tier is *playable*. A Common you like beats an SSR you don't;
 *    higher rarity means more expressive, not strictly stronger.
 *  • Each Astra changes how the run *feels*, not just its damage number.
 *    That is what makes people re-roll for a specific one.
 *  • Silhouette (form) + colour (element) must be distinguishable in a 3-second
 *    clip. If two Astra look alike in a thumbnail, one of them is wrong.
 *
 * `form` maps to a procedural drawer today and to a sprite folder tomorrow —
 * the sprite key is literally `astra/${form}/idle`.
 */

import { RARITY } from './constants.js';

/**
 * @typedef {Object} Astra
 * @property {string} id
 * @property {string} name
 * @property {string} title
 * @property {number} rarity
 * @property {string} element
 * @property {string} form            sprite family
 * @property {{primary:string, secondary:string}} colors
 * @property {Object} stats           base stats at ★1
 * @property {Object} weapon          firing pattern config
 * @property {Object} passive         always-on effect
 * @property {Object} ult             active ability
 * @property {string} lore
 */

/** @type {Astra[]} */
export const ASTRA = [

  /* ================= COMMON ================= */

  {
    id: 'pip', name: 'Pip', title: 'de Eerste Vonk',
    rarity: RARITY.C, element: 'lumen', form: 'orb',
    colors: { primary: '#facc15', secondary: '#fef9c3' },
    stats: { power: 10, fireRate: 5.4, projectiles: 1, spread: 0, speed: 1.0, hp: 3, crit: 0.05, critDmg: 1.6, magnet: 1.0 },
    weapon: { type: 'straight', bullet: 'bullet/basic', bulletSpeed: 900, pierce: 0 },
    passive: { key: 'steady', name: 'Standvastig', desc: '+8% schade zolang je niet beweegt.' },
    ult: { key: 'flare', name: 'Fakkel', cost: 100, desc: 'Een lichtflits verdooft alles op het scherm 2s.' },
    lore: 'De eerste Astra die ooit antwoordde. Klein, koppig, altijd wakker.',
  },
  {
    id: 'cinder', name: 'Cinder', title: 'Sintel',
    rarity: RARITY.C, element: 'ember', form: 'wisp',
    colors: { primary: '#fb7185', secondary: '#fed7aa' },
    stats: { power: 8, fireRate: 7.0, projectiles: 1, spread: 0.05, speed: 1.05, hp: 3, crit: 0.06, critDmg: 1.6, magnet: 1.0 },
    weapon: { type: 'straight', bullet: 'bullet/basic', bulletSpeed: 980, pierce: 0, burn: 0.5 },
    passive: { key: 'ignite', name: 'Ontsteking', desc: 'Treffers laten vijanden 2s branden.' },
    ult: { key: 'firewall', name: 'Vuurmuur', cost: 100, desc: 'Een brandende lijn over het scherm, 3s.' },
    lore: 'Wat overblijft als een ster uitdooft, en het er niet mee eens is.',
  },
  {
    id: 'pebble', name: 'Pebble', title: 'Kiezel',
    rarity: RARITY.C, element: 'terra', form: 'construct',
    // Stone, not gold. Sharing a palette with SOLARIS made a Common and an
    // SSR of the same form read as the same character on a collection card.
    colors: { primary: '#a8a29e', secondary: '#e7e5e4' },
    stats: { power: 14, fireRate: 3.4, projectiles: 1, spread: 0, speed: 0.9, hp: 4, crit: 0.04, critDmg: 1.8, magnet: 0.9 },
    weapon: { type: 'straight', bullet: 'bullet/shard', bulletSpeed: 700, pierce: 1, knockback: 60 },
    passive: { key: 'bulwark', name: 'Bolwerk', desc: '+1 maximale HP.' },
    ult: { key: 'quake', name: 'Beving', cost: 110, desc: 'Schokgolf die alles wegduwt en verdooft.' },
    lore: 'Traag. Zwaar. Heeft nooit iemand teleurgesteld.',
  },
  {
    id: 'breeze', name: 'Breeze', title: 'Zuchtje',
    rarity: RARITY.C, element: 'gale', form: 'orb',
    colors: { primary: '#5eead4', secondary: '#ccfbf1' },
    stats: { power: 7, fireRate: 8.4, projectiles: 1, spread: 0.08, speed: 1.2, hp: 3, crit: 0.08, critDmg: 1.5, magnet: 1.15 },
    weapon: { type: 'straight', bullet: 'bullet/basic', bulletSpeed: 1150, pierce: 0 },
    passive: { key: 'swift', name: 'Rap', desc: '+12% bewegingssnelheid.' },
    ult: { key: 'gust', name: 'Windstoot', cost: 90, desc: 'Blaast alle vijandelijke kogels weg.' },
    lore: 'Te licht om te vangen, te snel om te raken.',
  },
  {
    id: 'droplet', name: 'Droplet', title: 'Druppel',
    rarity: RARITY.C, element: 'tide', form: 'bloom',
    colors: { primary: '#38bdf8', secondary: '#bae6fd' },
    stats: { power: 9, fireRate: 5.0, projectiles: 2, spread: 0.16, speed: 1.0, hp: 3, crit: 0.05, critDmg: 1.6, magnet: 1.05 },
    weapon: { type: 'spread', bullet: 'bullet/basic', bulletSpeed: 860, pierce: 0, slow: 0.25 },
    passive: { key: 'flow', name: 'Stroming', desc: 'Geraakte vijanden bewegen 20% trager.' },
    ult: { key: 'deluge', name: 'Stortvloed', cost: 100, desc: 'Een golf regen die alles vertraagt en raakt.' },
    lore: 'Eén druppel is niets. Dat zeggen ze tot de vloed komt.',
  },

  /* ================= RARE ================= */

  {
    id: 'flint', name: 'Flint', title: 'Vuursteen',
    rarity: RARITY.R, element: 'ember', form: 'blade',
    colors: { primary: '#f43f5e', secondary: '#fdba74' },
    stats: { power: 11, fireRate: 5.8, projectiles: 3, spread: 0.22, speed: 1.0, hp: 3, crit: 0.1, critDmg: 1.7, magnet: 1.0 },
    weapon: { type: 'spread', bullet: 'bullet/shard', bulletSpeed: 940, pierce: 0, burn: 0.8 },
    passive: { key: 'sparks', name: 'Vonkenregen', desc: 'Kritieke treffers ontsteken een tweede vonk.' },
    ult: { key: 'inferno', name: 'Inferno', cost: 110, desc: 'Ring van vuur die 4s meedraait.' },
    lore: 'Sla hem hard genoeg en hij geeft je een heel vuur terug.',
  },
  {
    id: 'ripple', name: 'Ripple', title: 'Rimpeling',
    rarity: RARITY.R, element: 'tide', form: 'serpent',
    colors: { primary: '#0ea5e9', secondary: '#7dd3fc' },
    stats: { power: 13, fireRate: 4.1, projectiles: 1, spread: 0, speed: 1.05, hp: 3, crit: 0.07, critDmg: 1.7, magnet: 1.1 },
    weapon: { type: 'wave', bullet: 'bullet/orb', bulletSpeed: 780, pierce: 2, slow: 0.3, amplitude: 60 },
    passive: { key: 'undertow', name: 'Onderstroom', desc: 'Kogels gaan door 2 extra vijanden heen.' },
    ult: { key: 'maelstrom', name: 'Maalstroom', cost: 120, desc: 'Draaikolk die vijanden naar het midden zuigt.' },
    lore: 'Beweegt in cirkels tot de cirkel iets doorsnijdt.',
  },
  {
    id: 'zephyr', name: 'Zephyr', title: 'Westenwind',
    rarity: RARITY.R, element: 'gale', form: 'wisp',
    colors: { primary: '#2dd4bf', secondary: '#99f6e4' },
    stats: { power: 6, fireRate: 13.0, projectiles: 2, spread: 0.1, speed: 1.25, hp: 2, crit: 0.14, critDmg: 1.6, magnet: 1.2 },
    weapon: { type: 'straight', bullet: 'bullet/basic', bulletSpeed: 1280, pierce: 0 },
    passive: { key: 'tailwind', name: 'Rugwind', desc: 'Elke kill geeft 1s +25% vuursnelheid, stapelt tot 5x.' },
    ult: { key: 'cyclone', name: 'Cycloon', cost: 95, desc: 'Wordt 3s onkwetsbaar en ramt door alles heen.' },
    lore: 'Gaat te snel om bang te zijn.',
  },
  {
    id: 'boulder', name: 'Boulder', title: 'Rotsblok',
    rarity: RARITY.R, element: 'terra', form: 'construct',
    colors: { primary: '#d97706', secondary: '#fcd34d' },
    stats: { power: 26, fireRate: 1.7, projectiles: 1, spread: 0, speed: 0.82, hp: 5, crit: 0.05, critDmg: 2.0, magnet: 0.9 },
    weapon: { type: 'lob', bullet: 'bullet/orb', bulletSpeed: 560, pierce: 0, splash: 70, knockback: 120 },
    passive: { key: 'unmoved', name: 'Onwrikbaar', desc: '+2 HP, maar 15% trager.' },
    ult: { key: 'meteor', name: 'Meteoor', cost: 130, desc: 'Drie inslagen met enorme splash.' },
    lore: 'Er is geen haast in iets dat een berg is geweest.',
  },
  {
    id: 'umbra', name: 'Umbra', title: 'Schaduwbeest',
    rarity: RARITY.R, element: 'void', form: 'beast',
    colors: { primary: '#7c3aed', secondary: '#c4b5fd' },
    stats: { power: 15, fireRate: 4.4, projectiles: 1, spread: 0, speed: 1.02, hp: 3, crit: 0.12, critDmg: 1.9, magnet: 1.3 },
    weapon: { type: 'homing', bullet: 'bullet/orb', bulletSpeed: 640, pierce: 0, turnRate: 3.2 },
    passive: { key: 'feast', name: 'Feestmaal', desc: 'Elke 25 kills herstelt 1 HP.' },
    ult: { key: 'devour', name: 'Verslinden', cost: 120, desc: 'Zwart gat dat 3s alles naar binnen trekt.' },
    lore: 'Het beest tussen de sterren dat de sterren opeet.',
  },
  {
    id: 'glim', name: 'Glim', title: 'Glimlicht',
    rarity: RARITY.R, element: 'lumen', form: 'orb',
    colors: { primary: '#fde047', secondary: '#fefce8' },
    stats: { power: 9, fireRate: 6.1, projectiles: 1, spread: 0, speed: 1.05, hp: 3, crit: 0.15, critDmg: 1.8, magnet: 1.25 },
    weapon: { type: 'chain', bullet: 'bullet/basic', bulletSpeed: 1000, chains: 2, chainRange: 160 },
    passive: { key: 'refract', name: 'Weerkaatsing', desc: 'Treffers ketsen door naar 2 vijanden.' },
    ult: { key: 'prismbeam', name: 'Prismastraal', cost: 105, desc: 'Straal die splitst bij elke vijand.' },
    lore: 'Licht dat besloot niet in een rechte lijn te reizen.',
  },

  /* ================= SUPERIOR ================= */

  {
    id: 'pyra', name: 'Pyra', title: 'Vlamdanseres',
    rarity: RARITY.SR, element: 'ember', form: 'wisp',
    colors: { primary: '#f97316', secondary: '#fef08a' },
    stats: { power: 7, fireRate: 18.0, projectiles: 1, spread: 0.34, speed: 1.08, hp: 3, crit: 0.1, critDmg: 1.7, magnet: 1.1 },
    weapon: { type: 'cone', bullet: 'bullet/basic', bulletSpeed: 620, range: 320, burn: 1.4, pierce: 99 },
    passive: { key: 'wildfire', name: 'Laaiend', desc: 'Brandende vijanden verspreiden vuur bij hun dood.' },
    ult: { key: 'supernova', name: 'Supernova', cost: 130, desc: 'Explodeert in een groeiende vuurbol.' },
    lore: 'Ze danst omdat stilstaan haar zou doven.',
  },
  {
    id: 'nautilus', name: 'Nautilus', title: 'Diepteschelp',
    rarity: RARITY.SR, element: 'tide', form: 'bloom',
    colors: { primary: '#0284c7', secondary: '#a5f3fc' },
    stats: { power: 16, fireRate: 2.6, projectiles: 4, spread: 0, speed: 0.98, hp: 4, crit: 0.08, critDmg: 1.8, magnet: 1.15 },
    weapon: { type: 'orbit', bullet: 'bullet/orb', orbitRadius: 90, orbitSpeed: 2.6, slow: 0.35 },
    passive: { key: 'shell', name: 'Schild', desc: 'Krijgt elke 12s een schild dat 1 klap opvangt.' },
    ult: { key: 'tsunami', name: 'Tsunami', cost: 125, desc: 'Muur van water die het scherm opveegt.' },
    lore: 'Draagt een oceaan met zich mee, voor het geval dat.',
  },
  {
    id: 'tempest', name: 'Tempest', title: 'Stormslang',
    rarity: RARITY.SR, element: 'gale', form: 'serpent',
    colors: { primary: '#14b8a6', secondary: '#e0f2fe' },
    stats: { power: 19, fireRate: 4.8, projectiles: 2, spread: 0.12, speed: 1.18, hp: 3, crit: 0.16, critDmg: 1.85, magnet: 1.2 },
    weapon: { type: 'pierce', bullet: 'bullet/shard', bulletSpeed: 1400, pierce: 99, knockback: 40 },
    passive: { key: 'draft', name: 'Zog', desc: 'Kogels versnellen hoe verder ze reizen.' },
    ult: { key: 'thunderline', name: 'Donderlijn', cost: 115, desc: 'Vijf bliksemschichten van boven naar beneden.' },
    lore: 'De storm heeft geen kop en geen staart, alleen richting.',
  },
  {
    id: 'basalt', name: 'Basalt', title: 'Bergbreker',
    rarity: RARITY.SR, element: 'terra', form: 'beast',
    colors: { primary: '#b45309', secondary: '#fde68a' },
    stats: { power: 34, fireRate: 1.4, projectiles: 1, spread: 0, speed: 0.88, hp: 5, crit: 0.06, critDmg: 2.3, magnet: 0.95 },
    weapon: { type: 'slam', bullet: 'bullet/orb', splash: 130, knockback: 200, stun: 0.6 },
    passive: { key: 'aftershock', name: 'Naschok', desc: 'Elke 4e treffer veroorzaakt een schokgolf.' },
    ult: { key: 'fissure', name: 'Kloof', cost: 140, desc: 'Splijt het scherm; alles erin neemt zware schade.' },
    lore: 'Als hij landt, verandert de kaart.',
  },
  {
    id: 'nyx', name: 'Nyx', title: 'Nachtjager',
    rarity: RARITY.SR, element: 'void', form: 'beast',
    colors: { primary: '#8b5cf6', secondary: '#f0abfc' },
    stats: { power: 14, fireRate: 7.4, projectiles: 3, spread: 0.5, speed: 1.1, hp: 3, crit: 0.2, critDmg: 2.0, magnet: 1.4 },
    weapon: { type: 'homing', bullet: 'bullet/shard', bulletSpeed: 720, turnRate: 5.5, pierce: 0 },
    passive: { key: 'hunt', name: 'Jacht', desc: '+35% kritieke kans op vijanden onder 40% HP.' },
    ult: { key: 'eclipse', name: 'Eclips', cost: 120, desc: 'Alles op het scherm wordt gemarkeerd en neemt 3x schade.' },
    lore: 'Ze jaagt niet op wat sterk is. Ze jaagt op wat bijna dood is.',
  },

  /* ================= STELLAR ================= */

  {
    id: 'solaris', name: 'SOLARIS', title: 'Kroon van de Dag',
    rarity: RARITY.SSR, element: 'lumen', form: 'construct',
    colors: { primary: '#fbbf24', secondary: '#fffbeb' },
    // A crown: the widest chassis in the game, two rows of pods, oversized.
    // An SSR has to be recognisable from across the room.
    art: { c: 4, a: 1, bulk: 1.14 },
    stats: { power: 24, fireRate: 2.2, projectiles: 1, spread: 0, speed: 1.0, hp: 4, crit: 0.14, critDmg: 2.1, magnet: 1.3 },
    weapon: { type: 'beam', bullet: 'bullet/laser', width: 26, tickRate: 12, pierce: 99 },
    passive: { key: 'daybreak', name: 'Dageraad', desc: 'De straal wordt breder en sterker hoe langer je vuurt.' },
    ult: { key: 'zenith', name: 'Zenit', cost: 140, desc: 'Roept een zonnezuil op die 5s over het veld sleept.' },
    lore: 'Er is geen schaduw waar SOLARIS kijkt. Dat is niet altijd een zegen.',
  },
  {
    id: 'vantablack', name: 'VANTABLACK', title: 'De Stille Honger',
    rarity: RARITY.SSR, element: 'void', form: 'beast',
    colors: { primary: '#6d28d9', secondary: '#22d3ee' },
    stats: { power: 20, fireRate: 3.7, projectiles: 2, spread: 0.3, speed: 1.06, hp: 4, crit: 0.18, critDmg: 2.2, magnet: 1.8 },
    weapon: { type: 'singularity', bullet: 'bullet/orb', bulletSpeed: 520, pullRadius: 140, pullForce: 260 },
    passive: { key: 'eventhorizon', name: 'Waarnemingshorizon', desc: 'Prisms vliegen van het hele scherm naar je toe.' },
    ult: { key: 'collapse', name: 'Instorting', cost: 150, desc: 'Zwart gat dat 4s alles verzwelgt en dan detoneert.' },
    lore: 'Het at het licht op en vond het smaakloos. Het bleef eten.',
  },
  {
    id: 'aurelia', name: 'AURELIA', title: 'Bloeiende Ster',
    rarity: RARITY.SSR, element: 'tide', form: 'bloom',
    colors: { primary: '#22d3ee', secondary: '#fef3c7' },
    stats: { power: 15, fireRate: 5.0, projectiles: 6, spread: 6.28, speed: 1.04, hp: 5, crit: 0.12, critDmg: 1.9, magnet: 1.5 },
    weapon: { type: 'nova', bullet: 'bullet/orb', bulletSpeed: 640, pierce: 1, slow: 0.3 },
    passive: { key: 'bloomheal', name: 'Bloei', desc: 'Elke level-up herstelt 1 HP en geeft 4s onkwetsbaarheid.' },
    ult: { key: 'gardenof', name: 'Tuin van Licht', cost: 135, desc: 'Zes bloemen die om je heen schieten, 8s.' },
    lore: 'Groeit alleen op plekken waar iets groots gestorven is.',
  },

  /* ================= ULTRA ================= */

  {
    id: 'kairos', name: 'KAIROS', title: 'Het Juiste Moment',
    rarity: RARITY.UR, element: 'prism', form: 'prism',
    colors: { primary: '#ff5cf0', secondary: '#22d3ee' },
    stats: { power: 22, fireRate: 5.4, projectiles: 3, spread: 0.4, speed: 1.12, hp: 4, crit: 0.22, critDmg: 2.4, magnet: 1.6 },
    weapon: { type: 'prismshot', bullet: 'bullet/shard', bulletSpeed: 1050, pierce: 1, split: 2 },
    passive: { key: 'rewind', name: 'Terugspoelen', desc: 'Eén keer per run: sterf je, dan draait de tijd 3s terug.' },
    ult: { key: 'stasis', name: 'Stilstand', cost: 160, desc: 'Bevriest de tijd 4s. Alleen jij beweegt nog.' },
    lore: 'Vraag niet hoe laat het is. KAIROS beslist dat achteraf.',
  },
  {
    id: 'ouroboros', name: 'OUROBOROS', title: 'De Cirkel Zonder Einde',
    rarity: RARITY.UR, element: 'void', form: 'serpent',
    colors: { primary: '#a855f7', secondary: '#f0abfc' },
    stats: { power: 18, fireRate: 9.2, projectiles: 4, spread: 0.2, speed: 1.15, hp: 4, crit: 0.2, critDmg: 2.3, magnet: 1.7 },
    weapon: { type: 'boomerang', bullet: 'bullet/shard', bulletSpeed: 880, pierce: 99, returnTime: 0.6 },
    passive: { key: 'eternal', name: 'Eeuwig', desc: 'Kogels keren terug en raken opnieuw. Elke kill verlengt ze.' },
    ult: { key: 'serpentcoil', name: 'Slangenkring', cost: 155, desc: 'Een ring van slangen sluit zich om het scherm.' },
    lore: 'Begint waar hij eindigt. Niemand weet welke kant dat is.',
  },
];

/* ------------------------------------------------------------------ */

const BY_ID = new Map(ASTRA.map((a) => [a.id, a]));

export const getAstra = (id) => BY_ID.get(id) ?? null;
export const allAstra = () => ASTRA;
export const astraByRarity = (tier) => ASTRA.filter((a) => a.rarity === tier);
export const astraIds = () => ASTRA.map((a) => a.id);

/** The Astra every new player starts with. */
export const STARTER_ID = 'pip';

/**
 * Sprite key helpers — the single place that knows the naming convention.
 *
 * Keyed per character, not per form. Two Astra sharing a form still get their
 * own silhouette (art/astra.js hashes a variant from the id), and an artist
 * drawing a real sheet works per character anyway — nobody paints "the beast
 * form" and recolours it four times.
 */
export const astraSprite = (astra, state = 'idle') => `astra/${astra.id}/${state}`;
