# Hockey 1v1

A top-down 2D physics hockey game: you against a bot. Skating has momentum and
you drive the stick with your mouse, so passes and shots come from actually
swinging the stick.

## Play

There's no build step. Either:

- open `index.html` in a browser, or
- serve the folder (useful if your browser is strict about local files):

  ```bash
  python3 -m http.server 8000
  ```

  then open http://localhost:8000.

Pick a bot difficulty and a game length, then hit **Start game**. Click the rink
to lock the mouse to your stick.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Skate |
| Mouse | Move your stick (relative to your skater while the mouse is locked) |
| `Shift` | Sprint (drains stamina) |
| `Space` | Hockey stop |
| `Esc` / `P` | Pause |
| `M` | Mute |

**Stickhandling and shooting:** touch the puck with your blade to pick it up.
It rides on your blade until you swing. Flick the mouse to shoot: the puck
leaves in the direction of your swing, at the blade's speed plus your skating
speed. A longer, faster swing is a harder shot, and a gentle one is a pass.
Poke the puck with your stick or body-check the carrier to knock it loose.

## Rules

- Timed game (2, 3 or 5 minutes). Most goals wins.
- Tied at the buzzer: sudden-death overtime.
- After each goal there's a faceoff at center ice.

## The bot

The bot drives its skater through the same inputs a player has (move, sprint,
stop, stick target), so it follows the same physics. It:

- chases loose pucks, approaching from the side that faces your net,
- carries the puck toward the slot, deking around you when you're in the way,
- plans its shot so the swing (plus its own skating speed) sends the puck at a
  chosen spot in the net, and holds the shot while you block the lane,
- defends by getting between the puck and its net and poke-checking when close.

Difficulty changes its skating speed, reaction time, aim error, shooting range,
shot power and aggressiveness (`H.DIFFICULTY` in `js/config.js`).

## Code layout

| File | What's in it |
| --- | --- |
| `js/config.js` | All tuning numbers: rink, skater, stick, puck, possession, difficulty |
| `js/physics.js` | Skating, stick blade dynamics, puck possession, collisions, goal detection |
| `js/bot.js` | Bot AI |
| `js/render.js` | Canvas drawing (rink, nets, skaters, sticks, puck, particles) |
| `js/audio.js` | Synthesized sound effects (no audio files) |
| `js/game.js` | Game states, clock and score, input, HUD and menus |
| `tools/sim.js` | Headless bot-vs-bot simulation, for tuning |

Run a headless simulation (needs Node.js):

```bash
node tools/sim.js 5 normal bot
```

Arguments: minutes, bot difficulty, and the opponent (`bot` or `idle`).
