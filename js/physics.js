// Physics: skaters, sticks, puck possession, goalies, boards and nets.
//
// Possession model:
// - A loose puck that touches your stick sticks to your blade.
// - While you own it, nothing knocks it loose except an opponent's swing
//   whose stick actually hits the puck (not your body).
// - Hold the action button to charge a shot; release to shoot along your stick.
(function (H) {
  'use strict';

  const RINK = H.RINK, NET = H.NET, SK = H.SKATER, PK = H.PUCK;
  const ST = H.STICK, SH = H.SHOT, GO = H.GOALIE, PHYS = H.PHYS;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  H.clamp = clamp;

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

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

  function insideNet(net, x, y, margin) {
    const lo = Math.min(net.gx, net.bx) - margin, hi = Math.max(net.gx, net.bx) + margin;
    return x > lo && x < hi && Math.abs(y) < net.hy + margin;
  }

  function closest(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const L2 = abx * abx + aby * aby;
    let t = L2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / L2 : 0;
    t = clamp(t, 0, 1);
    return [ax + abx * t, ay + aby * t, t];
  }

  function segDist(px, py, seg) {
    const c = closest(px, py, seg[0], seg[1], seg[2], seg[3]);
    return Math.hypot(px - c[0], py - c[1]);
  }

  // ---------------- Entities ----------------
  function createSkater(team, x, y) {
    const ang = team === 0 ? 0 : Math.PI;
    return {
      team: team,
      pos: { x: x, y: y },
      vel: { x: 0, y: 0 },
      stickAng: ang,      // where the stick points
      angVel: 0,
      facing: ang,
      stamina: 1,
      speedMul: 1,
      frozen: false,
      swingT: 0,          // >0 while swinging
      swingCd: 0,
      charge: -1,         // -1 = not charging, else 0..1
      pickupCd: 0,
      prevAction: false,
      input: {
        move: { x: 0, y: 0 },
        sprint: false,
        stop: false,
        aim: { x: Math.cos(ang), y: Math.sin(ang) }, // direction to point the stick
        action: false,    // held: charge a shot (with puck) / swing (without)
        swing: false,     // pressed: swing the stick
      },
    };
  }
  H.createSkater = createSkater;

  function createGoalie(team) {
    const net = H.NETS[team];
    return {
      team: team,
      side: net.side,
      pos: { x: net.gx - net.side * GO.offset, y: 0 },
      vel: { x: 0, y: 0 },
      seen: { x: 0, y: 0, vx: 0, vy: 0, age: 0 },
      seenT: 0,
      clearT: 0,
    };
  }

  function createWorld() {
    return {
      skaters: [],
      goalies: [createGoalie(0), createGoalie(1)],
      puck: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, r: PK.radius, prev: { x: 0, y: 0 } },
      owner: null,
      events: [],
      goalLock: false,
      lastTouch: -1,
    };
  }
  H.createWorld = createWorld;

  H.resetGoalies = function (w) {
    w.goalies = [createGoalie(0), createGoalie(1)];
  };

  // Current stick geometry, including the swing animation.
  function stickGeom(s) {
    let ang = s.stickAng, reach = ST.reach;
    if (s.swingT > 0) {
      const t = 1 - s.swingT / ST.swingDur;          // 0 -> 1
      const e = t * t * (3 - 2 * t);                  // smoothstep
      ang += ST.swingArc * (1 - 2 * e);
      reach = ST.reach + (ST.swingReach - ST.reach) * Math.sin(Math.PI * t);
    }
    const ux = Math.cos(ang), uy = Math.sin(ang);
    return {
      ang: ang, ux: ux, uy: uy, reach: reach,
      hx: s.pos.x + ux * SK.radius * 0.55, hy: s.pos.y + uy * SK.radius * 0.55,
      tx: s.pos.x + ux * reach, ty: s.pos.y + uy * reach,
      // where a carried puck sits: just in front of the blade
      px: s.pos.x + ux * (reach + PK.radius - 1), py: s.pos.y + uy * (reach + PK.radius - 1),
    };
  }
  H.stickGeom = stickGeom;

  function goalieSeg(g) {
    return [g.pos.x, g.pos.y - GO.halfLen, g.pos.x, g.pos.y + GO.halfLen];
  }
  H.goalieSeg = goalieSeg;

  // ---------------- Skaters ----------------
  function updateSkater(w, s, h) {
    const inp = s.input;
    let mx = inp.move.x, my = inp.move.y;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const moving = ml > 0.1 && !s.frozen;
    const owns = w.owner === s;

    const sprinting = inp.sprint && moving && s.stamina > 0.02;
    if (sprinting) s.stamina = Math.max(0, s.stamina - SK.staminaDrain * h);
    else s.stamina = Math.min(1, s.stamina + SK.staminaRegen * h);

    let maxSp = (sprinting ? SK.sprintSpeed : SK.maxSpeed) * s.speedMul;
    if (s.charge >= 0) maxSp *= SH.chargeSpeedMul;
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

    // Edge grip: sideways sliding bleeds off while pushing, so turns carve.
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

    // Stick turns toward the aim direction at a limited rate.
    if (Math.hypot(inp.aim.x, inp.aim.y) > 1e-3) {
      const target = Math.atan2(inp.aim.y, inp.aim.x);
      const d = angleDiff(target, s.stickAng);
      const maxTurn = ST.turnRate * h;
      const turn = clamp(d, -maxTurn, maxTurn);
      s.stickAng += turn;
      s.angVel = turn / h;
    } else {
      s.angVel = 0;
    }
    s.facing = s.stickAng;

    // Timers
    if (s.swingT > 0) s.swingT = Math.max(0, s.swingT - h);
    if (s.swingCd > 0) s.swingCd -= h;
    if (s.pickupCd > 0) s.pickupCd -= h;

    // Action button: with the puck it charges a shot, without it swings.
    const pressed = inp.action && !s.prevAction;
    s.prevAction = inp.action;
    if (s.frozen) { s.charge = -1; inp.swing = false; return; }

    if (owns) {
      if (pressed) s.charge = 0;
      if (s.charge >= 0) {
        if (inp.action) s.charge = Math.min(1, s.charge + h / SH.chargeTime);
        else shoot(w, s);
      }
    } else {
      s.charge = -1;
      if ((pressed || inp.swing) && s.swingT <= 0 && s.swingCd <= 0) {
        s.swingT = ST.swingDur;
        s.swingCd = ST.swingCd;
        w.events.push({ type: 'swing', team: s.team });
      }
    }
    inp.swing = false;
  }

  function shoot(w, s) {
    const g = stickGeom(s);
    const power = SH.min + (SH.max - SH.min) * s.charge;
    const p = w.puck;
    p.pos.x = g.px; p.pos.y = g.py;
    p.vel.x = g.ux * power + s.vel.x * 0.5;
    p.vel.y = g.uy * power + s.vel.y * 0.5;
    w.owner = null;
    s.charge = -1;
    s.pickupCd = 0.3;
    w.lastTouch = s.team;
    w.events.push({ type: 'shot', team: s.team, strength: power });
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
      // Body contact makes noise but never knocks the puck loose.
      if (-vn > 220) w.events.push({ type: 'check', strength: -vn });
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

  // Circle vs capsule (segment with thickness). Moves the body out and
  // reflects its velocity off the (static) capsule.
  function collideSeg(body, seg, r, thick, e) {
    const c = closest(body.pos.x, body.pos.y, seg[0], seg[1], seg[2], seg[3]);
    let dx = body.pos.x - c[0], dy = body.pos.y - c[1];
    let d = Math.hypot(dx, dy);
    const min = r + thick;
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

  // ---------------- Goalies ----------------
  function updateGoalie(w, g, h) {
    const p = w.puck;
    const net = H.NETS[g.team];
    const side = g.side;
    const homeX = net.gx - side * GO.offset;

    // Reaction delay: look at the puck every so often, extrapolate between.
    g.seenT -= h;
    g.seen.age += h;
    if (g.seenT <= 0) {
      g.seenT = GO.reaction;
      g.seen = { x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y, age: 0 };
    }
    const Px = g.seen.x + g.seen.vx * g.seen.age;
    const Py = g.seen.y + g.seen.vy * g.seen.age;

    let ty = null;
    // Incoming shot: slide to where it will cross.
    if (g.seen.vx * side > 250) {
      const t = (homeX - Px) / g.seen.vx;
      if (t > 0 && t < 1.2) ty = Py + g.seen.vy * t;
    }
    if (ty === null) {
      const dx = (Px - net.gx) * -side; // >0 when the puck is in front of the net
      if (dx > 5) {
        // Cut down the angle: stay on the line between the puck and the net.
        ty = Py * Math.min(1, (GO.offset + 10) / dx);
      } else {
        // Behind the net: hug the near post.
        ty = (Py >= 0 ? 1 : -1) * (NET.half - 6);
      }
    }
    ty = clamp(ty, -(NET.half + 2), NET.half + 2);

    const want = clamp((ty - g.pos.y) * 14, -GO.speed, GO.speed);
    const dv = clamp(want - g.vel.y, -GO.accel * h, GO.accel * h);
    g.vel.y += dv;
    g.pos.y += g.vel.y * h;
    g.pos.x = homeX;

    // Clear a puck that's sitting on the goalie.
    if (!w.owner) {
      const sp = Math.hypot(p.vel.x, p.vel.y);
      const d = segDist(p.pos.x, p.pos.y, goalieSeg(g));
      if (d < GO.radius + PK.radius + 10 && sp < 150) {
        g.clearT += h;
        if (g.clearT > 0.4) {
          g.clearT = 0;
          const sy = p.pos.y >= g.pos.y ? 1 : -1;
          const l = Math.hypot(0.6, 1);
          p.vel.x = -side * 0.6 / l * 600;
          p.vel.y = sy / l * 600;
          w.events.push({ type: 'clear', team: g.team });
        }
      } else {
        g.clearT = 0;
      }
    }
  }

  // ---------------- Puck ----------------
  function dropPuck(w) {
    const s = w.owner;
    if (!s) return;
    const p = w.puck;
    p.pos.x = p.prev.x; p.pos.y = p.prev.y; // back to the last legal spot
    p.vel.x = s.vel.x; p.vel.y = s.vel.y;
    s.charge = -1;
    s.pickupCd = 0.3;
    w.owner = null;
  }

  // A swing that hits the puck. If someone else owns it, it's knocked loose;
  // a loose puck gets slapped.
  function checkSwingHits(w) {
    const p = w.puck;
    for (const s of w.skaters) {
      if (s.swingT <= 0 || w.owner === s) continue;
      const g = stickGeom(s);
      const c = closest(p.pos.x, p.pos.y, g.hx, g.hy, g.tx, g.ty);
      const d = Math.hypot(p.pos.x - c[0], p.pos.y - c[1]);
      if (d > PK.radius + ST.r + 2) continue;
      // The swing goes from +arc to -arc (clockwise on screen).
      const tx = g.uy, ty = -g.ux;
      const owned = !!w.owner;
      if (owned) {
        const victim = w.owner;
        victim.pickupCd = 0.7;
        victim.charge = -1;
        w.owner = null;
        w.events.push({ type: 'steal', team: s.team });
      }
      const speed = owned ? 320 : 650;
      p.vel.x = tx * speed + s.vel.x * 0.5;
      p.vel.y = ty * speed + s.vel.y * 0.5;
      const k = (PK.radius + ST.r + 2.5) / (d || 1);
      p.pos.x = c[0] + (p.pos.x - c[0]) * k;
      p.pos.y = c[1] + (p.pos.y - c[1]) * k;
      s.pickupCd = Math.max(s.pickupCd, 0.08);
      w.lastTouch = s.team;
      w.events.push({ type: 'stick', strength: speed });
      return;
    }
  }

  function updateOwnedPuck(w) {
    const p = w.puck, s = w.owner;
    const g = stickGeom(s);
    p.prev.x = p.pos.x; p.prev.y = p.pos.y;
    p.pos.x = g.px; p.pos.y = g.py;
    p.vel.x = s.vel.x - Math.sin(g.ang) * s.angVel * g.reach;
    p.vel.y = s.vel.y + Math.cos(g.ang) * s.angVel * g.reach;
    const c = boardsClamp(p.pos.x, p.pos.y, PK.radius);
    if (c) { p.pos.x = c.x; p.pos.y = c.y; }

    // You can't push the puck through the net frame or into the goalie.
    for (const net of H.NETS) {
      if (insideNet(net, p.pos.x, p.pos.y, PK.radius)) {
        let hit = false;
        for (const seg of net.segs) if (segDist(p.pos.x, p.pos.y, seg) < PK.radius + NET.thick) hit = true;
        const behindLine = (p.pos.x - net.gx) * net.side > 0;
        if (hit || behindLine) { dropPuck(w); return; }
      }
    }
    for (const gk of w.goalies) {
      if (segDist(p.pos.x, p.pos.y, goalieSeg(gk)) < GO.radius + PK.radius) {
        dropPuck(w);
        return;
      }
    }
  }

  function updateLoosePuck(w, h) {
    const p = w.puck;
    p.prev.x = p.pos.x; p.prev.y = p.pos.y;
    const f = Math.exp(-PK.drag * h);
    p.vel.x *= f; p.vel.y *= f;
    p.pos.x += p.vel.x * h;
    p.pos.y += p.vel.y * h;

    const bi = collideBoards(p, PK.radius, PK.boardE);
    if (bi > 120) w.events.push({ type: 'boards', strength: bi });

    for (const net of H.NETS) {
      for (let i = 0; i < net.segs.length; i++) {
        const hit = collideSeg(p, net.segs[i], PK.radius, NET.thick, PK.netE);
        if (hit && hit.impact > 80) {
          const isPost = i > 0 && hit.t < 0.25;
          w.events.push({ type: isPost ? 'post' : 'net', strength: hit.impact });
        }
      }
    }

    for (const gk of w.goalies) {
      const hit = collideSeg(p, goalieSeg(gk), PK.radius, GO.radius, GO.e);
      if (hit && hit.impact > 0) {
        // Pads push rebounds away from the net.
        p.vel.x += -gk.side * 40;
        if (hit.impact > 350) w.events.push({ type: 'save', team: gk.team, strength: hit.impact });
      }
    }

    for (const s of w.skaters) {
      let dx = p.pos.x - s.pos.x, dy = p.pos.y - s.pos.y;
      let d = Math.hypot(dx, dy);
      const min = SK.radius + PK.radius;
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
    }

    // Swings slap loose pucks too.
    checkSwingHits(w);

    // Pickup: a loose puck touching your stick sticks to your blade. Very
    // hard shots deflect off the stick instead.
    for (const s of w.skaters) {
      if (s.frozen) continue;
      const g = stickGeom(s);
      const c = closest(p.pos.x, p.pos.y, g.hx, g.hy, g.tx, g.ty);
      let dx = p.pos.x - c[0], dy = p.pos.y - c[1];
      let d = Math.hypot(dx, dy);
      const touchD = PK.radius + ST.r;
      const nearBlade = Math.hypot(p.pos.x - g.px, p.pos.y - g.py) < PK.radius + 4;
      if (d >= touchD + 2 && !nearBlade) continue;
      const rel = Math.hypot(p.vel.x - s.vel.x, p.vel.y - s.vel.y);
      if (s.pickupCd <= 0 && s.swingT <= 0 && rel < ST.pickupSpeed) {
        w.owner = s;
        w.lastTouch = s.team;
        w.events.push({ type: 'pickup', team: s.team });
        updateOwnedPuck(w);
        return;
      }
      if (d < touchD) {
        // Deflect off the shaft.
        if (d < 1e-6) { dx = -g.uy; dy = g.ux; d = 1; }
        const nx = dx / d, ny = dy / d;
        p.pos.x = c[0] + nx * touchD; p.pos.y = c[1] + ny * touchD;
        const vn = (p.vel.x - s.vel.x) * nx + (p.vel.y - s.vel.y) * ny;
        if (vn < 0) {
          p.vel.x -= 1.3 * vn * nx; p.vel.y -= 1.3 * vn * ny;
          if (-vn > 150) w.events.push({ type: 'stick', strength: -vn });
        }
        w.lastTouch = s.team;
      }
    }

    const ps = Math.hypot(p.vel.x, p.vel.y);
    if (ps > PK.maxSpeed) { p.vel.x *= PK.maxSpeed / ps; p.vel.y *= PK.maxSpeed / ps; }

    // Goal: loose puck mostly across the goal line, inside the net.
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

  // ---------------- Step ----------------
  function substep(w, h) {
    const sks = w.skaters;
    for (const s of sks) updateSkater(w, s, h);
    for (const g of w.goalies) updateGoalie(w, g, h);
    for (let i = 0; i < sks.length; i++)
      for (let j = i + 1; j < sks.length; j++) collideSkaters(w, sks[i], sks[j]);
    for (const s of sks) {
      collideBoards(s, SK.radius, SK.boardE);
      for (const net of H.NETS) {
        for (const seg of net.segs) collideSeg(s, seg, SK.radius, NET.thick, 0.2);
        collideSeg(s, net.mouth, SK.radius, NET.thick, 0.2); // can't skate into the net
      }
      for (const g of w.goalies) collideSeg(s, goalieSeg(g), SK.radius, GO.radius, 0.2);
    }
    if (w.owner) {
      updateOwnedPuck(w);
      if (w.owner) checkSwingHits(w);
    } else {
      updateLoosePuck(w, h);
    }
  }

  H.stepWorld = function (w, dt) {
    const h = dt / PHYS.substeps;
    for (let i = 0; i < PHYS.substeps; i++) substep(w, h);
  };
})(window.H = window.H || {});
