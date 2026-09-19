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

// вертикальный допуск столкновения, строк: столкновения «прощающие», как в оригинале
const TOLERANCE = 0.5
// терминал не сообщает, что клавишу отпустили: нажатие ↓ пригибает на это время, автоповтор
// удерживаемой клавиши продлевает. 0,6 с перекрывают задержку перед автоповтором (~0,5 с)
export const DUCK_TICKS = 12
const BIRDS_FROM_SCORE = 150

export type ObstacleKind = 'cactus-small' | 'cactus-large' | 'cactus-group' | 'bird-low' | 'bird-mid'
// размеры в клетках; alt — высота нижнего края над землёй
export type Shape = { w: number; h: number; alt: number }

// Набор размеров: всё, что зависит от величины спрайтов. Логика читает числа только отсюда,
// поэтому новый размер или персонаж — это данные (набор + картинки в sprites.ts), а не правка кода.
// Проходимость каждого набора доказывает тест с ботом (tests/dino.spec.ts).
export type Metrics = {
  name: string
  // строк поля над землёй: рост динозавра + высота прыжка
  fieldRows: number
  // колонка левого края спрайта; хитбокс уже спрайта
  dinoX: number
  dinoW: number
  dinoH: number
  duckW: number
  duckH: number
  hitLeft: number
  hitWidth: number
  // прыжок длится ~0,7 с при любом размере, меняется только высота
  jumpVelocity: number
  gravity: number
  // ↓ в воздухе — быстрое падение
  fastFall: number
  // колонок за тик; крупный мир движется быстрее, иначе над широким кактусом не пролететь
  startSpeed: number
  maxSpeed: number
  speedPerColumn: number
  // очко за каждые столько колонок пути: очки в секунду одинаковы у всех наборов
  columnsPerPoint: number
  groupsFromSpeed: number
  shapes: Record<ObstacleKind, Shape>
}

// динозавр 7×4 клетки, полоса 11 строк
export const COMPACT: Metrics = {
  name: 'compact',
  fieldRows: 9,
  dinoX: 4, dinoW: 7, dinoH: 4, duckW: 9, duckH: 2.5, hitLeft: 1, hitWidth: 5,
  jumpVelocity: 1.4, gravity: 0.19, fastFall: 0.35,
  startSpeed: 1.5, maxSpeed: 3, speedPerColumn: 1 / 2500, columnsPerPoint: 4, groupsFromSpeed: 2,
  shapes: {
    'cactus-small': { w: 3, h: 2, alt: 0 },
    'cactus-large': { w: 4, h: 3, alt: 0 },
    'cactus-group': { w: 8, h: 2, alt: 0 },
    // низкую птицу перепрыгивают, под средней пригибаются
    'bird-low': { w: 6, h: 2, alt: 1 },
    'bird-mid': { w: 6, h: 2, alt: 3 },
  },
}

// динозавр 10×7 клеток, полоса 15 строк
export const LARGE: Metrics = {
  name: 'large',
  fieldRows: 13,
  dinoX: 4, dinoW: 10, dinoH: 7, duckW: 13, duckH: 4, hitLeft: 2, hitWidth: 6,
  jumpVelocity: 1.875, gravity: 0.2545, fastFall: 0.47,
  startSpeed: 2.2, maxSpeed: 4.2, speedPerColumn: 1 / 1800, columnsPerPoint: 5.87, groupsFromSpeed: 2.9,
  shapes: {
    'cactus-small': { w: 4, h: 4, alt: 0 },
    'cactus-large': { w: 5, h: 5, alt: 0 },
    'cactus-group': { w: 9, h: 4, alt: 0 },
    'bird-low': { w: 8, h: 3, alt: 1 },
    'bird-mid': { w: 8, h: 3, alt: 5 },
  },
}

// крупный набор — когда полоса над строкой ввода даёт ему место, иначе компактный
export const METRICS: readonly Metrics[] = [LARGE, COMPACT]
// строк полосы: поле, земля, строка подсказки
export const bandRows = (m: Metrics) => m.fieldRows + 2
// ниже этого игра не открывается: в поле не помещается даже компактный динозавр с половиной прыжка.
// Строка подсказки и верх прыжка — первое, чем игра жертвует в низком окне
export const MIN_BAND_ROWS = 8
export const pickMetrics = (rows: number): Metrics => METRICS.find(m => rows >= bandRows(m)) ?? COMPACT

