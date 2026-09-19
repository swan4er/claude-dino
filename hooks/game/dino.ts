// Динозаврик: чистая логика игры. Ничего не знает ни о Claude Code, ни о терминале — её рисует
// ../dino.tsx, а проверяют tests/*.spec.ts.
//
// Единицы: по горизонтали — колонки терминала, по вертикали — строки над землёй (0 = на земле).
// Один тик = шаг логики в TICK_MS миллисекунд игрового времени. Кадры терминала приходят реже и
// неровно (~16 в секунду), поэтому реальное время в тики переводит advance(): отсчёт длится 3 с
// по часам, а не «60 кадров». Пауза и отсчёт — часть автомата, а не отрисовки: их проверяют тесты.

export const TICK_MS = 50
export const TICKS_PER_SECOND = 1000 / TICK_MS
export const COUNTDOWN_SECONDS = 3
export const COUNTDOWN_TICKS = COUNTDOWN_SECONDS * TICKS_PER_SECOND

// колонка левого края спрайта динозавра и его хитбокс (уже спрайта: столкновения «прощающие»)
export const DINO_X = 4
export const DINO_HIT_LEFT = 1
export const DINO_HIT_WIDTH = 4
export const DINO_HEIGHT = 3
export const DUCK_HEIGHT = 2

// подобрано так, чтобы прыжок длился ~0,7 с и поднимал на ~4,5 строки; проходимость при этих
// числах доказывает тест с ботом (tests/dino.spec.ts)
export const JUMP_VELOCITY = 1.4
export const GRAVITY = 0.19
// ↓ в воздухе — быстрое падение
const FAST_FALL = 0.35
// терминал не сообщает, что клавишу отпустили: нажатие ↓ пригибает на это время, автоповтор
// удерживаемой клавиши продлевает. 0,6 с перекрывают задержку перед автоповтором (~0,5 с)
export const DUCK_TICKS = 12

export const START_SPEED = 1.5 // колонок за тик
export const MAX_SPEED = 3
const SPEED_PER_COLUMN = 1 / 2500
// очко за каждые столько колонок пути
const COLUMNS_PER_POINT = 4
// вертикальный допуск столкновения, строк
const TOLERANCE = 0.5

const BIRDS_FROM_SCORE = 150
const GROUPS_FROM_SPEED = 2

export type Mode = 'ready' | 'running' | 'paused' | 'countdown' | 'over'
export type ObstacleKind = 'cactus-small' | 'cactus-large' | 'cactus-group' | 'bird-low' | 'bird-mid'
// alt — высота нижнего края над землёй
export type Obstacle = { kind: ObstacleKind; x: number; w: number; h: number; alt: number }

export type Game = {
  w: number
  mode: Mode
  // тиков до конца отсчёта; имеет смысл только в режиме countdown
  countdown: number
  y: number
  vy: number
  duckTicks: number
  obstacles: Obstacle[]
  distance: number
  // колонок пути до появления следующего препятствия
  spawnIn: number
  // тиков в режиме running: по нему анимируются ноги и крылья
  ticks: number
}

const SHAPES: Record<ObstacleKind, { w: number; h: number; alt: number }> = {
  'cactus-small': { w: 3, h: 2, alt: 0 },
  'cactus-large': { w: 3, h: 3, alt: 0 },
  'cactus-group': { w: 7, h: 2, alt: 0 },
  // низкую птицу перепрыгивают, под средней пригибаются
  'bird-low': { w: 5, h: 2, alt: 1 },
  'bird-mid': { w: 5, h: 2, alt: 2 },
}

export function newGame(w: number): Game {
  return { w, mode: 'ready', countdown: 0, y: 0, vy: 0, duckTicks: 0, obstacles: [], distance: 0, spawnIn: w * 0.6, ticks: 0 }
}

export const score = (g: Game) => Math.floor(g.distance / COLUMNS_PER_POINT)
export const speed = (g: Game) => Math.min(MAX_SPEED, START_SPEED + g.distance * SPEED_PER_COLUMN)
export const isDucking = (g: Game) => g.duckTicks > 0 && g.y === 0
// 3, 2, 1 — что показывать во время отсчёта; 0 вне его
export const countdownLeft = (g: Game) => (g.mode === 'countdown' ? Math.ceil(g.countdown / TICKS_PER_SECOND) : 0)

// длительность прыжка в тиках: сколько тиков динозавр не на земле
export function airTicks(): number {
  let y = 0
  let vy = JUMP_VELOCITY
  let n = 0
  do {
    vy -= GRAVITY
    y += vy
    n++
  } while (y > 0)
  return n
}

