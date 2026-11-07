# Hockey 1v1

A top-down 2D physics hockey game: you against a bot, with an AI goalie in
each net. Skating has momentum, your stick follows your mouse, and you hold
the mouse button to charge up shots.

## Play

There's no build step. Either:

- open `index.html` in a browser, or
- serve the folder (useful if your browser is strict about local files):

  ```bash
  python3 -m http.server 8000
  ```

  then open http://localhost:8000.

Pick a bot difficulty and a game length, then hit **Start game**.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Skate |
| Mouse | Aim your stick (it points at the cursor) |
| Hold left click (with the puck) | Charge a shot. Release to shoot where you're aiming |
| Right click / `E` (or left click without the puck) | Swing your stick |
| `Shift` | Sprint (drains stamina) |
| `Space` | Hockey stop |
| `Esc` / `P` | Pause |
| `M` | Mute |

**Possession:** skate onto a loose puck with your stick and it sticks to your
blade. Nothing knocks it loose (bumping into you, body checks) except an
opponent's **swing that hits the puck itself**. Swings have a short cooldown,
shown as a ring around the skater.

**Shooting:** hold left click to fill the power bar above your head, aim with
the mouse, and let go. A quick tap is a soft pass; a full bar is a rocket.
You skate a little slower while winding up. Very hard shots are too fast to
pick up, so they bounce off sticks.

**Goalies:** each net has an AI goalie that cuts down the angle and slides
across for incoming shots. It reacts with a short delay, so hard shots into the
corners are how you score. Pucks that sit on the goalie get cleared to the side.

## Rules

- Timed game (2, 3 or 5 minutes). Most goals wins.
- Tied at the buzzer: sudden-death overtime.
- After each goal there's a faceoff at center ice.

## The bot

The bot drives its skater through the same inputs a player has (move, sprint,
stop, stick target), so it follows the same physics. It:

- chases loose pucks and meets them with its stick,
- carries the puck toward the slot, keeping it on the side away from you and
  deking around you when you're in its shooting lane,
- charges its shot and aims for the side of the net your goalie isn't covering,
- defends by getting between the puck and its net, then closing in and swinging
  at the puck to steal it.

Difficulty changes its skating speed, reaction time, aim error, shooting range,
how long it charges shots and how aggressively it swings (`H.DIFFICULTY` in
`js/config.js`).

## Code layout

| File | What's in it |
| --- | --- |
| `js/config.js` | All tuning numbers: rink, skater, stick, shot charge, puck, goalie, difficulty |
| `js/physics.js` | Skating, stick and swing, possession and shooting, goalies, collisions, goal detection |
| `js/bot.js` | Bot AI |
| `js/render.js` | Canvas drawing (rink, nets, goalies, skaters, sticks, charge bar, puck) |
| `js/audio.js` | Synthesized sound effects (no audio files) |
| `js/game.js` | Game states, clock and score, input, HUD and menus |
| `tools/sim.js` | Headless bot-vs-bot simulation, for tuning |

Run a headless simulation (needs Node.js):

```bash
node tools/sim.js 5 normal bot
```

Arguments: minutes, bot difficulty, and the opponent (`bot` or `idle`).
