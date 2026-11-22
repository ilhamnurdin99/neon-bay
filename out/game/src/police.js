// The wanted level and the police who enforce it. Heat rises when the player commits a
// crime in sight of the law and falls when nobody has seen the player for a while. Police
// cars spawn at the edge of the player's view and chase by road when they can and straight
// across town when they must; foot cops get out and chase a player on foot, and a cop who
// reaches the player makes the arrest.

import { POLICE, WANTED, WANTED_BANDS } from './config.js';
import { createCar, driveCar, followRoute } from './cars.js';
import { findRoute, nearestRoadPoint } from './city.js';
import { range } from './random.js';

/** Stars from heat: under 10 is clean, then one star per band. */
export function starsForHeat(heat) {
  let stars = 0;
  for (const band of WANTED_BANDS) if (heat >= band) stars += 1;
  return stars;
}

/** Add heat for a crime; returns the new star count. */
export function addHeat(wanted, amount) {
  wanted.heat = Math.min(100, wanted.heat + amount);
  wanted.stars = starsForHeat(wanted.heat);
  wanted.unseen = 0;
  return wanted.stars;
}

export function createWanted() {
  return { heat: 0, stars: 0, unseen: 0, lastSeenX: 0, lastSeenY: 0 };
}

/** How many police cars the current wanted level calls for. */
export function policeWanted(stars) {
  return Math.min(POLICE.maxCars, stars);
}

/** Pick a spawn point on a road near the player but off the screen. */
function spawnPoint(city, random, player, distance) {
  for (let tries = 0; tries < 12; tries += 1) {
    const angle = random() * Math.PI * 2;
    const x = player.x + Math.cos(angle) * distance;
    const y = player.y + Math.sin(angle) * distance;
    if (x < 200 || x > 4600 || y < 200 || y > 3300) continue;
    const road = nearestRoadPoint(city, x, y);
    if (Math.hypot(road.x - x, road.y - y) < 260) return road;
  }
  return nearestRoadPoint(city, player.x + distance, player.y);
}

export function spawnPoliceCar(city, random, player) {
  const spot = spawnPoint(city, random, player, POLICE.spawnDistance);
  const car = createCar('police', spot.x, spot.y, random() * Math.PI * 2, 'police');
  car.siren = true;
  car.cruise = 560;
  return car;
}

/** True when any police car (or foot cop) can currently see the player. */
export function policeSeesPlayer(cars, cops, player) {
  for (const car of cars) {
    if (car.driver !== 'police') continue;
    if (Math.hypot(car.x - player.x, car.y - player.y) < POLICE.sightRange) return true;
  }
  for (const cop of cops) {
    if (Math.hypot(cop.x - player.x, cop.y - player.y) < 320) return true;
  }
  return false;
}

/**
 * One step of the wanted system: decay heat when unseen, keep the right number of police
 * cars on the road, and steer each one after the player.
 */
export function updateWanted(wanted, dt, cars, cops, city, random, player, onSpawn) {
  const seen = policeSeesPlayer(cars, cops, player);
  if (seen) {
    wanted.unseen = 0;
    wanted.lastSeenX = player.x;
    wanted.lastSeenY = player.y;
  } else {
    wanted.unseen += dt;
    if (wanted.unseen > WANTED.unseenSeconds && wanted.heat > 0) {
      wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt);
      wanted.stars = starsForHeat(wanted.heat);
    }
  }

  const wantedCars = policeWanted(wanted.stars);
  let policeCars = 0;
  for (const car of cars) if (car.driver === 'police') policeCars += 1;
  if (policeCars < wantedCars) {
    const car = spawnPoliceCar(city, random, player);
    cars.push(car);
    if (onSpawn) onSpawn(car);
  }
  return seen;
}

/** One step for a police car: chase the player, ramming when close. */
export function updatePoliceCar(car, dt, city, cars, player, time) {
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 130) {
    // Ram: drive straight at the player.
    const desired = Math.atan2(dy, dx);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2));
    driveCar(car, 1, steer, dt, city, null);
    return;
  }
  // Far away: follow the roads toward the player, re-routing every few seconds.
  if (!car.route || car.routeIndex >= car.route.length || car.retargetTimer === undefined || car.retargetTimer <= 0) {
    car.route = findRoute(city, car, player);
    car.routeIndex = 0;
    car.retargetTimer = 2.5;
  }
  car.retargetTimer -= dt;
  const control = followRoute(car, dt, city, cars, time, car.cruise || 560);
  driveCar(car, control.throttle, control.steer, dt, city, null);
}

/** A foot cop: spawned from a police car near a player on foot, chases and arrests. */
export function createFootCop(x, y) {
  return { x, y, angle: 0, speed: 205, state: 'chase', color: '#20242e', skin: '#f0c8a0', fear: 0, target: null, downTimer: 0 };
}

/** One step for a foot cop; returns true when the cop reaches the player (arrest). */
export function updateFootCop(cop, dt, city, player) {
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const dist = Math.hypot(dx, dy);
  if (dist < POLICE.bustRange) return true;
  const desired = Math.atan2(dy, dx);
  let diff = desired - cop.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  cop.angle += Math.max(-4 * dt, Math.min(4 * dt, diff));
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;
  return false;
}

/** Distance-based helper: how far the nearest police car is from the player. */
export function nearestPoliceDistance(cars, player) {
  let best = Infinity;
  for (const car of cars) {
    if (car.driver !== 'police') continue;
    best = Math.min(best, Math.hypot(car.x - player.x, car.y - player.y));
  }
  return best;
}

export { range };
