// Canvas rendering: rink, nets, skaters, sticks, puck, particles.
(function (H) {
  'use strict';

  const RINK = H.RINK, NET = H.NET, SK = H.SKATER, PK = H.PUCK;

  const TEAM_COLORS = [
    { body: '#2f6fe4', dark: '#173a7a', helmet: '#e8eef9' },
    { body: '#e0413a', dark: '#7a1a16', helmet: '#1d1d1d' },
  ];
  H.TEAM_COLORS = TEAM_COLORS;

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.trail = [];
    this.particles = [];
    this.shake = 0;
    this.rinkCanvas = document.createElement('canvas');
    this.resize();
  }

  Renderer.prototype.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = dpr;
    this.cw = w; this.ch = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const margin = 24, top = 70;
    this.scale = Math.min((w - margin * 2) / (RINK.w + 40), (h - top - margin) / (RINK.h + 40));
    this.ox = w / 2;
    this.oy = top + (h - top - margin) / 2;
    this.buildRink();
  };

  Renderer.prototype.toWorld = function (sx, sy) {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  };

  // The rink markings never change, so draw them once to an offscreen canvas.
  Renderer.prototype.buildRink = function () {
    const c = this.rinkCanvas;
    const pad = 30;
    const s = this.scale * this.dpr;
    c.width = Math.ceil((RINK.w + pad * 2) * s);
    c.height = Math.ceil((RINK.h + pad * 2) * s);
    const ctx = c.getContext('2d');
    ctx.setTransform(s, 0, 0, s, (RINK.w / 2 + pad) * s, (RINK.h / 2 + pad) * s);
    const hw = RINK.w / 2, hh = RINK.h / 2;

    // Boards
    roundRectPath(ctx, -hw - 10, -hh - 10, RINK.w + 20, RINK.h + 20, RINK.r + 10);
    ctx.fillStyle = '#d9dee6';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#59606b';
    ctx.stroke();

    // Ice
    ctx.save();
    roundRectPath(ctx, -hw, -hh, RINK.w, RINK.h, RINK.r);
    const g = ctx.createRadialGradient(0, 0, 50, 0, 0, RINK.w * 0.6);
    g.addColorStop(0, '#f7fbfe');
    g.addColorStop(1, '#e3eef6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();

    // Subtle scratches on the ice
    ctx.strokeStyle = 'rgba(150,180,200,0.10)';
    ctx.lineWidth = 1;
    let seed = 7;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 140; i++) {
      const x = (rnd() - 0.5) * RINK.w, y = (rnd() - 0.5) * RINK.h;
      const a = rnd() * Math.PI, l = 10 + rnd() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }

    // Goal creases
    for (const net of H.NETS) {
      ctx.beginPath();
      const start = net.side < 0 ? -Math.PI / 2 : Math.PI / 2;
      ctx.arc(net.gx, 0, 58, start, start + Math.PI, false);
      ctx.closePath();
      ctx.fillStyle = 'rgba(80,150,230,0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d33';
      ctx.stroke();
    }

    // Goal lines
    ctx.strokeStyle = '#d33';
    ctx.lineWidth = 2.5;
    for (const net of H.NETS) {
      ctx.beginPath();
      ctx.moveTo(net.gx, -hh); ctx.lineTo(net.gx, hh);
      ctx.stroke();
    }

    // Blue lines
    ctx.strokeStyle = '#2a5bd7';
    ctx.lineWidth = 9;
    for (const x of [-RINK.blueX, RINK.blueX]) {
      ctx.beginPath();
      ctx.moveTo(x, -hh); ctx.lineTo(x, hh);
      ctx.stroke();
    }

    // Center red line (dashed look)
    ctx.strokeStyle = '#d33';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, -hh); ctx.lineTo(0, hh);
    ctx.stroke();
    ctx.strokeStyle = '#f7fbfe';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, -hh); ctx.lineTo(0, hh);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.strokeStyle = '#2a5bd7';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2a5bd7';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();

    // Zone faceoff circles
    ctx.strokeStyle = '#d33';
    ctx.fillStyle = '#d33';
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = sx * 400, y = sy * 140;
        ctx.beginPath(); ctx.arc(x, y, 52, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        // hash marks
        for (const hx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + hx * 10, y - 52); ctx.lineTo(x + hx * 10, y - 62);
          ctx.moveTo(x + hx * 10, y + 52); ctx.lineTo(x + hx * 10, y + 62);
          ctx.stroke();
        }
      }
      // Neutral zone dots
      for (const sy of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * 230, sy * 140, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // Inner board edge
    roundRectPath(ctx, -hw, -hh, RINK.w, RINK.h, RINK.r);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f2c94c';
    ctx.stroke();

    this.rinkPad = pad;
  };

  Renderer.prototype.spawnSpray = function (x, y, vx, vy, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 80;
      this.particles.push({
        x: x, y: y,
        vx: vx * 0.3 + Math.cos(a) * sp, vy: vy * 0.3 + Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.4, max: 0.8,
        r: 1 + Math.random() * 2,
        color: color || 'rgba(255,255,255,',
      });
    }
  };

  Renderer.prototype.update = function (dt, world) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt);
    }
    const pk = world.puck;
    this.trail.push({ x: pk.pos.x, y: pk.pos.y, s: Math.hypot(pk.vel.x, pk.vel.y) });
    if (this.trail.length > 14) this.trail.shift();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
  };

  Renderer.prototype.drawNet = function (ctx, net, front) {
    const gx = net.gx, bx = net.bx, hy = net.hy;
    if (!front) {
      // Net mesh
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gx, -hy); ctx.lineTo(bx, -hy); ctx.lineTo(bx, hy); ctx.lineTo(gx, hy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgba(120,120,130,0.45)';
      ctx.lineWidth = 0.8;
      for (let i = -hy - 40; i < hy + 40; i += 7) {
        ctx.beginPath(); ctx.moveTo(Math.min(gx, bx), i); ctx.lineTo(Math.max(gx, bx), i + 34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(Math.min(gx, bx), i); ctx.lineTo(Math.max(gx, bx), i - 34); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // Frame
    ctx.strokeStyle = '#d0201a';
    ctx.lineWidth = NET.thick * 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, -hy); ctx.lineTo(bx, -hy); ctx.lineTo(bx, hy); ctx.lineTo(gx, hy);
    ctx.stroke();
    ctx.fillStyle = '#b01812';
    ctx.beginPath(); ctx.arc(gx, -hy, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
  };

  Renderer.prototype.drawSkater = function (ctx, s, label, controlled) {
    const col = TEAM_COLORS[s.team];
    const x = s.pos.x, y = s.pos.y;
    const bl = Math.hypot(s.bladeRel.x, s.bladeRel.y) || 1;
    const ux = s.bladeRel.x / bl, uy = s.bladeRel.y / bl;
    const hx = x + ux * SK.radius * 0.7, hy = y + uy * SK.radius * 0.7;
    const tx = x + s.bladeRel.x, ty = y + s.bladeRel.y;

    // Shadow
    ctx.fillStyle = 'rgba(0,30,60,0.18)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 4, SK.radius + 2, SK.radius, 0, 0, Math.PI * 2); ctx.fill();

    // Stick shaft
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2118';
    ctx.lineWidth = SK.stickR * 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
    // Blade (hook toward the left of the shaft)
    const px = -uy, py = ux;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = SK.stickR * 2.2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + px * 9 - ux * 2, ty + py * 9 - uy * 2); ctx.stroke();
    // Tape
    ctx.strokeStyle = '#f4f4f4';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx - ux * 2, ty - uy * 2); ctx.lineTo(tx + px * 6 - ux * 2, ty + py * 6 - uy * 2); ctx.stroke();

    // Body
    ctx.fillStyle = col.body;
    ctx.strokeStyle = col.dark;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, SK.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Shoulders stripe
    const fa = s.facing;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, SK.radius - 5, fa + Math.PI / 2 - 0.9, fa + Math.PI / 2 + 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, SK.radius - 5, fa - Math.PI / 2 - 0.9, fa - Math.PI / 2 + 0.9); ctx.stroke();
    // Helmet
    ctx.fillStyle = col.helmet;
    ctx.beginPath(); ctx.arc(x + Math.cos(fa) * 2, y + Math.sin(fa) * 2, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(x + Math.cos(fa) * 6, y + Math.sin(fa) * 6, 3, 0, Math.PI * 2); ctx.fill();

    if (label) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = controlled ? '#173a7a' : '#7a1a16';
      ctx.fillText(label, x, y - SK.radius - 8);
    }
  };

  Renderer.prototype.draw = function (world, opts) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Arena background
    const bg = ctx.createLinearGradient(0, 0, 0, this.ch);
    bg.addColorStop(0, '#141a24');
    bg.addColorStop(1, '#0b0f16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.cw, this.ch);

    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; }

    const s = this.scale;
    const pad = this.rinkPad;
    ctx.drawImage(this.rinkCanvas,
      this.ox - (RINK.w / 2 + pad) * s + sx, this.oy - (RINK.h / 2 + pad) * s + sy,
      (RINK.w + pad * 2) * s, (RINK.h + pad * 2) * s);

    ctx.setTransform(s * dpr, 0, 0, s * dpr, (this.ox + sx) * dpr, (this.oy + sy) * dpr);

    for (const net of H.NETS) this.drawNet(ctx, net, false);

    // Puck trail
    const pk = world.puck;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      if (b.s < 250) continue;
      const k = i / this.trail.length;
      ctx.strokeStyle = 'rgba(20,30,40,' + (0.25 * k * Math.min(1, b.s / 900)) + ')';
      ctx.lineWidth = PK.radius * 2 * k;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // Particles (ice spray)
    for (const p of this.particles) {
      ctx.fillStyle = p.color + Math.max(0, p.life / p.max) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    // Skaters
    const labels = opts.labels || [];
    for (let i = 0; i < world.skaters.length; i++) {
      this.drawSkater(ctx, world.skaters[i], labels[i], i === opts.playerIndex);
    }

    // Puck
    ctx.fillStyle = 'rgba(0,20,40,0.25)';
    ctx.beginPath(); ctx.arc(pk.pos.x + 2, pk.pos.y + 2.5, PK.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(pk.pos.x, pk.pos.y, PK.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(pk.pos.x, pk.pos.y, PK.radius - 1.5, 0, Math.PI * 2); ctx.stroke();

    for (const net of H.NETS) this.drawNet(ctx, net, true);

    // Stick target reticle for the human player
    if (opts.reticle) {
      const r = opts.reticle;
      ctx.strokeStyle = 'rgba(23,58,122,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r.x - 9, r.y); ctx.lineTo(r.x - 4, r.y);
      ctx.moveTo(r.x + 4, r.y); ctx.lineTo(r.x + 9, r.y);
      ctx.moveTo(r.x, r.y - 9); ctx.lineTo(r.x, r.y - 4);
      ctx.moveTo(r.x, r.y + 4); ctx.lineTo(r.x, r.y + 9);
      ctx.stroke();
    }
  };

  H.Renderer = Renderer;
})(window.H = window.H || {});
