// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player through the city; the HUD (minimap, wanted stars, money, health, objective) is
// drawn in screen space on top. Everything is canvas shapes and text — no images, no fonts
// from the network.

import { FONT, PALETTE, ROAD_HALF, ROAD_WIDTH, ROAD_X, ROAD_Y, SAND_Y, WATER_Y, WORLD } from './config.js';
import { lightState } from './city.js';
import { MISSION_COUNT } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSION = 'mission';
export const SCREEN_STORY = 'story';

const VIEW_W = 1280;
const VIEW_H = 720;

function starPath(context, x, y, r) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function wrapText(context, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line === '' ? word : `${line} ${word}`;
    if (context.measureText(test).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  let dpr = 1;
  let cssW = 1280;
  let cssH = 720;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function viewScale() {
    return Math.min(cssW / VIEW_W, cssH / VIEW_H) * 0.98;
  }

  function visibleRect(state) {
    const scale = viewScale();
    const w = cssW / scale;
    const h = cssH / scale;
    return { x: state.camera.x - w / 2 - 40, y: state.camera.y - h / 2 - 40, w: w + 80, h: h + 80 };
  }

  function inView(rect, x, y, pad) {
    return x > rect.x - pad && x < rect.x + rect.w + pad && y > rect.y - pad && y < rect.y + rect.h + pad;
  }

  function drawGround(state) {
    const rect = visibleRect(state);
    const city = state.city;
    context.fillStyle = PALETTE.grass;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    // Block ground: pale concrete inside every block, so the city reads as streets.
    context.fillStyle = '#6d7a5e';
    for (const block of city.blocks) {
      if (!inView(rect, block.x + block.w / 2, block.y + block.h / 2, 200)) continue;
      context.fillRect(block.x, block.y, block.w, block.h);
    }
    // Beach and water along the south edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(rect.x, SAND_Y, rect.w, WATER_Y - SAND_Y);
    context.fillStyle = PALETTE.water;
    context.fillRect(rect.x, WATER_Y, rect.w, WORLD.height - WATER_Y);
    context.fillStyle = PALETTE.waterDeep;
    for (let i = 0; i < 3; i += 1) {
      const wy = WATER_Y + 40 + i * 46 + Math.sin(state.time * 0.8 + i * 1.7) * 6;
      context.fillRect(rect.x, wy, rect.w, 5);
    }
    // Parks.
    for (const park of city.parks) {
      if (!inView(rect, park.x + park.w / 2, park.y + park.h / 2, 200)) continue;
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        context.fillStyle = '#2f5a34';
        context.beginPath();
        context.arc(tree.x + 3, tree.y + 4, tree.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = tree.color;
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Parking lots.
    for (const lot of city.parkings) {
      if (!inView(rect, lot.x + lot.w / 2, lot.y + lot.h / 2, 200)) continue;
      context.fillStyle = '#3a3d44';
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
      context.strokeStyle = '#c8ccd4';
      context.lineWidth = 2;
      for (const spot of lot.spots) {
        context.strokeRect(spot.x - 18, spot.y - 34, 36, 68);
      }
    }
    // Roads: sidewalk edge, asphalt, centre dashes, crosswalks, lights.
    for (const road of ROAD_X) {
      if (road < rect.x - 100 || road > rect.x + rect.w + 100) continue;
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(road - ROAD_HALF - 14, 0, ROAD_WIDTH + 28, SAND_Y);
      context.fillStyle = PALETTE.road;
      context.fillRect(road - ROAD_HALF, 0, ROAD_WIDTH, SAND_Y);
    }
    for (const road of ROAD_Y) {
      if (road < rect.y - 100 || road > rect.y + rect.h + 100) continue;
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, road - ROAD_HALF - 14, WORLD.width, ROAD_WIDTH + 28);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, road - ROAD_HALF, WORLD.width, ROAD_WIDTH);
    }
    context.strokeStyle = PALETTE.roadLine;
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    for (const road of ROAD_X) {
      if (road < rect.x - 100 || road > rect.x + rect.w + 100) continue;
      context.beginPath();
      context.moveTo(road, 0);
      context.lineTo(road, SAND_Y);
      context.stroke();
    }
    for (const road of ROAD_Y) {
      if (road < rect.y - 100 || road > rect.y + rect.h + 100) continue;
      context.beginPath();
      context.moveTo(0, road);
      context.lineTo(WORLD.width, road);
      context.stroke();
    }
    context.setLineDash([]);
    // Crosswalks and traffic lights at every intersection in view.
    context.fillStyle = PALETTE.crosswalk;
    for (const ix of ROAD_X) {
      for (const iy of ROAD_Y) {
        if (!inView(rect, ix, iy, 140)) continue;
        for (let s = -2; s <= 2; s += 1) {
          context.fillRect(ix + s * 16 - 5, iy - ROAD_HALF - 8, 10, 16);
          context.fillRect(ix + s * 16 - 5, iy + ROAD_HALF - 8, 10, 16);
          context.fillRect(ix - ROAD_HALF - 8, iy + s * 16 - 5, 16, 10);
          context.fillRect(ix + ROAD_HALF - 8, iy + s * 16 - 5, 16, 10);
        }
        const stateLight = lightState(city, ix, iy, state.time);
        context.fillStyle = '#22242c';
        context.fillRect(ix + ROAD_HALF + 4, iy - ROAD_HALF - 26, 10, 26);
        context.fillStyle = stateLight === 'ns' ? '#58d68d' : '#ef5350';
        context.beginPath();
        context.arc(ix + ROAD_HALF + 9, iy - ROAD_HALF - 20, 4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.crosswalk;
      }
    }
    // Buildings: shadow, walls, roof, lit windows at dusk.
    for (const b of city.buildings) {
      if (!inView(rect, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.wall;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      context.strokeStyle = 'rgba(255,255,255,0.25)';
      context.lineWidth = 2;
      context.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      if (b.tall) {
        context.fillStyle = 'rgba(255,255,255,0.12)';
        context.fillRect(b.x + 8, b.y + 8, b.w - 16, 18);
      }
      if (state.dusk > 0.35) {
        context.fillStyle = `rgba(255, 214, 110, ${0.35 + state.dusk * 0.5})`;
        const cols = Math.floor((b.w - 24) / 26);
        const rows = Math.floor((b.h - 24) / 26);
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            if (((b.x * 7 + b.y * 13 + cx * 5 + cy * 11) % 5) < 2) {
              context.fillRect(b.x + 16 + cx * 26, b.y + 16 + cy * 26, 10, 12);
            }
          }
        }
      }
    }
  }

  function drawSkids(state) {
    context.fillStyle = 'rgba(20,20,24,0.4)';
    for (const skid of state.skids) {
      context.globalAlpha = Math.min(0.5, skid.life / 5);
      context.beginPath();
      context.arc(skid.x, skid.y, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (pickup.respawn > 0) continue;
      const bob = Math.sin(state.time * 3 + pickup.x) * 3;
      const y = pickup.y + bob;
      if (pickup.kind === 'health') {
        context.fillStyle = '#ffffff';
        context.fillRect(pickup.x - 13, y - 13, 26, 26);
        context.fillStyle = '#2ecc71';
        context.fillRect(pickup.x - 3, y - 9, 6, 18);
        context.fillRect(pickup.x - 9, y - 3, 18, 6);
      } else if (pickup.kind === 'ammo') {
        context.fillStyle = '#f2c94c';
        context.fillRect(pickup.x - 12, y - 9, 24, 18);
        context.fillStyle = '#22242c';
        context.fillRect(pickup.x - 6, y - 4, 12, 8);
      } else {
        context.fillStyle = '#58d68d';
        context.beginPath();
        context.arc(pickup.x, y, 13, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#14532d';
        context.font = `bold 16px ${FONT}`;
        context.textAlign = 'center';
        context.fillText('$', pickup.x, y + 6);
      }
    }
  }

  function drawCar(car, state, isPlayer) {
    const spec = car.spec;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Headlight cones at dusk.
    if (state.dusk > 0.4) {
      context.fillStyle = `rgba(255, 240, 170, ${0.10 + state.dusk * 0.10})`;
      context.beginPath();
      context.moveTo(spec.length / 2, -8);
      context.lineTo(spec.length / 2 + 150, -44);
      context.lineTo(spec.length / 2 + 150, 44);
      context.lineTo(spec.length / 2, 8);
      context.closePath();
      context.fill();
    }
    // Wheels.
    context.fillStyle = '#14161c';
    const wheelY = spec.width / 2 - 2;
    context.fillRect(-spec.length / 2 + 6, -wheelY - 4, 12, 6);
    context.fillRect(spec.length / 2 - 16, -wheelY - 4, 12, 6);
    context.fillRect(-spec.length / 2 + 6, wheelY - 2, 12, 6);
    context.fillRect(spec.length / 2 - 16, wheelY - 2, 12, 6);
    // Body.
    context.fillStyle = car.color;
    roundRect(context, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 7);
    context.fill();
    context.strokeStyle = isPlayer ? '#ffffff' : 'rgba(0,0,0,0.45)';
    context.lineWidth = isPlayer ? 2.5 : 1.5;
    roundRect(context, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 7);
    context.stroke();
    // Windshield and roof.
    context.fillStyle = 'rgba(180,220,240,0.85)';
    context.fillRect(spec.length / 2 - 16, -spec.width / 2 + 3, 8, spec.width - 6);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.fillRect(-6, -spec.width / 2 + 4, 16, spec.width - 8);
    if (car.kind === 'taxi') {
      context.fillStyle = '#22242c';
      for (let i = 0; i < 4; i += 1) context.fillRect(-14 + i * 8, -spec.width / 2 + 2, 4, 4);
      context.fillStyle = '#f2c94c';
      context.font = `bold 9px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('TAXI', 0, -spec.width / 2 - 4);
    }
    if (car.kind === 'police') {
      context.fillStyle = '#f2f4f8';
      context.fillRect(-10, -spec.width / 2 + 2, 20, spec.width - 4);
      context.fillStyle = '#22242c';
      context.font = `bold 8px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('POLICE', 0, 3);
      const flash = Math.floor(state.time * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      context.beginPath();
      context.arc(-2, -spec.width / 2 + 2, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      context.beginPath();
      context.arc(4, -spec.width / 2 + 2, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.beginPath();
    context.arc(spec.length / 2 - 2, -spec.width / 2 + 5, 2.5, 0, Math.PI * 2);
    context.arc(spec.length / 2 - 2, spec.width / 2 - 5, 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawPerson(x, y, angle, bodyColor, skinColor, down, state) {
    context.save();
    context.translate(x, y);
    if (down) {
      context.rotate(angle + Math.PI / 2);
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.beginPath();
      context.ellipse(0, 2, 16, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = bodyColor;
      context.beginPath();
      context.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = skinColor;
      context.beginPath();
      context.arc(16, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
      // Dizzy stars above a downed pedestrian.
      const sx = x + Math.cos(state.time * 3) * 8;
      const sy = y - 20 + Math.sin(state.time * 3) * 3;
      context.fillStyle = '#f2c94c';
      starPath(context, sx, sy, 5);
      context.fill();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(0, 3, 11, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(angle);
    context.fillStyle = bodyColor;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = skinColor;
    context.beginPath();
    context.arc(4, 0, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#22242c';
    context.beginPath();
    context.arc(9, 0, 2.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawMarker(state) {
    const marker = state.mission.marker;
    if (marker === null || !state.mission.active) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    context.save();
    context.translate(marker.x, marker.y);
    context.fillStyle = 'rgba(242, 201, 76, 0.13)';
    context.fillRect(-16, -260, 32, 260);
    context.fillStyle = '#f2c94c';
    context.rotate(Math.PI / 4);
    const s = 15 * pulse;
    context.fillRect(-s, -s, s * 2, s * 2);
    context.restore();
    context.fillStyle = '#f2c94c';
    context.font = `bold 15px ${FONT}`;
    context.textAlign = 'center';
    context.fillText(marker.label, marker.x, marker.y - 34);
  }

  function drawWorld(state) {
    const scale = viewScale();
    const shakeX = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake * 12 : 0;
    const shakeY = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake * 12 : 0;
    context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (cssW / 2 - (state.camera.x + shakeX) * scale), dpr * (cssH / 2 - (state.camera.y + shakeY) * scale));
    drawGround(state);
    drawSkids(state);
    drawPickups(state);
    drawMarker(state);
    const rect = visibleRect(state);
    for (const ped of state.peds) {
      if (!inView(rect, ped.x, ped.y, 40)) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.skin, ped.state === 'down', state);
    }
    for (const cop of state.cops) {
      if (!inView(rect, cop.x, cop.y, 40)) continue;
      context.save();
      context.translate(cop.x, cop.y);
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.beginPath();
      context.ellipse(0, 3, 11, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.rotate(cop.angle);
      context.fillStyle = '#1d2a4a';
      context.beginPath();
      context.arc(0, 0, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#f0c8a0';
      context.beginPath();
      context.arc(4, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2f7bff';
      context.fillRect(-2, -11, 12, 5);
      context.restore();
    }
    for (const car of state.cars) {
      if (!inView(rect, car.x, car.y, 90)) continue;
      drawCar(car, state, car === state.player.inCar);
    }
    const player = state.player;
    if (player.inCar === null) {
      const blink = player.hurtTimer > 0 && Math.floor(state.time * 12) % 2 === 0;
      if (!blink) {
        drawPerson(player.x, player.y, player.angle, '#2ec4b6', '#f0c8a0', false, state);
        if (player.punchTimer > 0) {
          context.strokeStyle = '#ffffff';
          context.lineWidth = 3;
          context.beginPath();
          context.arc(player.x, player.y, 30, player.angle - 0.7, player.angle + 0.7);
          context.stroke();
        }
      }
    }
    for (const bullet of state.bullets) {
      context.strokeStyle = '#ffe08a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Dusk and night fall over the city.
    if (state.dusk > 0) {
      context.fillStyle = `rgba(255, 110, 50, ${state.dusk * 0.10})`;
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
      context.fillStyle = `rgba(12, 14, 60, ${state.dusk * 0.26})`;
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  function drawMinimap(state) {
    const mw = 220;
    const mh = 165;
    const mx = cssW - mw - 16;
    const my = 16;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    context.fillStyle = 'rgba(16,19,28,0.88)';
    roundRect(context, mx - 4, my - 4, mw + 8, mh + 8, 8);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(context, mx, my, mw, mh, 4);
    context.clip();
    context.fillStyle = '#2c4632';
    context.fillRect(mx, my, mw, mh);
    context.fillStyle = '#e6cf96';
    context.fillRect(mx, my + SAND_Y * sy, mw, (WATER_Y - SAND_Y) * sy);
    context.fillStyle = '#2e7cb5';
    context.fillRect(mx, my + WATER_Y * sy, mw, (WORLD.height - WATER_Y) * sy);
    context.strokeStyle = PALETTE.minimapRoad;
    context.lineWidth = 2;
    for (const road of ROAD_X) {
      context.beginPath();
      context.moveTo(mx + road * sx, my);
      context.lineTo(mx + road * sx, my + SAND_Y * sy);
      context.stroke();
    }
    for (const road of ROAD_Y) {
      context.beginPath();
      context.moveTo(mx, my + road * sy);
      context.lineTo(mx + mw, my + road * sy);
      context.stroke();
    }
    const marker = state.mission.marker;
    if (marker !== null && state.mission.active) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.3;
      context.fillStyle = '#f2c94c';
      context.save();
      context.translate(mx + marker.x * sx, my + marker.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-4 * pulse, -4 * pulse, 8 * pulse, 8 * pulse);
      context.restore();
    }
    for (const car of state.cars) {
      if (car.driver === 'police') {
        context.fillStyle = Math.floor(state.time * 6) % 2 === 0 ? '#ff3b30' : '#2f7bff';
      } else if (car === state.player.inCar) {
        context.fillStyle = '#ffffff';
      } else {
        context.fillStyle = '#9aa0a8';
      }
      context.fillRect(mx + car.x * sx - 2, my + car.y * sy - 2, 4, 4);
    }
    const player = state.player;
    context.fillStyle = '#ffffff';
    context.save();
    context.translate(mx + player.x * sx, my + player.y * sy);
    context.rotate(player.angle);
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    // Viewport frame.
    const scale = viewScale();
    const vw = (cssW / scale) * sx;
    const vh = (cssH / scale) * sy;
    context.strokeStyle = 'rgba(255,255,255,0.5)';
    context.lineWidth = 1;
    context.strokeRect(mx + (state.camera.x - cssW / scale / 2) * sx, my + (state.camera.y - cssH / scale / 2) * sy, vw, vh);
    // Wanted stars under the minimap.
    const stars = state.wanted.stars;
    const starY = my + mh + 24;
    const starX = mx + mw / 2;
    for (let i = 0; i < 5; i += 1) {
      const x = starX + (i - 2) * 26;
      if (i < stars) {
        context.fillStyle = '#f2c94c';
        starPath(context, x, starY, 11);
        context.fill();
        context.strokeStyle = '#7a5b00';
      } else {
        context.strokeStyle = 'rgba(255,255,255,0.45)';
        starPath(context, x, starY, 11);
        context.stroke();
      }
      context.lineWidth = 1.5;
    }
  }

  function drawHud(state, ui) {
    const player = state.player;
    // Top-left: money, health, ammo.
    context.textBaseline = 'alphabetic';
    text(`$${player.money.toLocaleString('en-US')}`, 20, 34, 26, PALETTE.green, 'left', 'bold');
    context.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(context, 20, 46, 190, 16, 8);
    context.fill();
    context.fillStyle = player.health > 30 ? '#58d68d' : '#ef5350';
    roundRect(context, 20, 46, 190 * Math.max(0, player.health / 100), 16, 8);
    context.fill();
    text(`HP ${Math.max(0, Math.ceil(player.health))}`, 216, 60, 15, PALETTE.text, 'left');
    text(`Ammo ${player.ammo}`, 20, 84, 16, PALETTE.text, 'left');
    if (player.hasPackage) text('Package: carried', 20, 106, 16, PALETTE.gold, 'left', 'bold');
    // Top-centre: the current objective (and the timer when the job is timed).
    const mission = state.mission;
    const objective = mission.active ? mission.objective : mission.objective;
    context.font = `16px ${FONT}`;
    const objWidth = Math.min(cssW - 480, context.measureText(objective).width + 36);
    context.fillStyle = 'rgba(16,19,28,0.72)';
    roundRect(context, cssW / 2 - objWidth / 2, 14, objWidth, 34, 8);
    context.fill();
    text(objective, cssW / 2, 37, 16, PALETTE.text, 'center');
    if (mission.active && mission.timer > 0) {
      const timerText = `${Math.floor(mission.timer / 60)}:${String(Math.floor(mission.timer % 60)).padStart(2, '0')}`;
      text(timerText, cssW / 2, 66, 22, mission.timer < 30 ? '#ef5350' : PALETTE.gold, 'center', 'bold');
    }
    // Bottom-left: speed and the clock.
    const hours = Math.floor(state.clockMin / 60) % 24;
    const minutes = Math.floor(state.clockMin % 60);
    const clockText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const speed = player.inCar !== null ? Math.abs(Math.round(player.inCar.speed * 0.09)) : 0;
    text(`${speed} mph`, 20, cssH - 52, 24, PALETTE.text, 'left', 'bold');
    text(clockText, 20, cssH - 26, 16, PALETTE.muted, 'left');
    text(state.dusk > 0.6 ? 'Night' : state.dusk > 0.15 ? 'Dusk' : 'Day', 120, cssH - 26, 16, PALETTE.muted, 'left');
    // Bottom-centre: context prompt.
    let prompt = '';
    if (player.inCar !== null) prompt = 'E — get out   •   Drive with WASD';
    else {
      const nearCar = state.cars.some((car) => car.driver !== 'police' && Math.hypot(car.x - player.x, car.y - player.y) < 78);
      if (nearCar) prompt = 'E — steal this car   •   F — punch   •   Click — shoot';
      else prompt = 'WASD — walk   •   F — punch   •   Click — shoot';
    }
    if (!mission.active && mission.index < MISSION_COUNT) prompt += '   •   Enter — next job';
    text(prompt, cssW / 2, cssH - 26, 15, PALETTE.muted, 'center');
    // Mute state.
    if (ui.muted) text('Muted (M)', cssW - 20, cssH - 26, 15, PALETTE.muted, 'right');
    drawMinimap(state);
    // Mission marker arrow at the screen edge when the marker is off-screen.
    const marker = mission.marker;
    if (marker !== null && mission.active) {
      const scale = viewScale();
      const sx = (marker.x - state.camera.x) * scale + cssW / 2;
      const sy = (marker.y - state.camera.y) * scale + cssH / 2;
      if (sx < 60 || sx > cssW - 60 || sy < 60 || sy > cssH - 60) {
        const cx = cssW / 2;
        const cy = cssH / 2;
        const angle = Math.atan2(sy - cy, sx - cx);
        const ex = cx + Math.cos(angle) * (Math.min(cssW, cssH) / 2 - 70);
        const ey = cy + Math.sin(angle) * (Math.min(cssW, cssH) / 2 - 70);
        const dist = Math.round(Math.hypot(marker.x - player.x, marker.y - player.y) / 40);
        context.save();
        context.translate(ex, ey);
        context.rotate(angle);
        context.fillStyle = '#f2c94c';
        context.beginPath();
        context.moveTo(16, 0);
        context.lineTo(-10, -11);
        context.lineTo(-10, 11);
        context.closePath();
        context.fill();
        context.restore();
        text(`${dist}m`, ex, ey + 30, 14, PALETTE.gold, 'center', 'bold');
      }
    }
    // Phone call from Maya at the start of a mission.
    if (ui.phone !== null && state.time < ui.phone.until) {
      const pw = Math.min(560, cssW - 80);
      const px = (cssW - pw) / 2;
      const py = 96;
      context.font = `20px ${FONT}`;
      const lines = wrapText(context, ui.phone.brief, pw - 48);
      const ph = 108 + lines.length * 26;
      context.fillStyle = 'rgba(16,19,28,0.92)';
      roundRect(context, px, py, pw, ph, 12);
      context.fill();
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      roundRect(context, px, py, pw, ph, 12);
      context.stroke();
      text(`Incoming call — ${ui.phone.giver}`, px + 24, py + 34, 18, PALETTE.gold, 'left', 'bold');
      text(`${ui.phone.title}  •  Reward $${ui.phone.reward}`, px + 24, py + 62, 17, PALETTE.text, 'left');
      for (let i = 0; i < lines.length; i += 1) {
        text(lines[i], px + 24, py + 96 + i * 26, 17, PALETTE.muted, 'left');
      }
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = Math.min(680, cssW - 60);
    const lineHeight = 26;
    const height = 150 + lines.length * lineHeight;
    const x = (cssW - width) / 2;
    const y = (cssH - height) / 2;
    context.fillStyle = 'rgba(10, 12, 20, 0.72)';
    context.fillRect(0, 0, cssW, cssH);
    context.fillStyle = PALETTE.panel;
    roundRect(context, x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(context, x, y, width, height, 14);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, cssW / 2, y + 66, 44, accent || PALETTE.text, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], cssW / 2, y + 116 + i * lineHeight, 19, PALETTE.muted, 'center');
    }
    text(prompt, cssW / 2, y + height - 26, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, ui) {
    // Dim the living city behind the title so the words read at a glance.
    context.fillStyle = 'rgba(10, 12, 20, 0.58)';
    context.fillRect(0, 0, cssW, cssH);
    context.textBaseline = 'alphabetic';
    const cx = cssW / 2;
    text('NEON BAY', cx, 168, 92, '#f2c94c', 'center', 'bold');
    text('An open-world crime story', cx, 208, 24, PALETTE.text, 'center');
    const lines = [
      'You are Alex "Rook" Carter, fresh out of prison and broke in Neon Bay.',
      'Maya, the fixer who runs the night shift, has six jobs for you —',
      'steal cars, run packages, outdrive the cops, and get out clean.',
      '',
      'WASD / Arrows — move and drive      E — steal / enter a car',
      'Mouse — aim and shoot      F — punch      Esc — pause      M — mute',
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], cx, 268 + i * 28, 19, PALETTE.muted, 'center');
    }
    const save = ui.save;
    if (save !== null && save.missionsDone > 0) {
      text(`Welcome back — ${save.missionsDone} of ${MISSION_COUNT} jobs done, $${save.money.toLocaleString('en-US')} in your pocket.`, cx, 268 + lines.length * 28 + 12, 19, PALETTE.green, 'center', 'bold');
      text('Press Space or click to continue', cx, cssH - 96, 22, PALETTE.gold, 'center');
    } else {
      text('Press Space or click to start', cx, cssH - 96, 22, PALETTE.gold, 'center');
    }
    text('Neon Bay — an original game. No real city, no real gangsters.', cx, cssH - 56, 14, PALETTE.muted, 'center');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, ui) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, cssW, cssH);
    drawWorld(state);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.', ui.muted ? 'Sound: muted (M to unmute).' : 'Sound: on (M to mute).'], 'Press P or Esc to keep playing');
    } else if (screen === SCREEN_OVER) {
      const busted = state.gameOver === 'busted';
      drawPanel(
        busted ? 'BUSTED' : 'WASTED',
        [`The ${busted ? 'Neon Bay PD' : 'streets'} got the better of you this time.`, `Money kept: $${state.player.money.toLocaleString('en-US')}   •   Jobs done: ${state.mission.completedCount} of ${MISSION_COUNT}`],
        'Press Space or click to try again',
        busted ? '#4fa3ff' : '#ef5350',
      );
    } else if (screen === SCREEN_MISSION) {
      const result = ui.missionResult;
      drawPanel(
        'JOB DONE',
        [`${result.title} — Maya is pleased.`, `Reward: $${result.reward.toLocaleString('en-US')}   •   Total: $${state.player.money.toLocaleString('en-US')}`, state.mission.index < MISSION_COUNT ? `Next job: ${result.nextTitle}` : 'That was the last job. Neon Bay is yours.'],
        state.mission.index < MISSION_COUNT ? 'Press Enter for the next job' : 'Press Enter to keep roaming the city',
        '#58d68d',
      );
    } else if (screen === SCREEN_STORY) {
      drawPanel(
        'NEON BAY — STORY COMPLETE',
        [`All six jobs done. $${state.player.money.toLocaleString('en-US')} earned.`, `Cars stolen: ${state.stats.carsStolen}   •   Pedestrians flattened: ${state.stats.pedsHit}`, 'Maya buys you a drink at the Neon Palms. The city is yours now.'],
        'Press Space to keep roaming Neon Bay',
        '#f2c94c',
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);

  /** Convert a screen point (CSS pixels) to world coordinates under the camera. */
  function screenToWorld(state, x, y) {
    const scale = viewScale();
    return { x: (x - cssW / 2) / scale + state.camera.x, y: (y - cssH / 2) / scale + state.camera.y };
  }

  return { draw, screenToWorld };
}
