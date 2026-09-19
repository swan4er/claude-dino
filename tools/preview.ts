// Предпросмотр без Claude Code: node tools/preview.ts [cols]
// Печатает лист спрайтов каждого набора и характерные кадры: бег, прыжок, пригибание, птицы,
// пауза, отсчёт, конец игры.
import { METRICS, duck, jump, newGame, press, tick, type Game, type Metrics, type Obstacle } from '../hooks/game/dino.ts'
import { SPRITES, composeFrame, toText } from '../hooks/game/sprites.ts'

const cols = Number(process.argv[2]) || 110
const steps = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g = tick(g, () => 0.5)
  return g
}

// несколько картинок в ряд, выровненных по нижнему краю
function sheet(maps: (readonly string[])[]): string {
  const texts = maps.map(toText)
  const height = Math.max(...texts.map(t => t.length))
  const padded = texts.map(t => [...Array(height - t.length).fill(' '.repeat(t[0].length)), ...t])
  return Array.from({ length: height }, (_, y) => padded.map(t => t[y]).join('   ')).join('\n')
}

for (const m of METRICS) {
  const set = SPRITES[m.name]
  console.log(`\n════════ набор ${m.name}: динозавр ${m.dinoW}×${m.dinoH} клеток, полоса ${m.fieldRows + 2} строк ════════\n`)
  console.log(sheet([set.stand, ...set.run, set.dead, ...set.duck]) + '\n')
  console.log(sheet([set.obstacles['cactus-small'][0], set.obstacles['cactus-large'][0], set.obstacles['cactus-group'][0], ...set.obstacles['bird-low']]) + '\n')

  const show = (title: string, g: Game) => console.log(`── ${title}\n${composeFrame(g, cols, m.fieldRows + 1, { best: 1234, scoreRight: 5 }).join('\n')}\n`)
  const at = (kind: Obstacle['kind'], x: number): Obstacle => ({ kind, x, ...m.shapes[kind] })
  const base: Game = { ...newGame(cols, m), mode: 'running', spawnIn: 1e9, distance: 1500 }
  const scene: Game = { ...base, obstacles: [at('cactus-small', 26), at('cactus-large', 42), at('cactus-group', 58), at('bird-low', 78), at('bird-mid', 94)] }
  show('бег', scene)
  show('прыжок, вершина', { ...steps(jump(base), 7), obstacles: [at('cactus-large', 8)] })
  show('пригнулся под средней птицей', { ...duck(base), obstacles: [at('bird-mid', 8)] })
  show('отсчёт 2', steps(press({ ...scene, mode: 'paused' }), 20))
  show('конец игры', { ...scene, mode: 'over' })
}
