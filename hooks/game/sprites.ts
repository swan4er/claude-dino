// Спрайты и сборка кадра в строки текста. Чистые функции: на входе состояние игры и размер
// области, на выходе ровно rows строк по cols символов.
//
// Спрайты хранятся битовыми картами ('#' — пиксель), а не символами: терминал даёт сплошную
// заливку четвертинками клетки (▘▝▖▗▀▄▌▐…), то есть 2×2 пикселя на символ. Кадр собирается в
// пиксельном буфере и переводится в символы целиком, поэтому прыжок и препятствия двигаются с
// шагом в полклетки. Править картинку = править её карту; у каждого набора размеров
// (Metrics в ./dino.ts) свой набор карт, и тест сверяет их размеры с числами набора.
import { countdownLeft, isDucking, score, type Game, type ObstacleKind } from './dino.ts'

export type Bitmap = readonly string[]
export type SpriteSet = {
  stand: Bitmap
  run: readonly [Bitmap, Bitmap]
  dead: Bitmap
  duck: readonly [Bitmap, Bitmap]
  obstacles: Record<ObstacleKind, readonly Bitmap[]>
}

// общий верх и сменные ноги: кадры бега отличаются только нижними строками
const withLegs = (body: Bitmap, legs: Bitmap): Bitmap => [...body, ...legs]

// Ноги как в оригинале — буквой «Г»: голень и ступня вперёд. В беге они не шагают, а по очереди
// поднимаются: одна стоит целиком, у второй ступня на ряд выше. Голени шириной в клетку стоят на
// чётных пикселях, иначе рисуются двумя половинками.
type Legs = { stand: Bitmap; run: readonly [Bitmap, Bitmap] }
// в компактном наборе голень тонкая, в пиксель: вместе со ступнёй это одна клетка «▙»
const COMPACT_LEGS: Legs = {
  stand: ['....#...#.....', '....##..##....'],
  run: [
    ['....#...##....', '....##........'],
    ['....##..#.....', '........##....'],
  ],
}
const LARGE_LEGS: Legs = {
  stand: ['....##..##..........', '....###.###.........'],
  run: [
    ['....##..###.........', '....###.............'],
    ['....###.##..........', '........###.........'],
  ],
}

const COMPACT_BODY: Bitmap = [
  '.......######.',
  '......##.#####',
  '......########',
  '#.....#####...',
  '##...########.',
  '.##########...',
]
const COMPACT_DEAD_BODY: Bitmap = ['.......######.', '......#..#####', ...COMPACT_BODY.slice(2)]
const COMPACT_DUCK_BODY: Bitmap = [
  '..................',
  '#.........#######.',
  '##.......##.######',
  '.#################',
]
const COMPACT_CACTUS: Bitmap = ['..##..', '#.##.#', '######', '..##..']
const COMPACT_BIRD: readonly Bitmap[] = [
  ['.....##.....', '..#..###....', '.##########.', '####.#####..'],
  ['..#.........', '.##########.', '####.#####..', '.....###....'],
]

const LARGE_BODY: Bitmap = [
  '...........########.',
  '..........##.#######',
  '..........##########',
  '..........##########',
  '..........#####.....',
  '..........########..',
  '#........#####......',
  '##.....#######......',
  '###..############...',
  '###############.#...',
  '.#############......',
  '...####..###........',
]
const LARGE_DEAD_BODY: Bitmap = ['...........########.', '..........#..#######', '..........#..#######', ...LARGE_BODY.slice(3)]
const LARGE_DUCK_BODY: Bitmap = [
  '..........................',
  '...............#########..',
  '#.............##.#########',
  '###...####################',
  '.#####################....',
  '..###############.#####...',
]
// стволы стоят на чётных пикселях: ствол, попавший между клетками, рисуется двумя половинками
const LARGE_CACTUS_SMALL: Bitmap = ['..##....', '..##..#.', '#.##..#.', '#.##..#.', '#.#####.', '####....', '..##....', '..##....']
const LARGE_BIRD: readonly Bitmap[] = [
  ['......#.........', '.....##.........', '..#.###.........', '.##########.....', '####.###########', '.....######.....'],
  ['................', '..#.............', '.##########.....', '####.###########', '.....######.....', '.....##.........'],
]

