// Every tuning number and colour in one place. The world is a fixed 4800x3600 city; the
// camera shows a 1280x720 slice of it, so no rule below depends on the screen size.

export const WORLD = { width: 4800, height: 3600 };

/** Roads run on a 400-unit grid; the beach sits along the south edge of the city. */
export const ROAD_SPACING = 400;
export const ROAD_WIDTH = 120;
/** The distance from a road's centre line to its edge. */
export const ROAD_HALF = ROAD_WIDTH / 2;
export const ROAD_X = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400];
export const ROAD_Y = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200];
export const SAND_Y = 3320;
export const WATER_Y = 3480;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  walkSpeed: 255,
  runSpeed: 330,
  health: 100,
  punchDamage: 30,
  punchRange: 52,
  punchCooldown: 0.45,
  gunDamage: 34,
  gunCooldown: 0.28,
  gunRange: 520,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR_KINDS = {
  sedan: { length: 46, width: 22, accel: 430, maxSpeed: 500, reverse: 190, turn: 2.5, color: '#c94f5e' },
  taxi: { length: 46, width: 22, accel: 430, maxSpeed: 490, reverse: 190, turn: 2.5, color: '#e8b93c' },
  sport: { length: 48, width: 22, accel: 560, maxSpeed: 640, reverse: 210, turn: 2.9, color: '#3fa7e8' },
  van: { length: 56, width: 24, accel: 340, maxSpeed: 420, reverse: 160, turn: 2.1, color: '#8a94a6' },
  pickup: { length: 50, width: 23, accel: 460, maxSpeed: 520, reverse: 190, turn: 2.4, color: '#5da864' },
  police: { length: 48, width: 23, accel: 540, maxSpeed: 620, reverse: 200, turn: 2.8, color: '#20242e' },
};

export const TRAFFIC = { count: 16, minSpeed: 150, maxSpeed: 230, stopGap: 74 };
export const PARKED = { count: 14 };
export const PEDS = { count: 42, walkMin: 48, walkMax: 92, fleeSpeed: 175, radius: 11 };
export const POLICE = { maxCars: 5, spawnDistance: 780, ramDamage: 9, bustRange: 30, sightRange: 620 };
export const PICKUPS = { health: 6, ammo: 5, cash: 6 };

/** Heat bands for the wanted stars: heat under 10 is clean, then 1 to 5 stars. */
export const WANTED_BANDS = [10, 25, 45, 65, 85];
export const WANTED = {
  stealCar: 16,
  hitPed: 13,
  shootNearPolice: 9,
  decayPerSecond: 5,
  unseenSeconds: 6,
  speedTrap: 2.5,
};

export const CAMERA = { zoom: 1, lookAhead: 26 };

/** The in-game clock starts at 16:30; one game minute passes every real second. */
export const CLOCK = { startMinutes: 16 * 60 + 30, duskStart: 17 * 60, nightStart: 19 * 60 + 30 };

export const PALETTE = {
  backdrop: '#14101f',
  grass: '#4d8a58',
  grassDark: '#437a4e',
  park: '#57a05f',
  road: '#33363e',
  roadLine: '#d8c95a',
  sidewalk: '#a7adb8',
  crosswalk: '#dfe3e8',
  sand: '#e6cf96',
  water: '#2e7cb5',
  waterDeep: '#256a9e',
  buildingRoof: '#6b5b7a',
  panel: '#171a26',
  panelEdge: '#3a415c',
  text: '#f2f4f8',
  muted: '#a9b0c2',
  gold: '#f2c94c',
  green: '#58d68d',
  red: '#ef5350',
  blue: '#4fa3ff',
  minimap: '#10131c',
  minimapRoad: '#565d6d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, missions finished) is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';
