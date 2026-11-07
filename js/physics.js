// Physics: skaters, sticks, puck, boards and nets.
(function (H) {
  'use strict';

  const RINK = H.RINK, NET = H.NET, SK = H.SKATER, PK = H.PUCK, MG = H.MAGNET, PHYS = H.PHYS;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  H.clamp = clamp;

  // If a circle of radius r at (x, y) pokes outside the rounded-rectangle
  // boards, return the corrected position and the outward normal.
  function boardsClamp(x, y, r) {
    const hw = RINK.w / 2, hh = RINK.h / 2, R = RINK.r;
    const cx = clamp(x, -hw + R, hw - R);
    const cy = clamp(y, -hh + R, hh - R);
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    const lim = R - r;
    if (d <= lim) return null;
    const nx = dx / d, ny = dy / d;
    return { x: cx + nx * lim, y: cy + ny * lim, nx: nx, ny: ny };
  }
  H.boardsClamp = boardsClamp;

  // side = -1 (left net) or +1 (right net). The mouth faces the center.
  function netGeom(side) {
    const gx = side * (RINK.w / 2 - RINK.goalInset);
    const bx = gx + side * NET.depth;
    const hy = NET.half;
    return {
      side: side, gx: gx, bx: bx, hy: hy,
      segs: [
        [bx, -hy, bx, hy],   // back
        [gx, -hy, bx, -hy],  // top side
        [gx, hy, bx, hy],    // bottom side
      ],
      mouth: [gx, -hy, gx, hy],
    };
  }
  // NETS[0] is defended by team 0 (left), NETS[1] by team 1 (right).
  H.NETS = [netGeom(-1), netGeom(1)];

  function closest(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const L2 = abx * abx + aby * aby;
    let t = L2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / L2 : 0;
    t = clamp(t, 0, 1);
    return [ax + abx * t, ay + aby * t, t];
  }

  function createSkater(team, x, y) {
    const dir = team === 0 ? 1 : -1;
    return {
      team: team,
      pos: { x: x, y: y },
      vel: { x: 0, y: 0 },
      bladeRel: { x: dir * 45, y: 0 },
      bladeRelVel: { x: 0, y: 0 },
      facing: team === 0 ? 0 : Math.PI,
      stamina: 1,
      magCd: 0,
      hold: null,     // {ox, oy}: puck offset from the blade tip while carrying
      prevBS: 0,      // blade speed last substep (for release detection)
      speedMul: 1,
      frozen: false,
      input: {
        move: { x: 0, y: 0 },
        sprint: false,
        stop: false,
        stick: { x: dir * 45, y: 0 }, // desired blade position, relative to skater
        bladeMax: 0,                  // optional blade speed limit (0 = none)
      },
    };
  }
  H.createSkater = createSkater;

  function createWorld() {
    return {
      skaters: [],
      puck: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, r: PK.radius },
      events: [],
      goalLock: false,
      lastTouch: -1,
    };
  }
  H.createWorld = createWorld;

  function bladeWorld(s) { return { x: s.pos.x + s.bladeRel.x, y: s.pos.y + s.bladeRel.y }; }
  function bladeVel(s) { return { x: s.vel.x + s.bladeRelVel.x, y: s.vel.y + s.bladeRelVel.y }; }
  H.bladeWorld = bladeWorld;
  H.bladeVel = bladeVel;

  function updateSkater(s, h) {
    const inp = s.input;
    let mx = inp.move.x, my = inp.move.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const moving = ml > 0.1 && !s.frozen;

    const sprinting = inp.sprint && moving && s.stamina > 0.02;
    if (sprinting) s.stamina = Math.max(0, s.stamina - SK.staminaDrain * h);
    else s.stamina = Math.min(1, s.stamina + SK.staminaRegen * h);

    const maxSp = (sprinting ? SK.sprintSpeed : SK.maxSpeed) * s.speedMul;
    const acc = SK.accel * s.speedMul * (sprinting ? 1.15 : 1);

    if (moving && !inp.stop) {
      s.vel.x += mx * acc * h;
      s.vel.y += my * acc * h;
    }

    let drag = moving ? SK.skateDrag : SK.coastDrag;
    if (inp.stop) drag = SK.stopDrag;
    if (s.frozen) drag = 10;
    const f = Math.exp(-drag * h);
    s.vel.x *= f; s.vel.y *= f;

    // Edge grip: while pushing, sideways sliding bleeds off so turns feel
    // like carving rather than drifting forever.
    if (moving && !inp.stop) {
      const ul = Math.hypot(mx, my) || 1;
      const nx = mx / ul, ny = my / ul;
      const along = s.vel.x * nx + s.vel.y * ny;
      const lx = s.vel.x - nx * along, ly = s.vel.y - ny * along;
      const g = 1 - Math.exp(-SK.grip * h);
      s.vel.x -= lx * g; s.vel.y -= ly * g;
    }

    const sp = Math.hypot(s.vel.x, s.vel.y);
    if (sp > maxSp) {
      const ns = maxSp + (sp - maxSp) * Math.exp(-6 * h);
      s.vel.x *= ns / sp; s.vel.y *= ns / sp;
    }

    s.pos.x += s.vel.x * h;
    s.pos.y += s.vel.y * h;

    // --- Stick blade ---
    let tx = inp.stick.x, ty = inp.stick.y;
    let tl = Math.hypot(tx, ty);
    if (tl < 1e-6) { tx = Math.cos(s.facing); ty = Math.sin(s.facing); tl = 1; }
    const ctl = clamp(tl, SK.minReach, SK.maxReach);
    tx *= ctl / tl; ty *= ctl / tl;

    const bmax = inp.bladeMax > 0 ? Math.min(inp.bladeMax, SK.bladeMaxSpeed) : SK.bladeMaxSpeed;
    let dvx = (tx - s.bladeRel.x) * SK.bladeK, dvy = (ty - s.bladeRel.y) * SK.bladeK;
    const dvl = Math.hypot(dvx, dvy);
    if (dvl > bmax) { dvx *= bmax / dvl; dvy *= bmax / dvl; }
    let ax = dvx - s.bladeRelVel.x, ay = dvy - s.bladeRelVel.y;
    const al = Math.hypot(ax, ay), amax = SK.bladeAccel * h;
    if (al > amax) { ax *= amax / al; ay *= amax / al; }
    s.bladeRelVel.x += ax; s.bladeRelVel.y += ay;
    s.bladeRel.x += s.bladeRelVel.x * h;
    s.bladeRel.y += s.bladeRelVel.y * h;

    // Keep the blade within reach.
    const L = Math.hypot(s.bladeRel.x, s.bladeRel.y) || 1e-6;
    if (L > SK.maxReach || L < SK.minReach) {
      const nL = clamp(L, SK.minReach, SK.maxReach);
      const ux = s.bladeRel.x / L, uy = s.bladeRel.y / L;
      s.bladeRel.x = ux * nL; s.bladeRel.y = uy * nL;
      const vr = s.bladeRelVel.x * ux + s.bladeRelVel.y * uy;
      if ((L > SK.maxReach && vr > 0) || (L < SK.minReach && vr < 0)) {
        s.bladeRelVel.x -= ux * vr; s.bladeRelVel.y -= uy * vr;
      }
    }

    // Blade can't go through the boards.
    const bw = boardsClamp(s.pos.x + s.bladeRel.x, s.pos.y + s.bladeRel.y, SK.stickR);
    if (bw) {
      s.bladeRel.x = bw.x - s.pos.x; s.bladeRel.y = bw.y - s.pos.y;
      const wvx = s.vel.x + s.bladeRelVel.x, wvy = s.vel.y + s.bladeRelVel.y;
      const vn = wvx * bw.nx + wvy * bw.ny;
      if (vn > 0) { s.bladeRelVel.x -= bw.nx * vn; s.bladeRelVel.y -= bw.ny * vn; }
    }

    if (s.magCd > 0) s.magCd -= h;

    // Face toward the stick.
    const target = Math.atan2(s.bladeRel.y, s.bladeRel.x);
    let da = target - s.facing;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    s.facing += da * (1 - Math.exp(-12 * h));
  }

  function collideSkaters(w, a, b) {
    let dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
    let d = Math.hypot(dx, dy);
    const min = SK.radius * 2;
    if (d >= min) return;
    if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    const push = (min - d) / 2;
    a.pos.x -= nx * push; a.pos.y -= ny * push;
    b.pos.x += nx * push; b.pos.y += ny * push;
    const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
    if (vn < 0) {
      const j = -(1 + SK.bodyE) * vn / 2;
      a.vel.x -= nx * j; a.vel.y -= ny * j;
      b.vel.x += nx * j; b.vel.y += ny * j;
      if (-vn > 220) {
        // A real body check knocks the puck loose.
        a.magCd = b.magCd = 0.4;
        a.hold = b.hold = null;
        w.events.push({ type: 'check', strength: -vn });
      }
    }
  }

  function collideBoards(body, r, e) {
    const c = boardsClamp(body.pos.x, body.pos.y, r);
    if (!c) return 0;
    body.pos.x = c.x; body.pos.y = c.y;
    const vn = body.vel.x * c.nx + body.vel.y * c.ny;
    if (vn > 0) {
      body.vel.x -= (1 + e) * vn * c.nx;
      body.vel.y -= (1 + e) * vn * c.ny;
      return vn;
    }
    return 0;
  }

  function collideSeg(body, seg, r, e) {
    const c = closest(body.pos.x, body.pos.y, seg[0], seg[1], seg[2], seg[3]);
    let dx = body.pos.x - c[0], dy = body.pos.y - c[1];
    let d = Math.hypot(dx, dy);
    const min = r + NET.thick;
    if (d >= min) return null;
    if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
    const nx = dx / d, ny = dy / d;
    body.pos.x = c[0] + nx * min; body.pos.y = c[1] + ny * min;
    const vn = body.vel.x * nx + body.vel.y * ny;
    if (vn < 0) {
      body.vel.x -= (1 + e) * vn * nx;
      body.vel.y -= (1 + e) * vn * ny;
    }
    return { impact: Math.max(0, -vn), t: c[2] };
  }

  function updatePuck(w, h) {
    const p = w.puck;
    const f = Math.exp(-PK.drag * h);
    p.vel.x *= f; p.vel.y *= f;
    p.pos.x += p.vel.x * h;
    p.pos.y += p.vel.y * h;

    const bi = collideBoards(p, PK.radius, PK.boardE);
    if (bi > 120) w.events.push({ type: 'boards', strength: bi });

    for (let n = 0; n < H.NETS.length; n++) {
      const segs = H.NETS[n].segs;
      for (let i = 0; i < segs.length; i++) {
        const hit = collideSeg(p, segs[i], PK.radius, PK.netE);
        if (hit && hit.impact > 80) {
          // t near 0 on a side segment = the post at the goal mouth.
          const isPost = i > 0 && hit.t < 0.25;
          w.events.push({ type: isPost ? 'post' : 'net', strength: hit.impact });
        }
      }
    }

    const sks = w.skaters;
    for (let i = 0; i < sks.length; i++) {
      const s = sks[i];

      // Puck vs body.
      let dx = p.pos.x - s.pos.x, dy = p.pos.y - s.pos.y;
      let d = Math.hypot(dx, dy);
      let min = SK.radius + PK.radius;
      if (d < min) {
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        const nx = dx / d, ny = dy / d;
        p.pos.x = s.pos.x + nx * min; p.pos.y = s.pos.y + ny * min;
        const vn = (p.vel.x - s.vel.x) * nx + (p.vel.y - s.vel.y) * ny;
        if (vn < 0) {
          const j = -(1 + PK.bodyE) * vn / (1 / PK.mass + 1 / SK.mass);
          p.vel.x += nx * j / PK.mass; p.vel.y += ny * j / PK.mass;
          s.vel.x -= nx * j / SK.mass; s.vel.y -= ny * j / SK.mass;
        }
      }

      // Puck vs stick (hand -> blade tip). The stick is driven, so it acts
      // like an infinitely heavy moving segment.
      const bl = Math.hypot(s.bladeRel.x, s.bladeRel.y) || 1;
      const hx = s.pos.x + s.bladeRel.x / bl * SK.radius * 0.7;
      const hy = s.pos.y + s.bladeRel.y / bl * SK.radius * 0.7;
      const tx = s.pos.x + s.bladeRel.x, ty = s.pos.y + s.bladeRel.y;
      const c = closest(p.pos.x, p.pos.y, hx, hy, tx, ty);
      dx = p.pos.x - c[0]; dy = p.pos.y - c[1];
      d = Math.hypot(dx, dy);
      min = PK.radius + SK.stickR;
      if (d < min) {
        if (d < 1e-6) { dx = -(ty - hy); dy = tx - hx; d = Math.hypot(dx, dy) || 1; }
        const nx = dx / d, ny = dy / d;
        p.pos.x = c[0] + nx * min; p.pos.y = c[1] + ny * min;
        const k = 0.25 + 0.75 * c[2];
        const cvx = s.vel.x + s.bladeRelVel.x * k, cvy = s.vel.y + s.bladeRelVel.y * k;
        const rvx = p.vel.x - cvx, rvy = p.vel.y - cvy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          p.vel.x -= (1 + PK.stickE) * vn * nx;
          p.vel.y -= (1 + PK.stickE) * vn * ny;
          // A little friction along the stick.
          const tvx = rvx - vn * nx, tvy = rvy - vn * ny;
          p.vel.x -= tvx * 0.03; p.vel.y -= tvy * 0.03;
          if (-vn > 150) w.events.push({ type: 'stick', strength: -vn });
          // Poke check: knock the puck off someone else's blade.
          if (-vn > MG.pokeSpeed) {
            for (let j = 0; j < sks.length; j++) {
              if (sks[j] !== s && sks[j].hold) { sks[j].hold = null; sks[j].magCd = 0.3; }
            }
          }
        }
        if (!s.hold) w.lastTouch = s.team;
      }
    }

    // Possession: carry / pick up / release the puck.
    for (let i = 0; i < sks.length; i++) {
      const s = sks[i];
      const tx = s.pos.x + s.bladeRel.x, ty = s.pos.y + s.bladeRel.y;
      const bvx = s.vel.x + s.bladeRelVel.x, bvy = s.vel.y + s.bladeRelVel.y;
      const bs = Math.hypot(s.bladeRelVel.x, s.bladeRelVel.y);
      const decel = (s.prevBS - bs) / h;
      const prevBS = s.prevBS;
      s.prevBS = bs;

      if (s.hold) {
        const gx = tx + s.hold.ox, gy = ty + s.hold.oy;
        const off = Math.hypot(gx - p.pos.x, gy - p.pos.y);
        if (off > MG.breakDist) {
          s.hold = null; s.magCd = MG.cooldown;
        } else if (prevBS > MG.releaseSpeed && decel > MG.releaseDecel) {
          // End of a swing: let it fly with the blade's velocity.
          s.hold = null; s.magCd = MG.cooldown;
          p.vel.x = bvx; p.vel.y = bvy;
          w.events.push({ type: 'shot', team: s.team, strength: Math.hypot(bvx, bvy) });
        } else {
          p.vel.x = bvx + (gx - p.pos.x) * MG.follow;
          p.vel.y = bvy + (gy - p.pos.y) * MG.follow;
          w.lastTouch = s.team;
        }
        continue;
      }

      if (s.magCd > 0) continue;
      let taken = false;
      for (let k = 0; k < sks.length; k++) if (sks[k].hold) taken = true;
      if (taken) continue;
      const dx = p.pos.x - tx, dy = p.pos.y - ty;
      const d = Math.hypot(dx, dy);
      const contact = PK.radius + SK.stickR;
      if (d < contact + MG.range && d > 1e-6 &&
          Math.hypot(p.vel.x - bvx, p.vel.y - bvy) < MG.relSpeedMax) {
        s.hold = { ox: dx / d * contact, oy: dy / d * contact };
        w.lastTouch = s.team;
        w.events.push({ type: 'pickup', team: s.team });
      }
    }

    const ps = Math.hypot(p.vel.x, p.vel.y);
    if (ps > PK.maxSpeed) { p.vel.x *= PK.maxSpeed / ps; p.vel.y *= PK.maxSpeed / ps; }

    // Goal check: puck mostly across the goal line, inside the net.
    if (!w.goalLock) {
      for (let n = 0; n < H.NETS.length; n++) {
        const net = H.NETS[n];
        const x = p.pos.x, sd = net.side;
        const across = sd < 0
          ? (x < net.gx - PK.radius * 0.6 && x > net.bx - 1)
          : (x > net.gx + PK.radius * 0.6 && x < net.bx + 1);
        if (across && Math.abs(p.pos.y) < net.hy) {
          w.goalLock = true;
          // Puck in the net defended by team n -> the other team scores.
          w.events.push({ type: 'goal', team: n === 0 ? 1 : 0 });
        }
      }
    }
  }

  function substep(w, h) {
    const sks = w.skaters;
    for (let i = 0; i < sks.length; i++) updateSkater(sks[i], h);
    for (let i = 0; i < sks.length; i++)
      for (let j = i + 1; j < sks.length; j++) collideSkaters(w, sks[i], sks[j]);
    for (let i = 0; i < sks.length; i++) {
      const s = sks[i];
      collideBoards(s, SK.radius, SK.boardE);
      for (let n = 0; n < H.NETS.length; n++) {
        const net = H.NETS[n];
        for (let k = 0; k < net.segs.length; k++) collideSeg(s, net.segs[k], SK.radius, 0.2);
        collideSeg(s, net.mouth, SK.radius, 0.2); // skaters can't skate into the net
      }
    }
    updatePuck(w, h);
  }

  H.stepWorld = function (w, dt) {
    const h = dt / PHYS.substeps;
    for (let i = 0; i < PHYS.substeps; i++) substep(w, h);
  };
})(window.H = window.H || {});
