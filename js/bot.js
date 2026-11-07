// Bot opponent. It drives a skater through exactly the same inputs a human
// uses (move, sprint, stop, stick target), so it obeys the same physics.
(function (H) {
  'use strict';

  const SK = H.SKATER, PK = H.PUCK, NET = H.NET, clamp = H.clamp;

  function len(x, y) { return Math.hypot(x, y); }
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }

  H.createBot = function (skater, world, difficulty) {
    const d = H.DIFFICULTY[difficulty] || H.DIFFICULTY.normal;
    skater.speedMul = d.speedMul;
    return {
      s: skater,
      w: world,
      d: d,
      thinkT: 0,
      seen: { x: 0, y: 0, vx: 0, vy: 0, age: 0 },
      shootT: 0,
      shotCd: 0,
      shotRel: { x: 0, y: 0 },
      shotDir: { x: 1, y: 0 },
      aimY: 0,
      hadPuck: false,
      inRangeT: 0,
    };
  };

  function rollAim(bot) {
    const side = Math.random() < 0.5 ? -1 : 1;
    bot.aimY = side * (NET.half - 11) + (Math.random() * 2 - 1) * bot.d.aimErr;
  }

  // Produce a move input that steers toward a target and slows on arrival.
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

  H.updateBot = function (bot, dt) {
    const s = bot.s, w = bot.w, d = bot.d, puck = w.puck, inp = s.input;
    const opp = w.skaters.find(function (o) { return o !== s; });
    const atk = H.NETS[s.team === 0 ? 1 : 0];
    const def = H.NETS[s.team];
    const atkSign = atk.side;

    if (bot.shotCd > 0) bot.shotCd -= dt;

    // Reaction delay: the bot only "looks" at the puck every so often and
    // extrapolates in between. Close to its own blade it reacts instantly.
    bot.thinkT -= dt;
    bot.seen.age += dt;
    if (bot.thinkT <= 0) {
      bot.thinkT = d.reaction * (0.7 + Math.random() * 0.6);
      bot.seen = { x: puck.pos.x, y: puck.pos.y, vx: puck.vel.x, vy: puck.vel.y, age: 0 };
    }
    const bw = H.bladeWorld(s);
    let P, V;
    if (len(puck.pos.x - bw.x, puck.pos.y - bw.y) < 45) {
      P = { x: puck.pos.x, y: puck.pos.y }; V = { x: puck.vel.x, y: puck.vel.y };
    } else {
      P = { x: bot.seen.x + bot.seen.vx * bot.seen.age, y: bot.seen.y + bot.seen.vy * bot.seen.age };
      V = { x: bot.seen.vx, y: bot.seen.vy };
      const c = H.boardsClamp(P.x, P.y, PK.radius);
      if (c) { P.x = c.x; P.y = c.y; }
    }

    const maxSp = SK.maxSpeed * s.speedMul;
    inp.sprint = false;
    inp.stop = false;
    inp.bladeMax = 0;

    // --- Mid-shot: sweep the blade through the puck toward the net. ---
    if (bot.shootT > 0) {
      bot.shootT -= dt;
      inp.stick.x = bot.shotRel.x; inp.stick.y = bot.shotRel.y;
      inp.bladeMax = SK.bladeMaxSpeed * d.shotPower;
      inp.move = { x: bot.shotDir.x * 0.6, y: bot.shotDir.y * 0.6 };
      return;
    }

    const hasPuck = !!s.hold;
    const oppHas = !!(opp && opp.hold);
    if (hasPuck && !bot.hadPuck) rollAim(bot);
    bot.hadPuck = hasPuck;

    if (hasPuck) {
      const goal = { x: atk.gx, y: bot.aimY };
      const aim = norm(goal.x - puck.pos.x, goal.y - puck.pos.y);
      const toLine = atkSign * (atk.gx - puck.pos.x); // >0 means in front of the net
      const distGoal = len(goal.x - puck.pos.x, goal.y - puck.pos.y);
      const goodAngle = toLine > 25 && Math.abs(puck.pos.y) / toLine < 1.7;

      // Plan the sweep: the puck leaves with (skater velocity + blade velocity),
      // so swing the blade along (aim * speed - our velocity). Keep the sweep
      // a straight line inside our reach so it doesn't curl.
      const spd = SK.bladeMaxSpeed * d.shotPower;
      const R = SK.maxReach - 1;
      let sweep = aim, sweepLen = 0, shotAim = aim;
      let rx = puck.pos.x, ry = puck.pos.y;
      for (let it = 0; it < 3; it++) {
        // Aim from where the puck will actually leave the blade.
        shotAim = norm(goal.x - rx, goal.y - ry);
        sweep = norm(shotAim.x * spd * 1.05 - s.vel.x, shotAim.y * spd * 1.05 - s.vel.y);
        const bdot = s.bladeRel.x * sweep.x + s.bladeRel.y * sweep.y;
        const c = s.bladeRel.x * s.bladeRel.x + s.bladeRel.y * s.bladeRel.y - R * R;
        const disc = bdot * bdot - c;
        sweepLen = disc > 0 ? -bdot + Math.sqrt(disc) : 0;
        const travel = Math.max(0, sweepLen - spd / SK.bladeK);
        rx = puck.pos.x + sweep.x * travel + s.vel.x * 0.05;
        ry = puck.pos.y + sweep.y * travel + s.vel.y * 0.05;
      }

      if (distGoal < d.shootRange + 40 && goodAngle) bot.inRangeT += dt; else bot.inRangeT = 0;
      const stalled = bot.inRangeT > 0.9;
      const canSwing = sweepLen > 60;
      // Don't fire straight into the defender: is the opponent in the lane?
      let laneBlocked = false;
      if (opp) {
        const lx = goal.x - rx, ly = goal.y - ry;
        const ll = len(lx, ly) || 1;
        const t = clamp(((opp.pos.x - rx) * lx + (opp.pos.y - ry) * ly) / (ll * ll), 0, 1);
        const cx = rx + lx * t - opp.pos.x, cy = ry + ly * t - opp.pos.y;
        laneBlocked = t > 0.02 && len(cx, cy) < SK.radius + PK.radius + 10;
      }
      if (distGoal < d.shootRange && goodAngle && (canSwing || stalled) &&
          (!laneBlocked || stalled) && bot.shotCd <= 0) {
        bot.inRangeT = 0;
        bot.shootT = 0.2;
        bot.shotCd = 0.9;
        bot.shotDir = shotAim;
        const L = Math.max(sweepLen, 40);
        bot.shotRel = { x: s.bladeRel.x + sweep.x * L, y: s.bladeRel.y + sweep.y * L };
        inp.stick.x = bot.shotRel.x; inp.stick.y = bot.shotRel.y;
        inp.bladeMax = spd;
        return;
      }

      // Carry the puck toward a shooting spot in the slot.
      let tx, ty;
      if (toLine < 20) {
        // Behind the net: come out the side.
        tx = atk.gx - atkSign * 130;
        ty = (puck.pos.y >= 0 ? 1 : -1) * 110;
      } else {
        tx = atk.gx - atkSign * 180;
        ty = clamp(puck.pos.y * 0.3, -80, 80);
        if (opp) {
          // Dodge if the opponent is standing in the way.
          const ox = opp.pos.x - s.pos.x, oy = opp.pos.y - s.pos.y;
          const md = norm(tx - s.pos.x, ty - s.pos.y);
          const ahead = ox * md.x + oy * md.y;
          const lateral = ox * -md.y + oy * md.x;
          if (ahead > 0 && ahead < 220 && Math.abs(lateral) < 60) {
            const side = lateral > 0 ? -1 : 1;
            tx += -md.y * side * 110; ty += md.x * side * 110;
          }
        }
        if (distGoal < d.shootRange + 40 && !laneBlocked) { tx = goal.x; ty = goal.y; }
        else if (laneBlocked && opp) {
          // Deke: cut across to whichever side of the defender is open.
          const side = opp.pos.y > puck.pos.y ? -1 : 1;
          tx = atk.gx - atkSign * 150; ty = clamp(opp.pos.y + side * 120, -200, 200);
        }
      }
      // Near the net, carry the puck along the shooting line so the blade
      // ends up behind it.
      const md = distGoal < d.shootRange + 80 ? aim : norm(tx - s.pos.x, ty - s.pos.y);
      const perp = { x: -md.y, y: md.x };
      const cr = (puck.pos.x - s.pos.x) * perp.x + (puck.pos.y - s.pos.y) * perp.y;
      const side = cr >= 0 ? 1 : -1;
      // Where we want the puck (relative), and the blade just behind it.
      const px = -md.x * 10 + perp.x * side * 32, py = -md.y * 10 + perp.y * side * 32;
      const contact = PK.radius + SK.stickR + 1;
      inp.stick.x = px - aim.x * contact;
      inp.stick.y = py - aim.y * contact;
      inp.bladeMax = 420;
      inp.move = steer(s, tx, ty, 60, maxSp);
      const oppNear = opp && len(opp.pos.x - s.pos.x, opp.pos.y - s.pos.y) < 160;
      inp.sprint = (oppNear || distGoal > 500) && s.stamina > 0.35;
      return;
    }

    if (oppHas && opp) {
      // Defend: sit between the puck and our net, attack if close enough.
      const gx = def.gx, gy = 0;
      const dist = len(P.x - s.pos.x, P.y - s.pos.y);
      const engage = 70 + 160 * d.aggression;
      if (dist < engage) {
        inp.move = steer(s, P.x, P.y, 30, maxSp);
        inp.stick.x = P.x - s.pos.x; inp.stick.y = P.y - s.pos.y;
        inp.sprint = s.stamina > 0.3;
      } else {
        let vx = P.x - gx, vy = P.y - gy;
        const vl = len(vx, vy) || 1;
        const k = Math.max(60, vl * 0.4) / vl;
        const tx = gx + vx * k, ty = gy + vy * k;
        inp.move = steer(s, tx, ty, 80, maxSp);
        inp.stick.x = P.x - s.pos.x; inp.stick.y = P.y - s.pos.y;
        inp.sprint = len(tx - s.pos.x, ty - s.pos.y) > 220 && s.stamina > 0.3;
      }
      return;
    }

    // Loose puck: go get it, approaching from the side away from our goal.
    const dist = len(P.x - s.pos.x, P.y - s.pos.y);
    const t = clamp(dist / maxSp, 0, 0.9);
    let qx = P.x + V.x * t * 0.85, qy = P.y + V.y * t * 0.85;
    const qc = H.boardsClamp(qx, qy, PK.radius + 4);
    if (qc) { qx = qc.x; qy = qc.y; }
    const aimQ = norm(atk.gx - qx, -qy);
    const perpQ = { x: -aimQ.y, y: aimQ.x };
    const sideQ = ((s.pos.x - qx) * perpQ.x + (s.pos.y - qy) * perpQ.y) >= 0 ? 1 : -1;
    let ax = qx - aimQ.x * 24 + perpQ.x * sideQ * 26;
    let ay = qy - aimQ.y * 24 + perpQ.y * sideQ * 26;
    const ac = H.boardsClamp(ax, ay, SK.radius + 2);
    if (ac) { ax = ac.x; ay = ac.y; }
    inp.move = steer(s, ax, ay, 40, maxSp);
    inp.stick.x = qx - s.pos.x; inp.stick.y = qy - s.pos.y;
    inp.bladeMax = 400;
    inp.sprint = dist > 180 && s.stamina > 0.3;
  };
})(window.H = window.H || {});
