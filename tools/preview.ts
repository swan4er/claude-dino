// Предпросмотр кадров без Claude Code: node tools/preview.ts [cols] [rows]
// Печатает характерные кадры — бег, прыжок, пригибание, птицы, пауза, отсчёт, конец игры.
import { duck, jump, newGame, press, tick, type Game } from '../hooks/game/dino.ts'
import { composeFrame } from '../hooks/game/sprites.ts'

const cols = Number(process.argv[2]) || 100
const rows = Number(process.argv[3]) || 9
const show = (title: string, g: Game) => console.log(`── ${title}\n${composeFrame(g, cols, rows, { best: 1234 }).join('\n')}\n`)
const steps = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g = tick(g, () => 0.5)
  return g
}

const base: Game = { ...newGame(cols), mode: 'running', spawnIn: 1e9, distance: 1500 }
const scene: Game = {
  ...base,
  obstacles: [
    { kind: 'cactus-small', x: 24, w: 3, h: 2, alt: 0 },
    { kind: 'cactus-large', x: 38, w: 3, h: 3, alt: 0 },
    { kind: 'cactus-group', x: 52, w: 7, h: 2, alt: 0 },
    { kind: 'bird-low', x: 68, w: 5, h: 2, alt: 1 },
    { kind: 'bird-mid', x: 82, w: 5, h: 2, alt: 2 },
  ],
}

show('готов к старту', newGame(cols))
show('бег, кадр 1', scene)
show('бег, кадр 2 (ноги и крылья)', { ...scene, ticks: 9 })
show('прыжок, вершина', steps(jump(base), 7))
show('пригнулся', duck(scene))
show('пауза', { ...scene, mode: 'paused' })
const counting = press({ ...scene, mode: 'paused' })
show('отсчёт 3', counting)
show('отсчёт 2', steps(counting, 20))
show('отсчёт 1', steps(counting, 40))
show('конец игры', { ...scene, mode: 'over' })
