// Спрайты и сборка кадра в строки текста. Чистые функции: на входе состояние игры и размер
// области, на выходе ровно rows строк по cols символов. Пробел в спрайте прозрачен.
import { DINO_X, countdownLeft, isDucking, score, type Game, type Obstacle, type ObstacleKind } from './dino.ts'

type Sprite = readonly string[]

// верхняя строка первой; ноги меняются раз в LEG_TICKS тиков
const RUN: readonly Sprite[] = [
  ['  ▗▛█▙', '▙▄███▘', ' ▝█ ▙ '],
  ['  ▗▛█▙', '▙▄███▘', ' ▝▙ █ '],
]
const JUMP: Sprite = ['  ▗▛█▙', '▙▄███▘', ' ▝▙ ▙ ']
const DEAD: Sprite = ['  ▗╳█▙', '▙▄███▘', ' ▝█ █ ']
const DUCK: readonly Sprite[] = [
  ['▙▄▄▄▟▛█▙', ' ▝█▀▙▀▀ '],
  ['▙▄▄▄▟▛█▙', ' ▝▙▀█▀▀ '],
]
const OBSTACLES: Record<ObstacleKind, readonly Sprite[]> = {
  'cactus-small': [['▙█▟', ' █ ']],
  'cactus-large': [[' █▗', '▙█▟', ' █ ']],
  'cactus-group': [['▙█▟ ▙█▟', ' █   █ ']],
  'bird-low': [['  ▜▖ ', '▝▀██▀'], ['▝▀██▀', '  ▟▘ ']],
  'bird-mid': [['  ▜▖ ', '▝▀██▀'], ['▝▀██▀', '  ▟▘ ']],
}
const LEG_TICKS = 3
const WING_TICKS = 6

const DIGITS: Record<number, Sprite> = {
  3: ['█████', '    █', ' ████', '    █', '█████'],
  2: ['█████', '    █', '█████', '█    ', '█████'],
  1: ['  ██ ', ' ███ ', '  ██ ', '  ██ ', ' ████'],
}

const GROUND = '──────────────╌╌────────▁▁▁──────────────────╌───────────▁────────'

// scoreRight — сколько колонок оставить справа от счёта: в правом верхнем углу полосы движок
// Claude Code рисует свою кнопку сворачивания `[-]`
// mouse — false, когда терминал не сообщает о кликах: без клика игра не получит клавиатуру
export type FrameInfo = { best: number; scoreRight?: number; mouse?: boolean }

export function dinoSprite(g: Game): Sprite {
  if (g.mode === 'over') return DEAD
  const frame = Math.floor(g.ticks / LEG_TICKS) % 2
  if (isDucking(g)) return DUCK[frame]
  if (g.y > 0) return JUMP
  return g.mode === 'ready' ? RUN[0] : RUN[frame]
}

const obstacleSprite = (g: Game, o: Obstacle): Sprite => {
  const frames = OBSTACLES[o.kind]
  return frames[Math.floor(g.ticks / WING_TICKS) % frames.length]
}

const pad = (n: number) => String(n).padStart(5, '0')

export function composeFrame(g: Game, cols: number, rows: number, info: FrameInfo = { best: 0 }): string[] {
  cols = Math.max(0, Math.floor(cols))
  rows = Math.max(0, Math.floor(rows))
  if (rows === 0) return []
  const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(' '))
  // строк поля над линией земли
  const field = rows - 1

  const put = (x: number, y: number, ch: string) => {
    if (ch !== ' ' && y >= 0 && y < rows && x >= 0 && x < cols) grid[y][x] = ch
  }
  // alt — высота нижней строки спрайта над землёй
  const draw = (sprite: Sprite, x: number, alt: number) => {
    const bottom = field - 1 - Math.round(alt)
    sprite.forEach((line, i) => {
      const y = bottom - (sprite.length - 1 - i)
      // выше поля не рисуем: нулевая строка занята счётом только справа, но спрайт туда не лезет
      if (y >= 0 && y < field) [...line].forEach((ch, dx) => put(Math.round(x) + dx, y, ch))
    })
  }
  const write = (text: string, x: number, y: number) => [...text].forEach((ch, dx) => put(x + dx, y, ch))
  const centre = (text: string, y: number) => write(text, Math.floor((cols - [...text].length) / 2), y)

  // земля бежит вместе с дистанцией
  const shift = Math.floor(g.distance) % GROUND.length
  for (let x = 0; x < cols; x++) grid[rows - 1][x] = GROUND[(x + shift) % GROUND.length]

  for (const o of g.obstacles) draw(obstacleSprite(g, o), o.x, o.alt)
  draw(dinoSprite(g), DINO_X, g.y)

  if (field >= 1) {
    const text = info.best > 0 ? `HI ${pad(info.best)}  ${pad(score(g))}` : pad(score(g))
    write(text, cols - text.length - (info.scoreRight ?? 1), 0)
  }

  const middle = Math.max(0, Math.floor((field - 1) / 2))
  if (g.mode === 'ready') centre(info.mouse === false ? 'НУЖНА МЫШЬ: ВЫПОЛНИТЕ /tui fullscreen' : 'КЛИК ПО ПОЛЮ — СТАРТ', middle)
  if (g.mode === 'paused') centre('П А У З А', middle)
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

  return grid.map(row => row.join(''))
}
