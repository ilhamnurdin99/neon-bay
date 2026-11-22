// Cars: arcade driving physics, traffic that follows the roads and stops at red lights, and
// the route follower the traffic, the police and the screenshot autopilot all share. A car is
// a position, a heading and a speed; steering only bites while it moves, and hard cornering at
// speed leaves skid marks.

import { CAR_KINDS, TRAFFIC } from './config.js';
import { findRoute, hitsBuilding, isOnRoad, lightState, nearestRoadPoint, resolveBuildings, ROAD_HALF } from './city.js';
import { pick, range } from './random.js';

const CAR_COLORS = ['#c94f5e', '#e8b93c', '#3fa7e8', '#8a94a6', '#5da864', '#b85da8', '#e87a3f', '#7a5de8', '#d8d8d8', '#3a3f4a'];

export function createCar(kind, x, y, angle, driver) {
  const spec = CAR_KINDS[kind];
  return {
    kind,
    driver, // 'player' | 'traffic' | 'parked' | 'police'
    x,
    y,
    angle,
    speed: 0,
    color: kind === 'taxi' ? '#e8b93c' : kind === 'police' ? '#20242e' : CAR_COLORS[Math.abs(Math.floor(x * 0.7 + y * 1.3)) % CAR_COLORS.length],
    spec,
    route: null,
    routeIndex: 0,
    wait: 0,
    stopped: false,
    siren: false,
    damage: 0,
  };
}

export function randomCarKind(random) {
  return pick(random, ['sedan', 'sedan', 'taxi', 'sport', 'van', 'pickup']);
}

/** Arcade car physics: throttle, steering, drag and a hard stop against buildings. */
export function driveCar(car, throttle, steer, dt, city, onCrash) {
  const spec = car.spec;
  const forward = throttle >= 0;
  const accel = throttle > 0 ? spec.accel : throttle < 0 ? spec.accel * 0.7 : 0;
  car.speed += accel * throttle * dt;
  // Drag and rolling resistance, stronger when reversing.
  car.speed -= car.speed * (forward ? 0.35 : 0.6) * dt;
  if (throttle === 0) car.speed -= car.speed * 1.4 * dt;
  const max = throttle < 0 ? -spec.reverse : spec.maxSpeed;
  if (car.speed > spec.maxSpeed) car.speed = spec.maxSpeed;
  if (car.speed < max) car.speed = max;
  if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;

  const speedRatio = Math.min(1, Math.abs(car.speed) / 260);
  const turnRate = spec.turn * (1 - speedRatio * 0.45) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * turnRate * speedRatio * dt;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  car.x = nx;
  car.y = ny;
  const radius = spec.length / 2 - 4;
  const hitWall = resolveBuildings(city, car, radius);
  // World edges and the water stop a car.
  let hitEdge = false;
  if (car.x < 30) { car.x = 30; hitEdge = true; }
  if (car.x > 4770) { car.x = 4770; hitEdge = true; }
  if (car.y < 30) { car.y = 30; hitEdge = true; }
  if (car.y > 3470) { car.y = 3470; hitEdge = true; }
  if ((hitWall || hitEdge) && Math.abs(car.speed) > 120) {
    if (onCrash) onCrash(Math.abs(car.speed) / spec.maxSpeed);
    car.speed *= -0.25;
    car.x = before.x;
    car.y = before.y;
  } else if (hitWall || hitEdge) {
    car.speed *= 0.5;
  }
  return hitWall || hitEdge;
}

/** The car ahead, if any, within `gap` units in front of this car. */
function carAhead(cars, car, gap) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nearest = null;
  let nearestDist = gap;
  for (const other of cars) {
    if (other === car || other.driver === 'parked') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along < 0 || along > gap) continue;
    const across = Math.abs(-dx * fy + dy * fx);
    if (across < 30 && along < nearestDist) {
      nearest = other;
      nearestDist = along;
    }
  }
  return nearest;
}

/** Is the traffic light red for a car crossing this intersection in this direction? */
function redLight(city, car, time) {
  const near = nearestRoadPoint(city, car.x, car.y);
  const dist = Math.hypot(car.x - near.x, car.y - near.y);
  if (dist > 110) return false;
  const state = lightState(city, car.x, car.y, time);
  const movingVertical = Math.abs(Math.sin(car.angle)) > Math.abs(Math.cos(car.angle));
  return (state === 'ns' && !movingVertical) || (state === 'ew' && movingVertical);
}

/**
 * Follow a route of waypoints: steer toward the next one, slow for the one after a turn, and
 * stop for red lights and for the car ahead. Returns { throttle, steer } for driveCar.
 */
export function followRoute(car, dt, city, cars, time, cruiseSpeed) {
  if (!car.route || car.routeIndex >= car.route.length) return { throttle: 0, steer: 0 };
  const target = car.route[car.routeIndex];
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) {
    car.routeIndex += 1;
    return followRoute(car, dt, city, cars, time, cruiseSpeed);
  }
  const desired = Math.atan2(dy, dx);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  let throttle = 1;
  if (Math.abs(diff) > 1.1) throttle = 0.3;
  if (redLight(city, car, time)) throttle = -0.4;
  const ahead = carAhead(cars, car, TRAFFIC.stopGap);
  if (ahead !== null) throttle = -0.5;
  if (car.speed > cruiseSpeed) throttle = 0;
  return { throttle, steer };
}

/** Give a traffic car a fresh destination somewhere across town. */
export function retargetTraffic(car, city, random) {
  const dest = {
    x: range(random, 500, 4300),
    y: range(random, 500, 3100),
  };
  car.route = findRoute(city, car, dest);
  car.routeIndex = 0;
}

/** One traffic step: follow the route, retargeting at the end of it. */
export function updateTraffic(car, dt, city, cars, random, time, onCrash) {
  if (!car.route || car.routeIndex >= car.route.length) retargetTraffic(car, city, random);
  const control = followRoute(car, dt, city, cars, time, car.cruise || TRAFFIC.maxSpeed);
  driveCar(car, control.throttle, control.steer, dt, city, onCrash);
}

/** Skid marks: the two rear wheels leave a fading pair of dark streaks when cornering hard. */
export function skidMarks(car, steer, skids) {
  if (Math.abs(car.speed) < 200 || Math.abs(steer) < 0.55) return;
  const back = -car.spec.length / 2 + 6;
  const side = car.spec.width / 2 - 3;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  for (const s of [-side, side]) {
    const wx = car.x + cos * back - sin * s;
    const wy = car.y + sin * back + cos * s;
    skids.push({ x: wx, y: wy, life: 5 });
    if (skids.length > 420) skids.shift();
  }
}

/** A parked car's spot is free once the car is taken: remember it so a new one can appear. */
export function freeParkedSpot(city, x, y) {
  return { x, y, angle: 0 };
}

export { hitsBuilding, isOnRoad, ROAD_HALF };