export type Mode = 'ready' | 'running' | 'paused' | 'countdown' | 'over'
export type Obstacle = Shape & { kind: ObstacleKind; x: number }

export type Game = {
  m: Metrics
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

export function newGame(w: number, m: Metrics = COMPACT): Game {
  return { m, w, mode: 'ready', countdown: 0, y: 0, vy: 0, duckTicks: 0, obstacles: [], distance: 0, spawnIn: w * 0.6, ticks: 0 }
}

export const score = (g: Game) => Math.floor(g.distance / g.m.columnsPerPoint)
export const speed = (g: Game) => Math.min(g.m.maxSpeed, g.m.startSpeed + g.distance * g.m.speedPerColumn)
export const isDucking = (g: Game) => g.duckTicks > 0 && g.y === 0
// 3, 2, 1 — что показывать во время отсчёта; 0 вне его
export const countdownLeft = (g: Game) => (g.mode === 'countdown' ? Math.ceil(g.countdown / TICKS_PER_SECOND) : 0)

// длительность прыжка в тиках: сколько тиков динозавр не на земле
export function airTicks(m: Metrics): number {
  let y = 0
  let vy = m.jumpVelocity
  let n = 0
  do {
    vy -= m.gravity
    y += vy
    n++
  } while (y > 0)
  return n
}

export const jump = (g: Game): Game => (g.mode === 'running' && g.y === 0 ? { ...g, vy: g.m.jumpVelocity, duckTicks: 0 } : g)
export const duck = (g: Game): Game => (g.mode === 'running' ? { ...g, duckTicks: DUCK_TICKS } : g)

const startCountdown = (g: Game): Game => ({ ...g, mode: 'countdown', countdown: COUNTDOWN_TICKS })

// Claude закончил ход или игрок нажал паузу; отсчёт тоже сбрасывается в паузу
export const pause = (g: Game): Game => (g.mode === 'running' || g.mode === 'countdown' ? { ...g, mode: 'paused', countdown: 0 } : g)

// клавиша p: игра → пауза → отсчёт → игра; p во время отсчёта возвращает в паузу
export function togglePause(g: Game): Game {
  if (g.mode === 'paused') return startCountdown(g)
  return pause(g)
}

// размер выбирается на раунд: посреди игры он не меняется, даже если терминал растянули
export const restart = (g: Game, m: Metrics = g.m): Game => jump({ ...newGame(g.w, m), mode: 'running' })

// пробел, ↑ или клик: старт, прыжок, снятие с паузы (через отсчёт) или новая игра после столкновения
export function press(g: Game, m: Metrics = g.m): Game {
  if (g.mode === 'ready' || g.mode === 'over') return restart(g, m)
  if (g.mode === 'paused') return startCountdown(g)
  // во время отсчёта нажатия ничего не делают: прыжок «в запас» не копится
  return jump(g)
}

function spawn(g: Game, rand: () => number): Obstacle {
  const kinds: ObstacleKind[] = ['cactus-small', 'cactus-large']
  if (speed(g) >= g.m.groupsFromSpeed) kinds.push('cactus-group')
  if (score(g) >= BIRDS_FROM_SCORE) kinds.push('bird-low', 'bird-mid')
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rand() * kinds.length))]
  return { kind, x: g.w, ...g.m.shapes[kind] }
}

// между препятствиями не меньше пути, который динозавр пролетает за прыжок, с запасом на
// приземление и реакцию; сверху — случайная добавка
function gapAfter(g: Game, rand: () => number): number {
  const jumpPath = speed(g) * airTicks(g.m)
  return jumpPath * 1.5 + rand() * jumpPath * 1.5
}

export function hits(g: Game, o: Obstacle): boolean {
  const left = g.m.dinoX + g.m.hitLeft
  if (o.x >= left + g.m.hitWidth || o.x + o.w <= left) return false
  const top = g.y + (isDucking(g) ? g.m.duckH : g.m.dinoH)
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
    vy -= g.m.gravity + (g.duckTicks > 0 ? g.m.fastFall : 0)
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
