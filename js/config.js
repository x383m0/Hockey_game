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
    boardE: 0.3,
    bodyE: 0.45,
  };

  H.PUCK = {
    radius: 6,
    mass: 0.06,
    drag: 0.32,
    maxSpeed: 1700,
    boardE: 0.72,
    netE: 0.35,
    stickE: 0.2,
    bodyE: 0.3,
  };

  // Stick. The blade points toward where you aim, at a fixed short reach.
  H.STICK = {
    reach: 33,        // blade tip distance from the skater's center
    r: 3.5,           // shaft thickness (collision radius)
    turnRate: 16,     // how fast the stick turns toward your aim (rad/s)
    swingReach: 42,   // the stick extends a little during a swing
    swingArc: 1.25,   // swing sweeps from +arc to -arc around the aim (rad)
    swingDur: 0.2,
    swingCd: 0.9,     // cooldown between swings
    pickupSpeed: 900, // a loose puck slower than this (relative) sticks to your blade
  };

  // Charged shot: hold to fill the bar, release to shoot.
  H.SHOT = {
    min: 450,
    max: 1600,
    chargeTime: 1.0,     // seconds to full power
    chargeSpeedMul: 0.8, // skate a bit slower while winding up
  };

  H.GOALIE = {
    offset: 16,     // how far out from the goal line the goalie stands
    halfLen: 8,     // pads: a capsule spanning +/- halfLen along the goal line
    radius: 10,
    speed: 240,
    accel: 4000,
    reaction: 0.14,
    e: 0.25,        // rebound bounciness
  };

  H.PHYS = {
    step: 1 / 120,
    substeps: 4,
  };

  H.DIFFICULTY = {
    // charge: [min, max] seconds the bot winds up a shot
    easy:   { speedMul: 0.82, reaction: 0.28, aimErr: 22, shootRange: 300, aggression: 0.35, charge: [0.25, 0.5] },
    normal: { speedMul: 0.93, reaction: 0.14, aimErr: 12, shootRange: 360, aggression: 0.6,  charge: [0.45, 0.8] },
    hard:   { speedMul: 1.0,  reaction: 0.06, aimErr: 5,  shootRange: 420, aggression: 0.9,  charge: [0.65, 1.0] },
  };
})(window.H = window.H || {});
