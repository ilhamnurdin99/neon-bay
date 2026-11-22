// The story: six jobs from Maya, the fixer who runs Neon Bay's night shift. Each mission
// is a small state machine — an objective, a marker on the map, a timer when the job is
// timed, and a reward. The world asks the mission what the player has to do next; the
// mission answers by watching where the player is and what they did.

import { addHeat } from './police.js';

export const MISSION_COUNT = 6;

const MISSIONS = [
  {
    id: 0,
    title: 'Hot Wheels',
    giver: 'Maya',
    brief: 'First rule of Neon Bay: if you want a car, take one. Grab any car and bring it to the Chop Shop. Quick, before its owner calls it in.',
    objective: 'Steal any car and deliver it to the Chop Shop',
    reward: 300,
  },
  {
    id: 1,
    title: 'The Package',
    giver: 'Maya',
    brief: 'A package is waiting at the depot on 5th. Pick it up and drop it at the Docks. No peeking inside. Seriously. Don\u2019t.',
    objective: 'Pick up the package, then deliver it to the Docks',
    reward: 450,
  },
  {
    id: 2,
    title: 'Heat Check',
    giver: 'Maya',
    brief: 'The cops are sniffing around my corner. I need you to draw them off — get their attention, then lose it. Get back to zero stars and you\u2019re golden.',
    objective: 'Lose the wanted level — get back to zero stars',
    reward: 500,
  },
  {
    id: 3,
    title: 'Deadline Dash',
    giver: 'Maya',
    brief: 'A client at the Airport needs this car in two and a half minutes. Traffic, cops, physics — none of that is my problem. Drive.',
    objective: 'Deliver the car to the Airport before the timer runs out',
    reward: 800,
    timeLimit: 150,
  },
  {
    id: 4,
    title: 'Three Drops',
    giver: 'Maya',
    brief: 'Three customers, three corners of the bay. Downtown, the Plaza, then the Beach. Keep it smooth — the cops love a runner.',
    objective: 'Make all three drops: Downtown, Plaza, Beach',
    reward: 1000,
  },
  {
    id: 5,
    title: 'The Getaway',
    giver: 'Maya',
    brief: 'Last job, kid. The whole precinct is coming for us. Lose them or outrun them — just get to the Safehouse in one piece and we\u2019re done.',
    objective: 'Reach the Safehouse with the police on your tail',
    reward: 2000,
  },
];

export function missionDef(index) {
  return MISSIONS[index] || null;
}

export function createMissionState() {
  return {
    index: 0,
    active: false,
    step: 0,
    timer: 0,
    done: false,
    failed: false,
    failReason: '',
    marker: null,
    markerLabel: '',
    objective: 'Press Enter to start your first job for Maya.',
    completedCount: 0,
  };
}

/** Where a mission's marker should sit right now. */
function missionMarker(mission, city) {
  const places = city.places;
  switch (mission.index) {
    case 0:
      return { x: places.garage.x, y: places.garage.y, label: 'Chop Shop' };
    case 1:
      return mission.step === 0
        ? { x: places.packageDepot.x, y: places.packageDepot.y, label: 'Package Depot' }
        : { x: places.docks.x, y: places.docks.y, label: 'Docks' };
    case 2:
      return null; // no marker: the job is to lose the heat, anywhere
    case 3:
      return { x: places.airport.x, y: places.airport.y, label: 'Airport' };
    case 4: {
      const stops = [places.downtown, places.plaza, places.beach];
      const stop = stops[Math.min(mission.step, stops.length - 1)];
      return { x: stop.x, y: stop.y, label: stop.label };
    }
    case 5:
      return { x: places.safehouse.x, y: places.safehouse.y, label: 'Safehouse' };
    default:
      return null;
  }
}

/** Begin the next mission: set its objective, marker, timer and any scripted setup. */
export function startMission(mission, city, wanted, player) {
  const def = missionDef(mission.index);
  if (def === null) return false;
  mission.active = true;
  mission.step = 0;
  mission.done = false;
  mission.failed = false;
  mission.failReason = '';
  mission.timer = def.timeLimit || 0;
  mission.objective = def.objective;
  mission.marker = missionMarker(mission, city);
  mission.markerLabel = mission.marker ? mission.marker.label : '';
  if (mission.index === 2) addHeat(wanted, 26); // scripted: two stars on the player
  if (mission.index === 5) addHeat(wanted, 46); // scripted: three stars for the finale
  if (mission.index === 1) player.hasPackage = false;
  return true;
}

/** The mission is over (done or failed): bank the reward and count it. */
export function finishMission(mission, player, success, reason) {
  const def = missionDef(mission.index);
  mission.active = false;
  mission.marker = null;
  if (success) {
    mission.done = true;
    mission.completedCount += 1;
    player.money += def.reward;
    mission.index += 1;
    mission.objective = mission.index < MISSION_COUNT
      ? 'Job done. Press Enter for the next job from Maya.'
      : 'All jobs done. Neon Bay is yours.';
  } else {
    mission.failed = true;
    mission.failReason = reason || 'Job failed.';
    mission.objective = `${mission.failReason} Press Enter to try again.`;
  }
  return def.reward;
}

function near(player, marker, radius) {
  if (marker === null) return false;
  return Math.hypot(player.x - marker.x, player.y - marker.y) < radius;
}

/**
 * One step of the active mission. Returns 'done', 'failed' or null. The world passes in
 * what happened this step (a car was stolen, a pickup was taken) so missions can react.
 */
export function updateMission(mission, dt, city, player, wanted, events) {
  if (!mission.active) return null;
  const def = missionDef(mission.index);
  if (def.timeLimit) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      finishMission(mission, player, false, 'Out of time.');
      return 'failed';
    }
  }
  switch (mission.index) {
    case 0: {
      // Deliver a stolen car to the Chop Shop.
      if (player.inCar !== null && near(player, mission.marker, 70)) {
        finishMission(mission, player, true);
        return 'done';
      }
      break;
    }
    case 1: {
      if (mission.step === 0 && near(player, mission.marker, 60)) {
        mission.step = 1;
        player.hasPackage = true;
        mission.marker = missionMarker(mission, city);
        mission.markerLabel = mission.marker.label;
        mission.objective = 'Package collected. Deliver it to the Docks.';
      } else if (mission.step === 1 && near(player, mission.marker, 70)) {
        finishMission(mission, player, true);
        return 'done';
      }
      break;
    }
    case 2: {
      if (wanted.stars === 0) {
        finishMission(mission, player, true);
        return 'done';
      }
      break;
    }
    case 3: {
      if (player.inCar !== null && near(player, mission.marker, 70)) {
        finishMission(mission, player, true);
        return 'done';
      }
      break;
    }
    case 4: {
      if (near(player, mission.marker, 70)) {
        mission.step += 1;
        if (mission.step >= 3) {
          finishMission(mission, player, true);
          return 'done';
        }
        mission.marker = missionMarker(mission, city);
        mission.markerLabel = mission.marker.label;
        mission.objective = `Drop ${mission.step + 1} of 3: ${mission.marker.label}`;
      }
      break;
    }
    case 5: {
      if (near(player, mission.marker, 70)) {
        finishMission(mission, player, true);
        return 'done';
      }
      break;
    }
    default:
      break;
  }
  return null;
}

/** The phone-call text the player reads when a mission starts. */
export function missionBrief(index) {
  const def = missionDef(index);
  if (def === null) return null;
  return { title: def.title, giver: def.giver, brief: def.brief, reward: def.reward };
}
