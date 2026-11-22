// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, game over, job done and
// story complete. Progress (money, jobs done) is saved to localStorage between visits.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CLICK, ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_MISSION, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { MISSION_COUNT, missionBrief, missionDef } from './missions.js';
import { nearestPoliceDistance } from './police.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const IDLE_CONTROLS = { move: { x: 0, y: 0 }, drive: { throttle: 0, steer: 0 }, enter: false, punch: false, shootAt: null, autopilot: null };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number' || typeof save.missionsDone !== 'number') return null;
    return { money: Math.max(0, Math.floor(save.money)), missionsDone: Math.max(0, Math.min(MISSION_COUNT, Math.floor(save.missionsDone))), missionIndex: Math.max(0, Math.min(MISSION_COUNT, Math.floor(save.missionIndex || save.missionsDone))) };
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const state = world.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.player.money,
      missionsDone: state.mission.completedCount,
      missionIndex: state.mission.index,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const ui = { save: readSave(), phone: null, missionResult: null, muted: false };
  let screen = SCREEN_TITLE;
  let storyPending = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    const save = readSave();
    if (save !== null && save.missionsDone > 0) {
      world.state.player.money = save.money;
      world.state.mission.completedCount = save.missionsDone;
      world.state.mission.index = save.missionIndex;
      world.state.mission.objective = save.missionIndex < MISSION_COUNT
        ? 'Press Enter to start your next job for Maya.'
        : 'All jobs done. Neon Bay is yours — free roam.';
    }
    ui.phone = null;
    ui.missionResult = null;
    storyPending = false;
    screen = SCREEN_PLAY;
    announce('Playing Neon Bay. Press Enter to start your first job for Maya.');
  }

  function beginMission(index) {
    const def = missionDef(index);
    if (def === null) return;
    world.startMission(index);
    const brief = missionBrief(index);
    ui.phone = { ...brief, until: world.state.time + 9 };
    audio.click();
    announce(`New job from Maya: ${def.title}. ${def.objective}`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    writeSave();
    announce(world.state.gameOver === 'busted' ? 'Busted. The police caught you.' : 'Wasted. You did not survive Neon Bay.');
  }

  function playEvents(events) {
    for (const event of events) {
      if (event === 'shot') audio.gunshot();
      else if (event === 'punch') audio.punch();
      else if (event === 'crash') audio.crash(0.5);
      else if (event === 'pedHit') audio.crash(0.3);
      else if (event === 'pickup') audio.pickup();
      else if (event === 'cash') audio.cash();
      else if (event === 'steal') audio.click();
      else if (event === 'missionDone') audio.missionDone();
      else if (event === 'missionFailed') audio.missionFail();
      else if (event === 'busted') audio.busted();
    }
  }

  function handleActions(actions) {
    const clicked = input.takeClick();
    if (actions !== 0 || clicked) audio.unlock();
    if (actions & ACTION_MUTE) {
      ui.muted = audio.toggleMute();
      return;
    }
    const confirm = (actions & ACTION_CONFIRM) !== 0 || clicked;
    const keyConfirm = (actions & ACTION_CONFIRM) !== 0;
    if (screen === SCREEN_TITLE) {
      if (confirm) startGame();
      return;
    }
    if (screen === SCREEN_OVER) {
      if (confirm) startGame();
      return;
    }
    if (screen === SCREEN_MISSION) {
      if (confirm) {
        if (storyPending) {
          storyPending = false;
          screen = SCREEN_STORY;
          announce('Story complete. Neon Bay is yours.');
        } else if (world.state.mission.index < MISSION_COUNT) {
          beginMission(world.state.mission.index);
          screen = SCREEN_PLAY;
        } else {
          screen = SCREEN_PLAY;
        }
      }
      return;
    }
    if (screen === SCREEN_STORY) {
      if (confirm) screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if ((actions & (ACTION_PAUSE | ACTION_CONFIRM)) !== 0 || clicked) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // SCREEN_PLAY
    if ((actions & ACTION_PAUSE) !== 0) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (keyConfirm && !world.state.mission.active && world.state.mission.index < MISSION_COUNT) {
      beginMission(world.state.mission.index);
    }
  }

  function stepGame(actions) {
    const state = world.state;
    const mouse = input.mouse();
    const shootAt = mouse.down && state.player.inCar === null ? renderer.screenToWorld(state, mouse.x, mouse.y) : null;
    const controls = {
      move: input.move(),
      drive: input.drive(),
      enter: (actions & ACTION_ENTER) !== 0,
      punch: (actions & ACTION_PUNCH) !== 0,
      shootAt,
      autopilot: null,
    };
    if (actions & ACTION_MUTE) ui.muted = audio.toggleMute();
    const events = world.step(STEP, controls);
    playEvents(events);
    if (events.includes('missionDone')) {
      const doneIndex = state.mission.index - 1;
      const def = missionDef(doneIndex);
      const next = missionDef(state.mission.index);
      ui.missionResult = { title: def.title, reward: def.reward, nextTitle: next ? next.title : '' };
      writeSave();
      if (state.mission.index >= MISSION_COUNT) storyPending = true;
      screen = SCREEN_MISSION;
      announce(`Job done: ${def.title}. Reward $${def.reward}.`);
    } else if (events.includes('missionFailed')) {
      announce('Job failed. Press Enter to try again.');
    }
    if (state.gameOver === 'wasted' || state.gameOver === 'busted') {
      if (state.gameOver === 'wasted') audio.missionFail();
      endGame();
    } else if (state.gameOver === 'story') {
      state.gameOver = null;
      storyPending = true;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE) {
      world.step(STEP, IDLE_CONTROLS);
    } else if (screen === SCREEN_PLAY) {
      stepGame(actions);
    }
    // The engine hums with the player's car; the siren wails when the law is close.
    const player = world.state.player;
    audio.setEngine(player.inCar !== null ? player.inCar.speed : 0, player.inCar !== null ? player.inCar.spec.maxSpeed : 1);
    const policeNear = world.state.wanted.stars > 0 && nearestPoliceDistance(world.state.cars, player) < 520;
    audio.setSiren(policeNear, world.state.time);
    renderer.draw(world.state, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
