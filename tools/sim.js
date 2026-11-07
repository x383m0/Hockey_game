// Headless sanity check: runs bot-vs-bot (or bot vs idle skater) matches
// using the real game code and prints goal counts.
// Usage: node tools/sim.js [minutes] [botDifficulty] [opponent: bot|idle]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console: console, Math: Math };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['config.js', 'physics.js', 'bot.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const H = ctx.H;

const minutes = Number(process.argv[2] || 5);
const diff = process.argv[3] || 'normal';
const oppMode = process.argv[4] || 'bot';

const w = H.createWorld();
const a = H.createSkater(0, -120, 0);
const b = H.createSkater(1, 120, 0);
w.skaters.push(a, b);
const botB = H.createBot(b, w, diff);
const botA = oppMode === 'bot' ? H.createBot(a, w, diff) : null;

function faceoff() {
  a.pos = { x: -120, y: 0 }; a.vel = { x: 0, y: 0 };
  b.pos = { x: 120, y: 0 }; b.vel = { x: 0, y: 0 };
  w.puck.pos = { x: 0, y: 0 }; w.puck.vel = { x: 0, y: 0 };
  w.goalLock = false;
}

const score = [0, 0];
let shots = 0, nan = false, maxPuck = 0;
const dt = H.PHYS.step;
let sinceGoal = 0;
for (let t = 0; t < minutes * 60; t += dt) {
  if (botA) H.updateBot(botA, dt);
  H.updateBot(botB, dt);
  H.stepWorld(w, dt);
  sinceGoal += dt;
  maxPuck = Math.max(maxPuck, Math.hypot(w.puck.vel.x, w.puck.vel.y));
  if (!isFinite(w.puck.pos.x) || !isFinite(a.pos.x) || !isFinite(b.pos.x)) { nan = true; break; }
  for (const e of w.events) {
    if (e.type === 'goal') { score[e.team]++; faceoff(); sinceGoal = 0; }
    if (e.type === 'stick' && e.strength > 700) shots++;
  }
  w.events.length = 0;
}
console.log(JSON.stringify({ minutes, diff, oppMode, score, hardStickHits: shots, maxPuckSpeed: Math.round(maxPuck), nan }));