// несколько кактусов в ряд через просвет в gap пикселей
const row = (gap: number, ...maps: Bitmap[]): Bitmap =>
  maps[0].map((_, y) => maps.map(m => m[y]).join('.'.repeat(gap)))

export const SPRITES: Record<string, SpriteSet> = {
  compact: {
    stand: withLegs(COMPACT_BODY, COMPACT_LEGS.stand),
    run: [
      withLegs(COMPACT_BODY, COMPACT_LEGS.run[0]),
      withLegs(COMPACT_BODY, COMPACT_LEGS.run[1]),
    ],
    dead: withLegs(COMPACT_DEAD_BODY, COMPACT_LEGS.stand),
    duck: [
      withLegs(COMPACT_DUCK_BODY, COMPACT_LEGS.run[0].map(line => line + '....')),
      withLegs(COMPACT_DUCK_BODY, COMPACT_LEGS.run[1].map(line => line + '....')),
    ],
    obstacles: {
      'cactus-small': [COMPACT_CACTUS],
      'cactus-large': [['..##....', '..##..#.', '#.##..#.', '#.#####.', '####....', '..##....']],
      'cactus-group': [row(4, COMPACT_CACTUS, COMPACT_CACTUS)],
      'bird-low': COMPACT_BIRD,
      'bird-mid': COMPACT_BIRD,
    },
  },
  large: {
    stand: withLegs(LARGE_BODY, LARGE_LEGS.stand),
    run: [
      withLegs(LARGE_BODY, LARGE_LEGS.run[0]),
      withLegs(LARGE_BODY, LARGE_LEGS.run[1]),
    ],
    dead: withLegs(LARGE_DEAD_BODY, LARGE_LEGS.stand),
    duck: [
      withLegs(LARGE_DUCK_BODY, LARGE_LEGS.run[0].map(line => line + '......')),
      withLegs(LARGE_DUCK_BODY, LARGE_LEGS.run[1].map(line => line + '......')),
    ],
    obstacles: {
      'cactus-small': [LARGE_CACTUS_SMALL],
      'cactus-large': [[
        '....##....', '....##..#.', '.#..##..#.', '.#..##..#.', '.#..##.##.',
        '.##.####..', '..####....', '....##....', '....##....', '....##....',
      ]],
      'cactus-group': [row(2, LARGE_CACTUS_SMALL, LARGE_CACTUS_SMALL)],
      'bird-low': LARGE_BIRD,
      'bird-mid': LARGE_BIRD,
    },
  },
}

// смена ног раз в 100 мс: в оригинале 12 кадров бега в секунду, терминал рисует ~16
const LEG_TICKS = 2
const WING_TICKS = 6

// пиксели клетки → символ: биты 1, 2, 4, 8 — левый верхний, правый верхний, левый нижний, правый нижний
const QUADRANTS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█']

// отдельная картинка символами: для предпросмотра и тестов
export function toText(map: Bitmap): string[] {
  const at = (x: number, y: number) => (map[y]?.[x] === '#' ? 1 : 0)
  const out: string[] = []
  for (let y = 0; y < map.length; y += 2) {
    let line = ''
    for (let x = 0; x < map[0].length; x += 2) line += QUADRANTS[at(x, y) | (at(x + 1, y) << 1) | (at(x, y + 1) << 2) | (at(x + 1, y + 1) << 3)]
    out.push(line)
  }
  return out
}

export function dinoSprite(g: Game): Bitmap {
  const set = SPRITES[g.m.name]
  if (g.mode === 'over') return set.dead
  const frame = Math.floor(g.ticks / LEG_TICKS) % 2
  if (isDucking(g)) return set.duck[frame]
  if (g.y > 0 || g.mode === 'ready') return set.stand
  return set.run[frame]
}

const DIGITS: Record<number, readonly string[]> = {
  3: ['█████', '    █', ' ████', '    █', '█████'],
  2: ['█████', '    █', '█████', '█    ', '█████'],
  1: ['  ██ ', ' ███ ', '  ██ ', '  ██ ', ' ████'],
}

const GROUND = '──────────────╌╌────────▁▁▁──────────────────╌───────────▁────────'

