// The player: on foot they walk, punch and shoot; in a car they drive it, and the car is
// them. Stepping up to a car and pressing E takes it — a parked one quietly, a traffic one
// in front of its driver, which the law notices. Getting out leaves the car where it stops.

import { PLAYER } from './config.js';
import { driveCar, skidMarks } from './cars.js';
import { resolveBuildings } from './city.js';
import { addHeat } from './police.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    speed: 0,
    health: PLAYER.health,
    money: 100,
    ammo: PLAYER.startAmmo,
    hasGun: true,
    inCar: null,
    punchTimer: 0,
    punchCooldown: 0,
    gunCooldown: 0,
    hurtTimer: 0,
    moving: false,
  };
}

/** The nearest car the player could take, within reach on foot. */
export function nearestStealableCar(cars, player, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of cars) {
    if (car.driver === 'police') continue;
    const dist = Math.hypot(car.x - player.x, car.y - player.y);
    if (dist < bestDist) {
      best = car;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Take a car: the player gets in, the car becomes theirs, and taking a traffic car (or any
 * car that is not already theirs) is grand theft auto. Returns the car taken, or null.
 */
export function stealCar(player, car, wanted) {
  if (car === null) return null;
  const wasParked = car.driver === 'parked';
  car.driver = 'player';
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  if (!wasParked) addHeat(wanted, 16);
  else addHeat(wanted, 16);
  return car;
}

/** Step out of the car: it stays where it stopped, parked. */
export function exitCar(player) {
  if (player.inCar === null) return null;
  const car = player.inCar;
  car.driver = 'parked';
  car.speed = 0;
  player.inCar = null;
  // Step out to the car's left side so the player never lands inside it.
  player.x = car.x - Math.sin(car.angle) * 34;
  player.y = car.y + Math.cos(car.angle) * 34;
  player.angle = car.angle;
  return car;
}

/** One step on foot: move, collide with buildings, cool down the fists and the gun. */
export function updateOnFoot(player, move, dt, city) {
  const len = Math.hypot(move.x, move.y);
  player.moving = len > 0;
  if (len > 0) {
    const nx = move.x / len;
    const ny = move.y / len;
    player.angle = Math.atan2(ny, nx);
    player.x += nx * PLAYER.walkSpeed * dt;
    player.y += ny * PLAYER.walkSpeed * dt;
  }
  resolveBuildings(city, player, PLAYER.radius);
  player.x = Math.max(24, Math.min(4776, player.x));
  player.y = Math.max(24, Math.min(3456, player.y));
  if (player.punchCooldown > 0) player.punchCooldown -= dt;
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (player.gunCooldown > 0) player.gunCooldown -= dt;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
}

/** One step driving: the player's car answers the wheel, and hard corners leave marks. */
export function updateDriving(player, drive, dt, city, skids, onCrash) {
  const car = player.inCar;
  driveCar(car, drive.throttle, drive.steer, dt, city, onCrash);
  skidMarks(car, drive.steer, skids);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = car.speed;
  if (player.hurtTimer > 0) player.hurtTimer -= dt;
}

/**
 * Throw a punch: anything living within range in front of the player takes damage.
 * Returns the list of victims hit.
 */
export function punch(player, peds, cops) {
  if (player.punchCooldown > 0 || player.inCar !== null) return [];
  player.punchCooldown = PLAYER.punchCooldown;
  player.punchTimer = 0.22;
  const fx = Math.cos(player.angle);
  const fy = Math.sin(player.angle);
  const victims = [];
  const check = (target) => {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > PLAYER.punchRange) return;
    const dot = (dx * fx + dy * fy) / Math.max(1, dist);
    if (dot > 0.2) victims.push(target);
  };
  for (const ped of peds) if (ped.state !== 'down') check(ped);
  for (const cop of cops) check(cop);
  return victims;
}

/** Fire the pistol toward a world point. Returns the bullet, or null when it cannot fire. */
export function shoot(player, targetX, targetY) {
  if (player.gunCooldown > 0 || player.ammo <= 0) return null;
  player.gunCooldown = PLAYER.gunCooldown;
  player.ammo -= 1;
  const angle = Math.atan2(targetY - player.y, targetX - player.x);
  player.angle = angle;
  return {
    x: player.x + Math.cos(angle) * 22,
    y: player.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * 900,
    vy: Math.sin(angle) * 900,
    life: PLAYER.gunRange / 900,
    damage: PLAYER.gunDamage,
  };
}

/** Hurt the player; returns true when this damage finishes them. */
export function hurtPlayer(player, amount) {
  if (player.hurtTimer > 0) return false;
  player.health -= amount;
  player.hurtTimer = 0.5;
  return player.health <= 0;
}
