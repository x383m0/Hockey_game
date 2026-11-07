// Game flow: menu, faceoffs, clock, scoring, input, HUD.
(function (H) {
  'use strict';

    const PLAYER = 0, BOT = 1;

  const $ = function (id) { return document.getElementById(id); };
  const canvas = $('game');
  const renderer = new H.Renderer(canvas);

  const settings = { difficulty: 'normal', minutes: 3 };
  try {
    const saved = JSON.parse(localStorage.getItem('hockey-settings') || '{}');
    Object.assign(settings, saved);
  } catch (e) { /* storage unavailable */ }
  function saveSettings() {
    try { localStorage.setItem('hockey-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  const game = {
    state: 'menu',   // menu | countdown | play | goal | over
    paused: false,
    t: 0,
    clock: 0,
    overtime: false,
    score: [0, 0],
    world: null,
    bot: null,
    message: '',
    shots: [0, 0],
    saves: [0, 0],
    steals: [0, 0],
  };
  window.__game = game; // handy for debugging in the console

  // ---------------- Input ----------------
  // The stick points at the mouse cursor.
  // Left mouse: with the puck, hold to charge a shot and release to shoot;
  //             without it, swing your stick.
  // Right mouse / E: swing your stick (the only way to steal the puck).
  const keys = {};
  const mouse = { sx: 0, sy: 0, has: false, left: false, swingQueued: false };

  function playing() {
    return !game.paused && (game.state === 'play' || game.state === 'countdown' || game.state === 'goal');
  }

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (game.state !== 'menu' && game.state !== 'over') setPaused(!game.paused);
    }
    if (e.code === 'KeyE' && !e.repeat && playing()) mouse.swingQueued = true;
    if (e.code === 'KeyM') { const m = H.Audio.toggleMute(); flash(m ? 'Sound off' : 'Sound on'); }
    if (e.code === 'KeyR' && game.state === 'over') startGame();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
    mouse.left = false;
    if (game.state === 'play' || game.state === 'countdown') setPaused(true);
  });

  window.addEventListener('mousemove', function (e) {
    mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.has = true;
  });
  canvas.addEventListener('mousedown', function (e) {
    H.Audio.unlock();
    mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.has = true;
    if (e.button === 0) mouse.left = true;
    if (e.button === 2 && playing()) mouse.swingQueued = true;
    e.preventDefault();
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) mouse.left = false;
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function readPlayerInput(p) {
    const inp = p.input;
    let mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    inp.move.x = mx; inp.move.y = my;
    inp.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
    inp.stop = !!keys.Space;
    if (mouse.has) {
      const wpt = renderer.toWorld(mouse.sx, mouse.sy);
      inp.aim = { x: wpt.x - p.pos.x, y: wpt.y - p.pos.y };
    }
    inp.action = mouse.left;
    if (mouse.swingQueued) { inp.swing = true; mouse.swingQueued = false; }
  }

  // ---------------- Game flow ----------------
  function buildWorld() {
    const w = H.createWorld();
    w.skaters.push(H.createSkater(0, -120, 0));
    w.skaters.push(H.createSkater(1, 120, 0));
    return w;
  }

  function faceoff() {
    const w = game.world;
    const p = w.skaters[PLAYER], b = w.skaters[BOT];
    p.pos = { x: -90, y: 0 }; p.vel = { x: 0, y: 0 };
    b.pos = { x: 90, y: 0 }; b.vel = { x: 0, y: 0 };
    p.stickAng = 0; b.stickAng = Math.PI;
    for (const s of [p, b]) { s.charge = -1; s.swingT = 0; s.swingCd = 0; s.pickupCd = 0; }
    w.owner = null;
    H.resetGoalies(w);
    w.puck.pos = { x: 0, y: 0 }; w.puck.vel = { x: 0, y: 0 };
    w.goalLock = false;
    w.lastTouch = -1;
    w.events.length = 0;
    renderer.trail.length = 0;
    game.state = 'countdown';
    game.t = 3;
    game.lastBeep = 4;
  }

  function startGame() {
    game.world = buildWorld();
    game.bot = H.createBot(game.world.skaters[BOT], game.world, settings.difficulty);
    game.score = [0, 0];
    game.shots = [0, 0];
    game.saves = [0, 0];
    game.steals = [0, 0];
    game.clock = settings.minutes * 60;
    game.overtime = false;
    game.paused = false;
    showOverlay(null);
    faceoff();
    updateHud();
  }

  function setPaused(v) {
    game.paused = v;
    mouse.left = false;
    showOverlay(v ? 'pause' : null);
  }

  function endGame() {
    game.state = 'over';
    const s = game.score;
    const won = s[PLAYER] > s[BOT];
    $('over-title').textContent = won ? 'You win!' : 'Bot wins';
    $('over-score').textContent = s[PLAYER] + ' – ' + s[BOT];
    $('over-detail').textContent =
      'Shots on goal: you ' + game.shots[PLAYER] + ', bot ' + game.shots[BOT] +
      '. Steals: you ' + game.steals[PLAYER] + ', bot ' + game.steals[BOT] + '.' +
      (game.overtime ? ' Decided in overtime.' : '');
    showOverlay('over');
  }

  function onGoal(team) {
    game.score[team]++;
    // Every goal is a shot on goal, even a deflection the counter missed.
    game.shots[team] = Math.max(game.shots[team], game.score[team]);
    game.state = 'goal';
    game.t = 2.6;
    game.message = team === PLAYER ? 'GOAL!' : 'Bot scores';
    game.messageClass = team === PLAYER ? 'home' : 'away';
    renderer.shake = 10;
    const pk = game.world.puck;
    renderer.spawnSpray(pk.pos.x, pk.pos.y, 0, 0, 40,
      team === PLAYER ? 'rgba(80,140,255,' : 'rgba(240,80,70,');
    H.Audio.play({ type: 'goal' });
    updateHud();
  }

  let flashT = 0;
  function flash(text) { game.flash = text; flashT = 1.2; }

  // Shot-on-goal counter: a released shot that is heading at the net.
  function countShot(w, team) {
    const pk = w.puck;
    const net = H.NETS[team === 0 ? 1 : 0];
    if (Math.sign(pk.vel.x) !== net.side || Math.abs(pk.vel.x) < 300) return;
    const t = (net.gx - pk.pos.x) / pk.vel.x;
    if (t <= 0 || t > 1.2) return;
    const y = pk.pos.y + pk.vel.y * t;
    if (Math.abs(y) < net.hy + 4) game.shots[team]++;
  }

  // ---------------- Main loop ----------------
  const STEP = H.PHYS.step;
  let acc = 0;
  let lastTime = performance.now();

  function tick(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;

    if (game.world && !game.paused && game.state !== 'menu') {
      acc += dt;
      while (acc >= STEP) {
        fixedUpdate(STEP);
        acc -= STEP;
      }
    } else if (game.state === 'menu') {
      menuUpdate(dt);
    }

    if (flashT > 0) flashT -= dt;
    if (game.world && game.state !== 'menu' && !game.paused) renderer.update(dt, game.world);
    render();
    requestAnimationFrame(tick);
  }

  function fixedUpdate(dt) {
    const w = game.world;
    const p = w.skaters[PLAYER], b = w.skaters[BOT];
    const frozen = game.state === 'countdown';
    p.frozen = b.frozen = frozen;

    readPlayerInput(p);
    if (game.state === 'over') {
      b.input.move = { x: 0, y: 0 };
    } else {
      H.updateBot(game.bot, dt);
    }

    H.stepWorld(w, dt);

    // Ice spray on hard stops / sharp turns
    for (const s of w.skaters) {
      const sp = Math.hypot(s.vel.x, s.vel.y);
      if (s.input.stop && sp > 120 && Math.random() < 0.6) {
        renderer.spawnSpray(s.pos.x, s.pos.y, s.vel.x, s.vel.y, 1);
      }
    }

    for (const e of w.events) {
      if (e.type === 'goal') {
        if (game.state === 'play') onGoal(e.team);
        continue;
      }
      H.Audio.play(e);
      if (e.type === 'shot' && e.strength > 500) {
        if (game.state === 'play') countShot(w, e.team);
        renderer.spawnSpray(w.puck.pos.x, w.puck.pos.y, 0, 0, 5);
      }
      if (e.type === 'check' && e.strength > 300) renderer.shake = 5;
      if (game.state === 'play') {
        if (e.type === 'save') game.saves[e.team]++;
        if (e.type === 'steal') game.steals[e.team]++;
      }
      if (e.type === 'steal' && e.team === PLAYER) flash('Stolen!');
      if (e.type === 'steal' && e.team === BOT) flash('Puck lost!');
    }
    w.events.length = 0;

    if (game.state === 'countdown') {
      game.t -= dt;
      const sec = Math.ceil(game.t);
      if (sec < game.lastBeep && sec > 0) { game.lastBeep = sec; H.Audio.play({ type: 'beep' }); }
      game.message = sec > 0 ? String(sec) : '';
      game.messageClass = '';
      if (game.overtime && sec > 0) game.message = 'OT · ' + sec;
      if (game.t <= 0) {
        game.state = 'play';
        game.message = 'GO!';
        game.messageT = 0.6;
        H.Audio.play({ type: 'go' });
      }
    } else if (game.state === 'play') {
      if (game.messageT > 0) { game.messageT -= dt; if (game.messageT <= 0) game.message = ''; }
      if (!game.overtime) {
        game.clock -= dt;
        if (game.clock <= 0) {
          game.clock = 0;
          H.Audio.play({ type: 'whistle' });
          if (game.score[0] !== game.score[1]) {
            endGame();
          } else {
            game.overtime = true;
            game.message = 'Overtime: next goal wins';
            game.messageClass = '';
            game.state = 'goal';
            game.t = 2.2;
          }
        }
      }
    } else if (game.state === 'goal') {
      game.t -= dt;
      if (game.t <= 0) {
        game.message = '';
        if (game.overtime && game.score[0] !== game.score[1]) endGame();
        else if (!game.overtime && game.clock <= 0 && game.score[0] !== game.score[1]) endGame();
        else faceoff();
      }
    }
    updateHud();
  }

  // Attract mode behind the menu: two bots play each other.
  let menuWorld = null, menuBots = null;
  function menuUpdate(dt) {
    if (!menuWorld) {
      menuWorld = buildWorld();
      menuBots = [H.createBot(menuWorld.skaters[0], menuWorld, 'normal'), H.createBot(menuWorld.skaters[1], menuWorld, 'normal')];
    }
    acc += dt;
    while (acc >= STEP) {
      H.updateBot(menuBots[0], STEP);
      H.updateBot(menuBots[1], STEP);
      H.stepWorld(menuWorld, STEP);
      for (const e of menuWorld.events) {
        if (e.type === 'goal') {
          menuWorld.puck.pos = { x: 0, y: 0 }; menuWorld.puck.vel = { x: 0, y: 0 };
          menuWorld.goalLock = false;
        }
      }
      menuWorld.events.length = 0;
      acc -= STEP;
    }
    renderer.update(dt, menuWorld);
  }

  function render() {
    if (game.state === 'menu') {
      if (menuWorld) renderer.draw(menuWorld, { labels: [], playerIndex: -1 });
      return;
    }
    const w = game.world;
    const p = w.skaters[PLAYER];
    renderer.draw(w, {
      labels: ['YOU', 'BOT'],
      playerIndex: PLAYER,
      cursor: mouse.has ? renderer.toWorld(mouse.sx, mouse.sy) : null,
    });
  }

  // ---------------- HUD / overlays ----------------
  function fmtClock(t) {
    t = Math.max(0, Math.ceil(t));
    const m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateHud() {
    $('score-home').textContent = game.score[PLAYER];
    $('score-away').textContent = game.score[BOT];
    $('clock').textContent = game.overtime ? 'OT' : fmtClock(game.clock);
    const msg = $('message');
    const text = flashT > 0 && !game.message ? game.flash : game.message;
    if (msg.textContent !== text) msg.textContent = text || '';
    msg.className = 'message ' + (game.messageClass || '');
    if (game.world) {
      const st = game.world.skaters[PLAYER].stamina;
      $('stamina-fill').style.width = Math.round(st * 100) + '%';
      $('stamina-fill').classList.toggle('low', st < 0.25);
    }
  }

  function showOverlay(name) {
    for (const id of ['menu', 'pause', 'over']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name === 'menu');
  }

  // Menu controls
  function bindChoice(groupId, key, parse) {
    const btns = $(groupId).querySelectorAll('button');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', String(settings[key]) === btn.dataset.value);
      btn.addEventListener('click', function () {
        settings[key] = parse ? parse(btn.dataset.value) : btn.dataset.value;
        btns.forEach(function (b) { b.classList.toggle('active', b === btn); });
        saveSettings();
      });
    });
  }
  bindChoice('difficulty', 'difficulty');
  bindChoice('length', 'minutes', Number);


  $('start').addEventListener('click', function () { H.Audio.unlock(); startGame(); });
  $('resume').addEventListener('click', function () { H.Audio.unlock(); setPaused(false); });
  $('quit').addEventListener('click', function () {
    game.paused = false; game.state = 'menu'; showOverlay('menu');
  });
  $('again').addEventListener('click', function () { startGame(); });
  $('to-menu').addEventListener('click', function () { game.state = 'menu'; showOverlay('menu'); });

  window.addEventListener('resize', function () { renderer.resize(); });

  showOverlay('menu');
  requestAnimationFrame(tick);
})(window.H = window.H || {});