// scoreRight — сколько колонок оставить справа от счёта: в правом верхнем углу полосы движок
// Claude Code рисует свою кнопку сворачивания `[-]`
// mouse — false, когда терминал не сообщает о кликах: без клика игра не получит клавиатуру
// banner — Claude закончил ход: пауза объясняет, почему она случилась
export type FrameInfo = { best: number; scoreRight?: number; mouse?: boolean; banner?: boolean }

const pad = (n: number) => String(n).padStart(5, '0')

export function composeFrame(g: Game, cols: number, rows: number, info: FrameInfo = { best: 0 }): string[] {
  cols = Math.max(0, Math.floor(cols))
  rows = Math.max(0, Math.floor(rows))
  if (rows === 0) return []
  // строк поля над линией земли
  const field = rows - 1
  const pw = cols * 2
  const ph = field * 2
  const pixels = new Uint8Array(pw * ph)

  // x — колонка левого края, alt — высота нижнего края над землёй; обе с точностью до полклетки
  const blit = (map: Bitmap, x: number, alt: number) => {
    const left = Math.round(x * 2)
    const top = ph - Math.round(alt * 2) - map.length
    map.forEach((line, dy) => {
      const y = top + dy
      if (y < 0 || y >= ph) return
      for (let dx = 0; dx < line.length; dx++) {
        const px = left + dx
        if (line[dx] === '#' && px >= 0 && px < pw) pixels[y * pw + px] = 1
      }
    })
  }

  const set = SPRITES[g.m.name]
  for (const o of g.obstacles) {
    const frames = set.obstacles[o.kind]
    blit(frames[Math.floor(g.ticks / WING_TICKS) % frames.length], o.x, o.alt)
  }
  blit(dinoSprite(g), g.m.dinoX, g.y)

  const grid: string[][] = []
  for (let y = 0; y < field; y++) {
    const line: string[] = []
    for (let x = 0; x < cols; x++) {
      const i = y * 2 * pw + x * 2
      line.push(QUADRANTS[pixels[i] | (pixels[i + 1] << 1) | (pixels[i + pw] << 2) | (pixels[i + pw + 1] << 3)])
    }
    grid.push(line)
  }
  // земля бежит вместе с дистанцией
  const shift = Math.floor(g.distance) % GROUND.length
  grid.push(Array.from({ length: cols }, (_, x) => GROUND[(x + shift) % GROUND.length]))

  const write = (text: string, x: number, y: number) =>
    [...text].forEach((ch, dx) => {
      if (ch !== ' ' && y >= 0 && y < rows && x + dx >= 0 && x + dx < cols) grid[y][x + dx] = ch
    })
  const centre = (text: string, y: number) => write(text, Math.floor((cols - [...text].length) / 2), y)

  if (field >= 1) {
    const text = info.best > 0 ? `HI ${pad(info.best)}  ${pad(score(g))}` : pad(score(g))
    write(text, cols - text.length - (info.scoreRight ?? 1), 0)
  }

  const middle = Math.max(0, Math.floor((field - 1) / 2))
  if (g.mode === 'ready') centre(info.mouse === false ? 'НУЖНА МЫШЬ: ВЫПОЛНИТЕ /tui fullscreen' : 'КЛИК ПО ПОЛЮ — СТАРТ', middle)
  if (g.mode === 'paused') centre(info.banner ? '● CLAUDE ЗАКОНЧИЛ · П А У З А' : 'П А У З А', middle)
  if (g.mode === 'over') centre('G A M E   O V E R', middle)
  if (g.mode === 'countdown') {
    const digit = DIGITS[countdownLeft(g)]
    if (digit && field >= digit.length) {
      const top = Math.floor((field - digit.length) / 2)
      // цифра рисуется поверх всего, включая пробелы внутри неё: иначе кактус «просвечивает»
      digit.forEach((line, i) => {
        const x0 = Math.floor((cols - line.length) / 2)
        ;[...` ${line} `].forEach((ch, dx) => {
          const x = x0 - 1 + dx
          if (x >= 0 && x < cols) grid[top + i][x] = ch
        })
      })
    } else centre(String(countdownLeft(g)), middle)
  }

  return grid.map(line => line.join(''))
}
