// The city of Neon Bay: a road grid, blocks of buildings, parks, parking lots and a beach
// along the south edge. Everything is laid out once from a seed, and the rest of the game
// only asks this module questions: is this point on a road, what blocks it, where is the
// nearest road, and where are the named places the missions use.
import { PARKED, ROAD_SPACING, ROAD_WIDTH, ROAD_X, ROAD_Y, SAND_Y, WATER_Y, WORLD } from './config.js';
import { int, pick, range } from './random.js';

const ROOF_COLORS = ['#7a6a8a', '#5d7a8a', '#8a6a5d', '#6a8a6a', '#8a5d6e', '#5d6a8a', '#977a4e', '#4e7a77'];
const WALL_COLORS = ['#b98a6a', '#8aa8b8', '#c2a878', '#9a8ab8', '#7ab898', '#b87a8a', '#a8b87a', '#7a9ab8'];
const TREE_COLORS = ['#3e7a44', '#4d8a3e', '#2f6a4a'];

/** The distance from a road's centre line to its edge. */
export const ROAD_HALF = ROAD_WIDTH / 2;

function nearestRoad(list, value) {
  let best = list[0];
  for (const road of list) if (Math.abs(road - value) < Math.abs(best - value)) best = road;
  return best;
}

function nearestIntersection(x, y) {
  return { x: nearestRoad(ROAD_X, x), y: nearestRoad(ROAD_Y, y) };
}

/** True when the point is on a road (or the beach road that runs along the sand). */
export function isOnRoad(city, x, y) {
  for (const road of ROAD_X) if (Math.abs(x - road) <= ROAD_HALF && y <= SAND_Y) return true;
  for (const road of ROAD_Y) if (Math.abs(y - road) <= ROAD_HALF) return true;
  return false;
}

/** The nearest point on a road centre line to (x, y). */
export function nearestRoadPoint(city, x, y) {
  const rx = nearestRoad(ROAD_X, x);
  const ry = nearestRoad(ROAD_Y, y);
  if (Math.abs(x - rx) < Math.abs(y - ry)) return { x: rx, y: Math.min(y, SAND_Y - ROAD_HALF) };
  return { x: Math.max(0, Math.min(WORLD.width, x)), y: ry };
}

/** The nearest point on a sidewalk (just off a road edge) to (x, y). */
export function nearestSidewalkPoint(city, x, y) {
  const rx = nearestRoad(ROAD_X, x);
  const ry = nearestRoad(ROAD_Y, y);
  if (Math.abs(x - rx) < Math.abs(y - ry)) {
    const side = x < rx ? -1 : 1;
    return { x: rx + side * (ROAD_HALF + 14), y: Math.min(y, SAND_Y - ROAD_HALF - 14) };
  }
  const side = y < ry ? -1 : 1;
  return { x: Math.max(0, Math.min(WORLD.width, x)), y: ry + side * (ROAD_HALF + 14) };
}

/**
 * Push a circle out of every building it overlaps. Returns true when anything was hit, so
 * callers can play a bump sound or count a crash.
 */
export function resolveBuildings(city, body, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq === 0) {
      body.x += radius;
      continue;
    }
    const dist = Math.sqrt(distSq);
    body.x = cx + (dx / dist) * radius;
    body.y = cy + (dy / dist) * radius;
  }
  return hit;
}

/** True when the circle overlaps any building. */
export function hitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/**
 * A route along the roads from `from` to `to`, as a list of waypoints in world coordinates
 * (lane-offset so traffic keeps right). Breadth-first over the intersection grid.
 */
export function findRoute(city, from, to) {
  const start = nearestIntersection(from.x, from.y);
  const goal = nearestIntersection(to.x, to.y);
  const key = (x, y) => `${x},${y}`;
  const prev = new Map();
  const queue = [start];
  prev.set(key(start.x, start.y), null);
  while (queue.length > 0) {
    const node = queue.shift();
    if (node.x === goal.x && node.y === goal.y) break;
    const neighbours = [];
    const xi = ROAD_X.indexOf(node.x);
    const yi = ROAD_Y.indexOf(node.y);
    if (xi > 0) neighbours.push({ x: ROAD_X[xi - 1], y: node.y });
    if (xi < ROAD_X.length - 1) neighbours.push({ x: ROAD_X[xi + 1], y: node.y });
    if (yi > 0) neighbours.push({ x: node.x, y: ROAD_Y[yi - 1] });
    if (yi < ROAD_Y.length - 1) neighbours.push({ x: node.x, y: ROAD_Y[yi + 1] });
    for (const next of neighbours) {
      if (!prev.has(key(next.x, next.y))) {
        prev.set(key(next.x, next.y), node);
        queue.push(next);
      }
    }
  }
  const path = [];
  let node = goal;
  let guard = 0;
  while (node !== null && guard < 64) {
    path.unshift({ x: node.x, y: node.y });
    node = prev.get(key(node.x, node.y));
    guard += 1;
  }
  if (path.length === 0) path.push({ x: from.x, y: from.y });
  // Lane offset: keep right by shifting each leg sideways by 30 units.
  const offset = [];
  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];
    const next = path[Math.min(i + 1, path.length - 1)];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const len = Math.hypot(dx, dy) || 1;
    offset.push({ x: point.x + (-dy / len) * 30, y: point.y + (dx / len) * 30 });
  }
  offset.push({ x: to.x, y: to.y });
  return offset;
}

