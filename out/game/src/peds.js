// Pedestrians: they stroll the sidewalks, cross at the corners, and run when something
// scares them. A pedestrian hit by a fast car goes down (and the law notices); one brushed
// by a slow car just stumbles away. They are never armed and never attack the player.

import { PEDS } from './config.js';
import { nearestSidewalkPoint, resolveBuildings } from './city.js';
import { range } from './random.js';

export function createPed(city, random, x, y) {
  const spot = x === undefined ? nearestSidewalkPoint(city, range(random, 300, 4500), range(random, 300, 3200)) : { x, y };
  return {
    x: spot.x,
    y: spot.y,
    angle: random() * Math.PI * 2,
    speed: range(random, PEDS.walkMin, PEDS.walkMax),
    state: 'walk', // 'walk' | 'flee' | 'down'
    downTimer: 0,
    target: null,
    color: ['#e8b93c', '#c94f8a', '#4fa3e8', '#8ae8a0', '#e8e8e8', '#a07ae8', '#e87a3f'][Math.floor(random() * 7)],
    skin: ['#f0c8a0', '#c98a5e', '#8a5a3a', '#f0d8b8'][Math.floor(random() * 4)],
    fear: 0,
  };
}

/** Pick a new sidewalk waypoint for a strolling pedestrian. */
function retarget(ped, city, random) {
  ped.target = nearestSidewalkPoint(city, range(random, 300, 4500), range(random, 300, 3200));
}

function steerToward(ped, tx, ty, dt, speed) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) return true;
  const desired = Math.atan2(dy, dx);
  let diff = desired - ped.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  return false;
}

/**
 * One step for a pedestrian. `danger` is { x, y } when something nearby is frightening
 * (a speeding car, a gunshot); the pedestrian runs away from it. Returns 'down' when a car
 * running into this pedestrian at speed knocks them down.
 */
export function updatePed(ped, dt, city, random, danger) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.fear = 0;
      retarget(ped, city, random);
    }
    return;
  }
  if (danger !== null) {
    ped.fear = Math.min(4, ped.fear + dt * 2);
    ped.state = 'flee';
  } else if (ped.fear > 0) {
    ped.fear = Math.max(0, ped.fear - dt * 0.5);
    if (ped.fear === 0) ped.state = 'walk';
  }
  if (ped.state === 'flee' && danger !== null) {
    const away = Math.atan2(ped.y - danger.y, ped.x - danger.x);
    const tx = ped.x + Math.cos(away) * 200;
    const ty = ped.y + Math.sin(away) * 200;
    steerToward(ped, tx, ty, dt, PEDS.fleeSpeed);
  } else {
    if (ped.target === null) retarget(ped, city, random);
    if (steerToward(ped, ped.target.x, ped.target.y, dt, ped.speed)) retarget(ped, city, random);
  }
  resolveBuildings(city, ped, PEDS.radius);
  ped.x = Math.max(24, Math.min(4776, ped.x));
  ped.y = Math.max(24, Math.min(3456, ped.y));
}

/** Knock a pedestrian down; they stay down for a while, then get up and walk away. */
export function knockDown(ped, seconds) {
  ped.state = 'down';
  ped.downTimer = seconds;
  ped.fear = 4;
}
