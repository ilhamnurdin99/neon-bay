// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by the same route follower
// the traffic uses, so the frame is what a short game really looks like and the same seed
// always gives the same frame.

import { STEP } from './config.js';
import { createCar } from './cars.js';
import { addHeat } from './police.js';
import { SCREEN_MISSION, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 5;
const CHASE_SECONDS = 6;
const END_SECONDS = 4;

const IDLE = { move: { x: 0, y: 0 }, drive: { throttle: 0, steer: 0 }, enter: false, punch: false, shootAt: null, autopilot: null };

function stepFor(world, seconds, controls) {
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) world.step(STEP, controls);
}

/** Put the player behind the wheel of a fresh car at a road point. */
function putPlayerInCar(world, kind, x, y, angle) {
  const car = createCar(kind, x, y, angle, 'player');
  world.state.cars.push(car);
  const player = world.state.player;
  player.inCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  return car;
}

/**
 * Set `world` to the named scene and return the screen and UI to draw over it.
 * start: the title over a living city. play: driving to the Chop Shop on the first job.
 * chase: a three-star police chase with the HUD, the minimap and the objective showing.
 * end: the first job done, reward banked, over a city street.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'play') {
    putPlayerInCar(world, 'sport', 2400, 2000, -Math.PI / 2);
    world.startMission(0);
    const marker = state.mission.marker;
    stepFor(world, PLAY_SECONDS, { ...IDLE, autopilot: { x: marker.x, y: marker.y } });
    state.shake = 0;
    return { screen: SCREEN_PLAY, ui: { save: null, phone: null, missionResult: null, muted: false } };
  }
  if (name === 'chase') {
    const car = putPlayerInCar(world, 'sport', 2400, 2000, Math.PI);
    world.startMission(5);
    addHeat(state.wanted, 46);
    // Two patrol cars right on the player's tail, close enough to see in the frame.
    const behind = { x: car.x - Math.cos(car.angle) * 260, y: car.y - Math.sin(car.angle) * 260 };
    const cop1 = createCar('police', behind.x, behind.y, car.angle, 'police');
    cop1.siren = true;
    cop1.speed = 420;
    state.cars.push(cop1);
    const cop2 = createCar('police', behind.x - 90, behind.y + 60, car.angle, 'police');
    cop2.siren = true;
    cop2.speed = 400;
    state.cars.push(cop2);
    const marker = state.mission.marker;
    stepFor(world, CHASE_SECONDS, { ...IDLE, autopilot: { x: marker.x, y: marker.y } });
    state.shake = 0;
    return { screen: SCREEN_PLAY, ui: { save: null, phone: null, missionResult: null, muted: false } };
  }
  if (name === 'end') {
    putPlayerInCar(world, 'sedan', 1000, 500, Math.PI / 2);
    state.player.money += 300;
    state.mission.completedCount = 1;
    state.mission.index = 1;
    state.mission.objective = 'Job done. Press Enter for the next job from Maya.';
    stepFor(world, END_SECONDS, IDLE);
    state.shake = 0;
    return {
      screen: SCREEN_MISSION,
      ui: {
        save: null,
        phone: null,
        missionResult: { title: 'Hot Wheels', reward: 300, nextTitle: 'The Package' },
        muted: false,
      },
    };
  }
  // start (and any unknown name): the title over a living city.
  stepFor(world, START_SECONDS, IDLE);
  state.shake = 0;
  return { screen: SCREEN_TITLE, ui: { save: null, phone: null, missionResult: null, muted: false } };
}
