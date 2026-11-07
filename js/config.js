// Global tuning values. Everything is in "world units" (roughly pixels at
// scale 1) and seconds. The rink is centered on (0, 0).
(function (H) {
  'use strict';

  H.RINK = {
    w: 1200,        // board-to-board length
    h: 560,         // board-to-board width
    r: 150,         // corner radius
    goalInset: 90,  // distance from end boards to the goal line
    blueX: 170,     // blue lines at x = +/- blueX
  };

  H.NET = {
    half: 40,   // half the width of the goal mouth
    depth: 34,  // how deep the net is behind the goal line
    thick: 2.5, // collision thickness of the frame
  };

  H.SKATER = {
    radius: 17,
    mass: 1,
    accel: 1100,
    maxSpeed: 290,
    sprintSpeed: 390,
    skateDrag: 0.25,   // drag while pushing
    coastDrag: 0.8,    // drag while gliding
    stopDrag: 5.5,     // drag while doing a hockey stop
    grip: 1.6,         // how fast sideways sliding is converted while turning
    staminaDrain: 0.4,
    staminaRegen: 0.22,
    minReach: 24,
    maxReach: 74,
    bladeMaxSpeed: 1450,
    bladeAccel: 40000,
    bladeK: 40,        // how hard the blade chases its target
    stickR: 3.5,
    boardE: 0.3,
    bodyE: 0.45,
  };

  H.PUCK = {
    radius: 6,
    mass: 0.06,
    drag: 0.32,
    maxSpeed: 1500,
    boardE: 0.72,
    netE: 0.35,
    stickE: 0.2,
    bodyE: 0.3,
  };

  // Puck possession: when a slow-moving blade touches a slow puck it "picks
  // it up" and the puck rides on the blade. A sharp deceleration of the
  // blade (the end of a swing) releases it, so the shot goes wherever you
  // swing. Pokes, body checks and anything that knocks it off break it.
  H.MAGNET = {
    range: 10,           // extra pickup distance beyond touching
    relSpeedMax: 380,    // puck must be this slow relative to the blade to pick it up
    cooldown: 0.25,      // no re-pickup for this long after a release
    releaseSpeed: 450,   // blade must be moving at least this fast...
    releaseDecel: 3000,  // ...and slowing down at least this hard to release
    follow: 45,          // how tightly the puck tracks its spot on the blade
    breakDist: 14,       // knocked this far off its spot -> loose puck
    pokeSpeed: 120,      // opponent stick hitting the puck this hard knocks it loose
  };

  H.PHYS = {
    step: 1 / 120,
    substeps: 4,
  };

  H.DIFFICULTY = {
    easy:   { speedMul: 0.82, reaction: 0.28, aimErr: 30, shootRange: 300, aggression: 0.45, shotPower: 0.72 },
    normal: { speedMul: 0.93, reaction: 0.14, aimErr: 16, shootRange: 360, aggression: 0.75, shotPower: 0.88 },
    hard:   { speedMul: 1.0,  reaction: 0.06, aimErr: 6,  shootRange: 420, aggression: 1.0,  shotPower: 1.0 },
  };
})(window.H = window.H || {});