/** Traffic lights: one cycle per intersection, offset by its grid position. */
export function lightState(city, x, y, time) {
  const xi = ROAD_X.indexOf(nearestRoad(ROAD_X, x));
  const yi = ROAD_Y.indexOf(nearestRoad(ROAD_Y, y));
  const phase = (time + (xi + yi) * 2) % 8;
  return phase < 4 ? 'ns' : 'ew';
}

export function createCity(random) {
  const buildings = [];
  const parks = [];
  const parkings = [];
  const blocks = [];
  // Blocks sit between the roads; the last row before the beach is left as open ground.
  for (let col = 0; col < ROAD_X.length - 1; col += 1) {
    for (let row = 0; row < ROAD_Y.length - 1; row += 1) {
      const x0 = ROAD_X[col] + ROAD_HALF;
      const y0 = ROAD_Y[row] + ROAD_HALF;
      const w = ROAD_SPACING - ROAD_WIDTH;
      const h = ROAD_SPACING - ROAD_WIDTH;
      const roll = random();
      const block = { x: x0, y: y0, w, h, col, row, kind: 'buildings' };
      if (roll < 0.12) {
        block.kind = 'park';
        const trees = [];
        const treeCount = int(random, 5, 9);
        for (let i = 0; i < treeCount; i += 1) {
          trees.push({ x: x0 + range(random, 24, w - 24), y: y0 + range(random, 24, h - 24), r: range(random, 12, 20), color: pick(random, TREE_COLORS) });
        }
        parks.push({ ...block, trees });
      } else if (roll < 0.2) {
        block.kind = 'parking';
        const spots = [];
        for (let i = 0; i < 6; i += 1) {
          spots.push({ x: x0 + 40 + (i % 3) * 80, y: y0 + 50 + Math.floor(i / 3) * 120, angle: 0 });
        }
        parkings.push({ ...block, spots });
      } else {
        const count = int(random, 1, 3);
        if (count === 1) {
          const bw = range(random, 150, 230);
          const bh = range(random, 150, 230);
          buildings.push({ x: x0 + (w - bw) / 2, y: y0 + (h - bh) / 2, w: bw, h: bh, roof: pick(random, ROOF_COLORS), wall: pick(random, WALL_COLORS), tall: random() < 0.3 });
        } else {
          for (let i = 0; i < count; i += 1) {
            const bw = range(random, 90, 130);
            const bh = range(random, 90, 130);
            const bx = x0 + 12 + (i % 2) * (w / 2);
            const by = y0 + 12 + Math.floor(i / 2) * (h / 2);
            buildings.push({ x: bx, y: by, w: Math.min(bw, w - 24), h: Math.min(bh, h - 24), roof: pick(random, ROOF_COLORS), wall: pick(random, WALL_COLORS), tall: random() < 0.25 });
          }
        }
      }
      blocks.push(block);
    }
  }

  // Named places the missions use: picked from blocks by grid position, markers on the road.
  function placeAt(col, row, label) {
    const x = ROAD_X[col];
    const y = ROAD_Y[row];
    return { x, y, label };
  }
  const places = {
    garage: placeAt(2, 1, 'Chop Shop'),
    docks: placeAt(10, 6, 'Docks'),
    airport: placeAt(0, 0, 'Airport'),
    safehouse: placeAt(8, 2, 'Safehouse'),
    packageDepot: placeAt(5, 4, 'Package Depot'),
    downtown: placeAt(5, 2, 'Downtown'),
    beach: { x: 2400, y: SAND_Y - 40, label: 'Neon Beach' },
    plaza: placeAt(3, 5, 'Plaza'),
  };

  // Parked cars sit in parking-lot spots and along a few road edges.
  const parkedSpots = [];
  for (const lot of parkings) {
    for (const spot of lot.spots) parkedSpots.push({ x: spot.x, y: spot.y, angle: spot.angle });
  }
  for (let i = 0; i < PARKED.count; i += 1) {
    const vertical = random() < 0.5;
    if (vertical) {
      const road = pick(random, ROAD_X);
      parkedSpots.push({ x: road + ROAD_HALF - 26, y: range(random, 500, SAND_Y - 200), angle: Math.PI / 2 });
    } else {
      const road = pick(random, ROAD_Y);
      parkedSpots.push({ x: range(random, 500, WORLD.width - 500), y: road + ROAD_HALF - 26, angle: 0 });
    }
  }

  return { buildings, parks, parkings, blocks, places, parkedSpots, sandY: SAND_Y, waterY: WATER_Y };
}
