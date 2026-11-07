// Bot opponent. It drives a skater through exactly the same inputs a human
// uses (move, sprint, stop, aim, action, swing), so it obeys the same rules.
(function (H) {
  'use strict';

  const SK = H.SKATER, PK = H.PUCK, NET = H.NET, ST = H.STICK, SHOT = H.SHOT, clamp = H.clamp;

  function len(x, y) { return Math.hypot(x, y); }
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

  H.createBot = function (skater, world, difficulty) {
    const d = H.DIFFICULTY[difficulty] || H.DIFFICULTY.normal;
    skater.speedMul = d.speedMul;
    return {
      s: skater,
      w: world,
      d: d,
      thinkT: 0,
      seen: { x: 0, y: 0, vx: 0, vy: 0, age: 0 },
      chargeGoal: 0,
      aimY: 0,
      aimErr: 0,
      hadPuck: false,
      inRangeT: 0,
      swingWait: 0,
    };
  };

  // Steering: a move input that heads for a target and slows on arrival.
  function steer(s, tx, ty, arriveR, maxSp) {
    const dx = tx - s.pos.x, dy = ty - s.pos.y;
    const dist = len(dx, dy);
    const want = maxSp * Math.min(1, dist / arriveR);
    const n = norm(dx, dy);
    const dvx = n.x * want - s.vel.x, dvy = n.y * want - s.vel.y;
    const dvl = len(dvx, dvy);
    if (dvl < 1) return { x: 0, y: 0 };
    const k = Math.min(1, dvl / 40);
    return { x: dvx / dvl * k, y: dvy / dvl * k };
  }

  // Stick direction that sends the puck at `goal`: the shot leaves along the
  // stick at `power` plus half the skater's velocity, so compensate for that.
  function shotAim(s, puck, goal, power) {
    const D = norm(goal.x - puck.pos.x, goal.y - puck.pos.y);
    return { x: D.x * power - s.vel.x * 0.5, y: D.y * power - s.vel.y * 0.5 };
  }

  H.updateBot = function (bot, dt) {
    const s = bot.s, w = bot.w, d = bot.d, puck = w.puck, inp = s.input;
    const opp = w.skaters.find(function (o) { return o !== s; });
    const atkIdx = s.team === 0 ? 1 : 0;
    const atk = H.NETS[atkIdx];
    const def = H.NETS[s.team];
    const goalie = w.goalies[atkIdx];
    const atkSign = atk.side;
    const maxSp = SK.maxSpeed * s.speedMul;

    // Reaction delay: only "look" at the puck every so often.
    bot.thinkT -= dt;
    bot.seen.age += dt;
    if (bot.thinkT <= 0) {
      bot.thinkT = d.reaction * (0.7 + Math.random() * 0.6);
      bot.seen = { x: puck.pos.x, y: puck.pos.y, vx: puck.vel.x, vy: puck.vel.y, age: 0 };
    }
    let P = { x: bot.seen.x + bot.seen.vx * bot.seen.age, y: bot.seen.y + bot.seen.vy * bot.seen.age };
    const V = { x: bot.seen.vx, y: bot.seen.vy };
    const pc = H.boardsClamp(P.x, P.y, PK.radius);
    if (pc) P = { x: pc.x, y: pc.y };
    if (w.owner) P = { x: puck.pos.x, y: puck.pos.y }; // a carried puck is easy to track

    inp.sprint = false;
    inp.stop = false;
    inp.swing = false;

    const hasPuck = w.owner === s;
    if (hasPuck && !bot.hadPuck) {
      bot.aimErr = (Math.random() * 2 - 1) * d.aimErr;
      bot.inRangeT = 0;
    }
    bot.hadPuck = hasPuck;

    // ---------------- We have the puck ----------------
    if (hasPuck) {
      // Shoot for the side of the net the goalie isn't covering.
      const gy = goalie ? goalie.pos.y : 0;
      bot.aimY = (gy >= 0 ? -1 : 1) * (NET.half - 9) + bot.aimErr;
      const goal = { x: atk.gx, y: bot.aimY };
      const toLine = atkSign * (atk.gx - puck.pos.x);
      const distGoal = len(goal.x - puck.pos.x, goal.y - puck.pos.y);
      const goodAngle = toLine > 25 && Math.abs(puck.pos.y) / toLine < 1.6;

      // Is the opponent standing in the shooting lane?
      let laneBlocked = false;
      if (opp) {
        const lx = goal.x - puck.pos.x, ly = goal.y - puck.pos.y;
        const ll = len(lx, ly) || 1;
        const t = clamp(((opp.pos.x - puck.pos.x) * lx + (opp.pos.y - puck.pos.y) * ly) / (ll * ll), 0, 1);
        const cx = puck.pos.x + lx * t - opp.pos.x, cy = puck.pos.y + ly * t - opp.pos.y;
        laneBlocked = t > 0.02 && len(cx, cy) < SK.radius + PK.radius + 8;
      }

      // Already winding up: keep aiming, release when charged enough.
      if (s.charge >= 0) {
        const power = SHOT.min + (SHOT.max - SHOT.min) * s.charge;
        inp.aim = shotAim(s, puck, goal, power);
        inp.move = steer(s, s.pos.x + atkSign * 40, s.pos.y, 40, maxSp * 0.5);
        const aimed = Math.abs(angDiff(Math.atan2(inp.aim.y, inp.aim.x), s.stickAng)) < 0.06;
        const oppClose = opp && len(opp.pos.x - s.pos.x, opp.pos.y - s.pos.y) < 48;
        const ready = s.charge >= bot.chargeGoal || (oppClose && s.charge > 0.3);
        inp.action = !(ready && aimed);
        return;
      }

      if (distGoal < d.shootRange + 40 && goodAngle) bot.inRangeT += dt; else bot.inRangeT = 0;
      const stalled = bot.inRangeT > 1.0;
      if (distGoal < d.shootRange && goodAngle && (!laneBlocked || stalled)) {
        inp.action = true; // start winding up
        bot.chargeGoal = rand(d.charge[0], d.charge[1]);
        if (distGoal < 160) bot.chargeGoal *= 0.5; // quick shot in tight
        inp.aim = shotAim(s, puck, goal, SHOT.min);
        inp.move = steer(s, goal.x, goal.y, 60, maxSp);
        return;
      }
      inp.action = false;

      // Carry the puck toward a shooting spot.
      let tx, ty;
      if (toLine < 20) {
        // Behind the net: come out the side.
        tx = atk.gx - atkSign * 130;
        ty = (puck.pos.y >= 0 ? 1 : -1) * 110;
      } else if (laneBlocked && opp) {
        // Deke: cut across to whichever side of the defender is open.
        const side = opp.pos.y > s.pos.y ? -1 : 1;
        tx = atk.gx - atkSign * 160;
        ty = clamp(opp.pos.y + side * 120, -200, 200);
      } else {
        tx = atk.gx - atkSign * 170;
        ty = clamp(s.pos.y * 0.4, -90, 90);
      }
      inp.move = steer(s, tx, ty, 60, maxSp);
      // Keep the stick (and puck) on the side away from the defender.
      const md = norm(tx - s.pos.x, ty - s.pos.y);
      let ax = md.x, ay = md.y;
      if (opp && len(opp.pos.x - s.pos.x, opp.pos.y - s.pos.y) < 110) {
        const away = norm(s.pos.x - opp.pos.x, s.pos.y - opp.pos.y);
        ax = md.x * 0.5 + away.x; ay = md.y * 0.5 + away.y;
      }
      inp.aim = { x: ax, y: ay };
      const oppNear = opp && len(opp.pos.x - s.pos.x, opp.pos.y - s.pos.y) < 160;
      const far = len(tx - s.pos.x, ty - s.pos.y) > 300;
      inp.sprint = (oppNear || far) && s.stamina > 0.35;
      return;
    }

    inp.action = false;

    // ---------------- Opponent has the puck ----------------
    if (opp && w.owner === opp) {
      const dist = len(P.x - s.pos.x, P.y - s.pos.y);
      const engage = 90 + 170 * d.aggression;
      inp.aim = { x: P.x - s.pos.x, y: P.y - s.pos.y };
      if (bot.swingWait > 0) bot.swingWait -= dt;
      if (dist < engage) {
        // Close in on the puck (not the player) and swing at it.
        inp.move = steer(s, P.x, P.y, 25, maxSp);
        inp.sprint = s.stamina > 0.3;
        if (dist < ST.swingReach + PK.radius + 4 && s.swingCd <= 0 && bot.swingWait <= 0) {
          if (Math.random() < 0.35 + 0.65 * d.aggression) {
            // The swing sweeps through the aim direction, so aim at the puck.
            inp.swing = true;
          }
          bot.swingWait = 0.2 + (1 - d.aggression) * 0.5;
        }
      } else {
        // Get between the puck and our net.
        const gx = def.gx;
        const vx = P.x - gx, vy = P.y;
        const vl = len(vx, vy) || 1;
        const k = Math.max(70, vl * 0.4) / vl;
        const tx = gx + vx * k, ty = vy * k;
        inp.move = steer(s, tx, ty, 80, maxSp);
        inp.sprint = len(tx - s.pos.x, ty - s.pos.y) > 220 && s.stamina > 0.3;
      }
      return;
    }

    // ---------------- Loose puck: go get it ----------------
    const dist = len(P.x - s.pos.x, P.y - s.pos.y);
    const t = clamp(dist / maxSp, 0, 0.9);
    let qx = P.x + V.x * t * 0.85, qy = P.y + V.y * t * 0.85;
    const qc = H.boardsClamp(qx, qy, PK.radius + 4);
    if (qc) { qx = qc.x; qy = qc.y; }
    // Approach so the stick, not the body, meets the puck.
    const dir = norm(qx - s.pos.x, qy - s.pos.y);
    const tx = qx - dir.x * (ST.reach - 4), ty = qy - dir.y * (ST.reach - 4);
    inp.move = steer(s, tx, ty, 30, maxSp);
    inp.aim = { x: qx - s.pos.x, y: qy - s.pos.y };
    inp.sprint = dist > 180 && s.stamina > 0.3;
  };
})(window.H = window.H || {});