export const jump = (g: Game): Game => (g.mode === 'running' && g.y === 0 ? { ...g, vy: JUMP_VELOCITY, duckTicks: 0 } : g)
export const duck = (g: Game): Game => (g.mode === 'running' ? { ...g, duckTicks: DUCK_TICKS } : g)

const startCountdown = (g: Game): Game => ({ ...g, mode: 'countdown', countdown: COUNTDOWN_TICKS })

// Claude закончил ход или игрок нажал паузу; отсчёт тоже сбрасывается в паузу
export const pause = (g: Game): Game => (g.mode === 'running' || g.mode === 'countdown' ? { ...g, mode: 'paused', countdown: 0 } : g)

// клавиша p: игра → пауза → отсчёт → игра; p во время отсчёта возвращает в паузу
export function togglePause(g: Game): Game {
  if (g.mode === 'paused') return startCountdown(g)
  return pause(g)
}

export const restart = (g: Game): Game => jump({ ...newGame(g.w), mode: 'running' })

// пробел, ↑ или клик: старт, прыжок, снятие с паузы (через отсчёт) или новая игра после столкновения
export function press(g: Game): Game {
  if (g.mode === 'ready' || g.mode === 'over') return restart(g)
  if (g.mode === 'paused') return startCountdown(g)
  // во время отсчёта нажатия ничего не делают: прыжок «в запас» не копится
  return jump(g)
}

function spawn(g: Game, rand: () => number): Obstacle {
  const kinds: ObstacleKind[] = ['cactus-small', 'cactus-large']
  if (speed(g) >= GROUPS_FROM_SPEED) kinds.push('cactus-group')
  if (score(g) >= BIRDS_FROM_SCORE) kinds.push('bird-low', 'bird-mid')
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rand() * kinds.length))]
  return { kind, x: g.w, ...SHAPES[kind] }
}

// между препятствиями не меньше пути, который динозавр пролетает за прыжок, с запасом на
// приземление и реакцию; сверху — случайная добавка
function gapAfter(g: Game, rand: () => number): number {
  const jumpPath = speed(g) * airTicks()
  return jumpPath * 1.5 + rand() * jumpPath * 1.5
}

export function hits(g: Game, o: Obstacle): boolean {
  const left = DINO_X + DINO_HIT_LEFT
  if (o.x >= left + DINO_HIT_WIDTH || o.x + o.w <= left) return false
  const top = g.y + (isDucking(g) ? DUCK_HEIGHT : DINO_HEIGHT)
  return g.y < o.alt + o.h - TOLERANCE && top > o.alt + TOLERANCE
}

export function tick(g: Game, rand: () => number = Math.random): Game {
  if (g.mode === 'countdown') {
    const countdown = g.countdown - 1
    return countdown > 0 ? { ...g, countdown } : { ...g, mode: 'running', countdown: 0 }
  }
  if (g.mode !== 'running') return g

  let vy = g.vy
  let y = g.y
  if (y > 0 || vy > 0) {
    vy -= GRAVITY + (g.duckTicks > 0 ? FAST_FALL : 0)
    y += vy
    if (y <= 0) {
      y = 0
      vy = 0
    }
  }

  const v = speed(g)
  let obstacles = g.obstacles.map(o => ({ ...o, x: o.x - v })).filter(o => o.x + o.w > 0)
  let spawnIn = g.spawnIn - v
  if (spawnIn <= 0) {
    const o = spawn(g, rand)
    obstacles = [...obstacles, o]
    spawnIn = o.w + gapAfter(g, rand)
  }

  const next: Game = { ...g, y, vy, duckTicks: Math.max(0, g.duckTicks - 1), obstacles, spawnIn, distance: g.distance + v, ticks: g.ticks + 1 }
  return obstacles.some(o => hits(next, o)) ? { ...next, mode: 'over' } : next
}

// после простоя (свернули терминал, подвис SSH) игра не «проматывается»: лишнее время отбрасывается
const MAX_STEPS_PER_FRAME = 5

// Переводит реальное время в шаги логики. clock — момент, до которого игра уже просчитана;
// now — текущее время, оба в миллисекундах. Пока игра стоит, clock просто догоняет now.
export function advance(g: Game, clock: number, now: number, rand: () => number = Math.random): { game: Game; clock: number } {
  if (g.mode !== 'running' && g.mode !== 'countdown') return { game: g, clock: now }
  let steps = 0
  while (clock + TICK_MS <= now && steps < MAX_STEPS_PER_FRAME && (g.mode === 'running' || g.mode === 'countdown')) {
    g = tick(g, rand)
    clock += TICK_MS
    steps++
  }
  return { game: g, clock: steps === MAX_STEPS_PER_FRAME || (g.mode !== 'running' && g.mode !== 'countdown') ? now : clock }
}
