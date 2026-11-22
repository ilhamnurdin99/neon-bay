// The world: one state, one fixed step. It owns the player, the traffic, the pedestrians,
// the police, the pickups, the particles and the mission, and advances them all in lockstep.
// It knows nothing about screens or pixels; it returns what happened as an event list the
// caller turns into sound and menus.

import { CLOCK, PARKED, PEDS, PICKUPS, PLAYER, POLICE, STEP, TRAFFIC, WANTED, WORLD } from './config.js';
import { createCity, findRoute, hitsBuilding, nearestRoadPoint, nearestSidewalkPoint } from './city.js';
import { createRandom, int, pick, range } from './random.js';
import { createCar, followRoute, randomCarKind, updateTraffic } from './cars.js';
import { createPed, knockDown, updatePed } from './peds.js';
import { addHeat, createFootCop, createWanted, nearestPoliceDistance, updateFootCop, updatePoliceCar, updateWanted } from './police.js';
import { createPlayer, exitCar, hurtPlayer, nearestStealableCar, punch, shoot, stealCar, updateDriving, updateOnFoot } from './player.js';
import { createMissionState, startMission, updateMission } from './missions.js';

const SPAWN = { x: 2400, y: 2000 };

export function createWorld(random, seed) {
  const city = createCity(random);
  const state = {
    seed,
    city,
    time: 0,
    clockMin: CLOCK.startMinutes,
    dusk: 0,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    bullets: [],
    particles: [],
    skids: [],
    wanted: createWanted(),
    mission: createMissionState(),
    camera: { x: SPAWN.x, y: SPAWN.y },
    shake: 0,
    gameOver: null,
    events: [],
    lastShot: null,
    copSpawnTimer: 0,
    parkedTimer: 0,
    stats: { carsStolen: 0, pedsHit: 0, missionsDone: 0, shotsFired: 0 },
  };

  function spawnTraffic(count) {
    for (let i = 0; i < count; i += 1) {
      const spot = nearestRoadPoint(city, range(random, 400, 4400), range(random, 400, 3200));
      const car = createCar(randomCarKind(random), spot.x, spot.y, pick(random, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic');
      car.cruise = range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
      car.speed = car.cruise * 0.7;
      state.cars.push(car);
    }
  }

  function spawnParked(count) {
    const spots = city.parkedSpots.slice();
    for (let i = 0; i < count && spots.length > 0; i += 1) {
      const spot = spots.splice(Math.floor(random() * spots.length), 1)[0];
      const car = createCar(randomCarKind(random), spot.x, spot.y, spot.angle, 'parked');
      state.cars.push(car);
    }
  }

  function spawnPeds(count) {
    for (let i = 0; i < count; i += 1) state.peds.push(createPed(city, random));
  }

  function spawnPickup(kind) {
    const spot = nearestSidewalkPoint(city, range(random, 300, 4500), range(random, 300, 3200));
    state.pickups.push({ x: spot.x, y: spot.y, kind, respawn: 0 });
  }

  function spawnPickups() {
    for (let i = 0; i < PICKUPS.health; i += 1) spawnPickup('health');
    for (let i = 0; i < PICKUPS.ammo; i += 1) spawnPickup('ammo');
    for (let i = 0; i < PICKUPS.cash; i += 1) spawnPickup('cash');
  }

  function reset() {
    state.time = 0;
    state.clockMin = CLOCK.startMinutes;
    state.dusk = 0;
    state.player = createPlayer(SPAWN.x, SPAWN.y);
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.pickups = [];
    state.bullets = [];
    state.particles = [];
    state.skids = [];
    state.wanted = createWanted();
    state.mission = createMissionState();
    state.camera = { x: SPAWN.x, y: SPAWN.y };
    state.shake = 0;
    state.gameOver = null;
    state.events = [];
    state.lastShot = null;
    state.copSpawnTimer = 0;
    state.parkedTimer = 0;
    state.stats = { carsStolen: 0, pedsHit: 0, missionsDone: 0, shotsFired: 0 };
    spawnTraffic(TRAFFIC.count);
    spawnParked(PARKED.count);
    spawnPeds(PEDS.count);
    spawnPickups();
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const vel = range(random, speed * 0.3, speed);
      state.particles.push({ x, y, vx: Math.cos(angle) * vel, vy: Math.sin(angle) * vel, life: range(random, 0.3, 0.8), max: 0.8, color, size: range(random, 2, 5) });
    }
    if (state.particles.length > 300) state.particles.splice(0, state.particles.length - 300);
  }

  function carPedCollisions() {
    const player = state.player;
    for (const car of state.cars) {
      if (car.speed === 0) continue;
      const radius = car.spec.length / 2;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        const dx = ped.x - car.x;
        const dy = ped.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius + PEDS.radius) continue;
        if (Math.abs(car.speed) > 160) {
          knockDown(ped, 9);
          state.stats.pedsHit += 1;
          state.events.push('pedHit');
          burst(ped.x, ped.y, '#f2c94c', 8, 160);
          if (car.driver === 'player') addHeat(state.wanted, 13);
        } else {
          // A slow nudge: the pedestrian stumbles aside and runs.
          const push = 60;
          ped.x += (dx / Math.max(1, dist)) * push;
          ped.y += (dy / Math.max(1, dist)) * push;
          ped.fear = 3;
          ped.state = 'flee';
        }
      }
      // A car can run the player down too.
      if (player.inCar === null && car.driver !== 'player') {
        const dx = player.x - car.x;
        const dy = player.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist < radius + PLAYER.radius && Math.abs(car.speed) > 120) {
          if (hurtPlayer(player, 15)) state.gameOver = 'wasted';
          player.x += (dx / Math.max(1, dist)) * 50;
          player.y += (dy / Math.max(1, dist)) * 50;
          state.shake = Math.min(1, state.shake + 0.5);
          state.events.push('crash');
        }
      }
    }
  }

  function carCarCollisions() {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = (a.spec.length + b.spec.length) / 2 - 14;
        if (dist >= min || dist === 0) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (min - dist) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const impact = Math.abs(a.speed - b.speed);
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.6;
        b.speed = avg * 0.6;
        if (impact > 220) {
          state.events.push('crash');
          state.shake = Math.min(1, state.shake + impact / 900);
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#f2a94c', 10, 200);
          // A police ram hurts the player.
          if ((a.driver === 'player' && b.driver === 'police') || (b.driver === 'player' && a.driver === 'police')) {
            if (hurtPlayer(state.player, 9)) state.gameOver = 'wasted';
          }
        }
      }
    }
  }

  function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      let dead = bullet.life <= 0;
      if (!dead && hitsBuilding(state.city, bullet.x, bullet.y, 2)) {
        burst(bullet.x, bullet.y, '#d8d8d8', 4, 120);
        dead = true;
      }
      if (!dead) {
        for (const ped of state.peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 15) {
            knockDown(ped, 10);
            addHeat(state.wanted, 13);
            burst(ped.x, ped.y, '#f2c94c', 8, 160);
            state.events.push('pedHit');
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const cop of state.cops) {
          if (cop.state === 'down') continue;
          if (Math.hypot(cop.x - bullet.x, cop.y - bullet.y) < 15) {
            cop.health -= bullet.damage;
            burst(cop.x, cop.y, '#4fa3ff', 6, 140);
            if (cop.health <= 0) {
              cop.state = 'down';
              cop.downTimer = 7;
              addHeat(state.wanted, 20);
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const player = state.player;
    for (const pickup of state.pickups) {
      if (pickup.respawn > 0) {
        pickup.respawn -= dt;
        if (pickup.respawn <= 0) {
          const spot = nearestSidewalkPoint(state.city, range(random, 300, 4500), range(random, 300, 3200));
          pickup.x = spot.x;
          pickup.y = spot.y;
        }
        continue;
      }
      if (Math.hypot(player.x - pickup.x, player.y - pickup.y) > 34) continue;
      if (pickup.kind === 'health') {
        player.health = Math.min(PLAYER.health, player.health + 40);
        state.events.push('pickup');
      } else if (pickup.kind === 'ammo') {
        player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + 24);
        state.events.push('pickup');
      } else {
        player.money += 50;
        state.events.push('cash');
      }
      burst(pickup.x, pickup.y, '#58d68d', 10, 140);
      pickup.respawn = 20;
    }
  }

  function updateCops(dt) {
    const player = state.player;
    // A police car that pulls up to a player on foot sends a cop out after them.
    state.copSpawnTimer -= dt;
    if (state.wanted.stars > 0 && player.inCar === null && state.copSpawnTimer <= 0) {
      let nearCar = null;
      for (const car of state.cars) {
        if (car.driver !== 'police') continue;
        if (Math.hypot(car.x - player.x, car.y - player.y) < 170) nearCar = car;
      }
      if (nearCar !== null && state.cops.length < 2) {
        state.cops.push(createFootCop(nearCar.x, nearCar.y));
        state.copSpawnTimer = 6;
      }
    }
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      if (cop.state === 'down') {
        cop.downTimer -= dt;
        if (cop.downTimer <= 0) {
          cop.state = 'chase';
          cop.health = 50;
        }
        continue;
      }
      if (player.inCar !== null) {
        // The player drove off: the cop gives up and fades out.
        state.cops.splice(i, 1);
        continue;
      }
      if (updateFootCop(cop, dt, state.city, player)) {
        state.gameOver = 'busted';
        state.events.push('busted');
      }
    }
  }

  function recycleFarEntities() {
    const player = state.player;
    for (const car of state.cars) {
      if (car.driver !== 'traffic') continue;
      if (Math.hypot(car.x - player.x, car.y - player.y) > 2100) {
        const spot = nearestRoadPoint(state.city, player.x + range(random, -900, 900), player.y + range(random, -900, 900));
        car.x = spot.x;
        car.y = spot.y;
        car.speed = car.cruise * 0.7;
        car.route = null;
      }
    }
    for (const ped of state.peds) {
      if (Math.hypot(ped.x - player.x, ped.y - player.y) > 1700) {
        const spot = nearestSidewalkPoint(state.city, player.x + range(random, -800, 800), player.y + range(random, -800, 800));
        ped.x = spot.x;
        ped.y = spot.y;
        ped.state = 'walk';
      }
    }
  }

  /**
   * One fixed step. `controls` is { move, drive, enter, punch, shootAt, autopilot }.
   * Returns the events of this step (sound and menu cues); the caller drains them.
   */
  function step(dt, controls) {
    state.events = [];
    state.time += dt;
    state.clockMin += dt; // one game minute per real second
    state.dusk = Math.max(0, Math.min(1, (state.clockMin - CLOCK.duskStart) / (CLOCK.nightStart - CLOCK.duskStart)));
    const player = state.player;

    // --- the player ---
    if (controls.enter) {
      if (player.inCar !== null) {
        exitCar(player);
        state.events.push('click');
      } else {
        const car = nearestStealableCar(state.cars, player, 78);
        if (car !== null) {
          stealCar(player, car, state.wanted);
          state.stats.carsStolen += 1;
          state.events.push('steal');
        }
      }
    }
    if (player.inCar !== null) {
      if (controls.autopilot) {
        // Screenshot autopilot: follow the roads toward the target, like traffic does.
        const car = player.inCar;
        if (!car.route || car.routeIndex >= car.route.length) {
          car.route = findRoute(state.city, car, controls.autopilot);
          car.routeIndex = 0;
        }
        const control = followRoute(car, dt, state.city, state.cars, state.time, car.spec.maxSpeed * 0.8);
        updateDriving(player, control, dt, state.city, state.skids, (s) => state.events.push('crash'));
      } else {
        updateDriving(player, controls.drive, dt, state.city, state.skids, (s) => state.events.push('crash'));
      }
    } else {
      updateOnFoot(player, controls.move, dt, state.city);
      if (controls.punch) {
        const victims = punch(player, state.peds, state.cops);
        if (victims.length > 0) {
          state.events.push('punch');
          for (const victim of victims) {
            if (victim.health !== undefined) {
              victim.health -= 30;
              if (victim.health <= 0) {
                victim.state = 'down';
                victim.downTimer = 7;
                addHeat(state.wanted, 20);
              }
            } else {
              knockDown(victim, 8);
              addHeat(state.wanted, 13);
            }
            burst(victim.x, victim.y, '#f2c94c', 6, 140);
          }
        }
      }
      if (controls.shootAt !== null) {
        const bullet = shoot(player, controls.shootAt.x, controls.shootAt.y);
        if (bullet !== null) {
          state.bullets.push(bullet);
          state.stats.shotsFired += 1;
          state.events.push('shot');
          state.lastShot = { x: player.x, y: player.y, time: state.time };
          burst(bullet.x, bullet.y, '#ffe08a', 4, 120);
        }
      }
    }

    // --- traffic and parked cars ---
    for (const car of state.cars) {
      if (car.driver === 'traffic') {
        updateTraffic(car, dt, state.city, state.cars, random, state.time, (s) => {
          if (Math.hypot(car.x - player.x, car.y - player.y) < 700) state.events.push('crash');
        });
      } else if (car.driver === 'police') {
        updatePoliceCar(car, dt, state.city, state.cars, player, state.time);
      }
    }
    state.parkedTimer -= dt;
    if (state.parkedTimer <= 0) {
      state.parkedTimer = 22;
      let parked = 0;
      for (const car of state.cars) if (car.driver === 'parked') parked += 1;
      if (parked < 12 && state.city.parkedSpots.length > 0) {
        const spot = state.city.parkedSpots[int(random, 0, state.city.parkedSpots.length - 1)];
        if (Math.hypot(spot.x - player.x, spot.y - player.y) > 300) {
          state.cars.push(createCar(randomCarKind(random), spot.x, spot.y, spot.angle, 'parked'));
        }
      }
    }

    // --- pedestrians ---
    const danger = state.lastShot !== null && state.time - state.lastShot.time < 1.2 ? state.lastShot : null;
    for (const ped of state.peds) {
      let pedDanger = danger;
      if (pedDanger === null) {
        for (const car of state.cars) {
          if (car.speed === 0) continue;
          if (Math.hypot(car.x - ped.x, car.y - ped.y) < 90 && Math.abs(car.speed) > 200) {
            pedDanger = { x: car.x, y: car.y };
            break;
          }
        }
      }
      updatePed(ped, dt, state.city, random, pedDanger);
    }

    carPedCollisions();
    carCarCollisions();
    updateBullets(dt);
    updatePickups(dt);

    // --- wanted and police ---
    const seen = updateWanted(state.wanted, dt, state.cars, state.cops, state.city, random, player, () => state.events.push('siren'));
    if (player.inCar !== null && Math.abs(player.inCar.speed) > 430) {
      if (nearestPoliceDistance(state.cars, player) < 420) addHeat(state.wanted, WANTED.speedTrap * dt);
    }
    updateCops(dt);
    recycleFarEntities();

    // --- mission ---
    if (state.mission.active) {
      const result = updateMission(state.mission, dt, state.city, player, state.wanted, state.events);
      if (result === 'done') {
        state.stats.missionsDone += 1;
        state.events.push('missionDone');
        if (state.mission.index >= 6) state.gameOver = 'story';
      } else if (result === 'failed') {
        state.events.push('missionFailed');
      }
    }

    // --- particles, skids, camera ---
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    const lookX = player.x + Math.cos(player.angle) * 26;
    const lookY = player.y + Math.sin(player.angle) * 26;
    state.camera.x += (lookX - state.camera.x) * Math.min(1, dt * 4);
    state.camera.y += (lookY - state.camera.y) * Math.min(1, dt * 4);
    state.camera.x = Math.max(640, Math.min(WORLD.width - 640, state.camera.x));
    state.camera.y = Math.max(360, Math.min(WORLD.height - 360, state.camera.y));
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);

    return state.events;
  }

  reset();
  return {
    state,
    city,
    reset,
    step,
    startMission: (index) => {
      state.mission.index = index;
      return startMission(state.mission, state.city, state.wanted, state.player);
    },
  };
}
