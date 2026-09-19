/* @jsx h */
import type { ClientSurface } from 'claude-code'
import { TICK_MS, advance, bandRows, countdownLeft, duck, newGame, pause, pickMetrics, press, restart, score, togglePause, type Game } from './game/dino.ts'
import { composeFrame } from './game/sprites.ts'

// Поверхность игры: модуль, который хуки (./register.tsx) монтируют над строкой ввода. Работает
// в потоке отрисовки со своим таймером кадров, клавишами (после клика по полю или ctrl+x tab;
// Esc возвращает фокус строке ввода) и мышью. Вся игра — в ./game, здесь только ввод и вывод.
//
// Нельзя называть локальную переменную `h`: каждый JSX-тег компилируется в вызов `h`.

// mouse — false в обычном (не полноэкранном) режиме Claude Code: там терминал не сообщает о кликах
// rows — высота, которую хуки запросили для области: до первой раскладки surface.rows ещё 0
type Props = { best?: number; done?: number; mouse?: boolean; rows?: number } | undefined
// clock — момент, до которого игра просчитана (мс); seenDone — последний виденный счётчик
// завершённых ходов Claude; banner — плашка «Claude закончил»
type State = { game: Game; clock: number; seenDone: number; banner: boolean }

// справа вверху полосы движок рисует свою кнопку сворачивания `[-]`: счёт встаёт левее неё
const SCORE_RIGHT = 5

// та же клавиша в русской раскладке: з = p, к = r, ц = w, ы = s
const KEYS: Record<string, 'press' | 'duck' | 'pause' | 'restart'> = {
  ' ': 'press', space: 'press', up: 'press', w: 'press', ц: 'press', return: 'press',
  down: 'duck', s: 'duck', ы: 'duck',
  p: 'pause', з: 'pause',
  r: 'restart', к: 'restart',
}

export default function Dino(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  const cols = Math.max(20, surface.columns || 80)
  const rows = Math.max(3, surface.rows || props?.rows || 11)

  const moving = (g: Game) => g.mode === 'running' || g.mode === 'countdown'

  // любое действие игрока снимает плашку; если игра стояла, её часы начинают идти с этого момента
  const act = (fn: (g: Game) => Game) => {
    const s = surface.state
    if (s) surface.setState({ ...s, banner: false, game: fn(s.game), clock: moving(s.game) ? s.clock : Date.now() })
  }
  // размер спрайтов — какой помещается в полосу сейчас; новый раунд берёт его, идущий — не меняет
  const fitting = () => pickMetrics(surface.rows || props?.rows || rows)

  if (surface.state === undefined) {
    surface.setState({ game: newGame(cols, fitting()), clock: Date.now(), seenDone: props?.done ?? 0, banner: false })
    surface.every(TICK_MS, () => {
      const s = surface.state
      // игра стоит: состояние не трогаем, перерисовывать нечего
      if (!s || !moving(s.game)) return
      // таймер кадров приходит реже и неровнее TICK_MS: шагов логики делается столько, сколько
      // реально прошло времени, иначе отсчёт «3 секунды» длился бы почти четыре
      const { game, clock } = advance({ ...s.game, w: Math.max(20, surface.columns || s.game.w) }, s.clock, Date.now())
      // раунд окончен: хуки сравнят счёт с рекордом и вернут его в props
      if (game.mode === 'over') surface.post({ score: score(game) })
      surface.setState({ ...s, game, clock })
    })
    surface.onKey(({ key }) => {
      const action = KEYS[key.toLowerCase()]
      if (action === 'press') act(g => press(g, fitting()))
      else if (action === 'duck') act(duck)
      else if (action === 'pause') act(togglePause)
      else if (action === 'restart') act(g => restart(g, fitting()))
    })
    surface.onPointer(ev => {
      if (ev.type === 'down') act(g => press(g, fitting()))
    })
  }

  // хуки увеличивают props.done, когда Claude заканчивает ход: пауза и плашка, один раз на ход
  const seen = surface.state
  const done = props?.done ?? 0
  if (seen && done !== seen.seenDone) {
    surface.setState({ ...seen, seenDone: done, banner: moving(seen.game), game: pause(seen.game) })
  }

  // до первого нажатия игра подстраивается под полосу: её могли растянуть или сжать
  const waiting = surface.state
  if (waiting && waiting.game.mode === 'ready' && waiting.game.m !== fitting()) surface.setState({ ...waiting, game: newGame(cols, fitting()) })

  const s = surface.state
  const game = s?.game ?? newGame(cols, fitting())
  const best = Math.max(props?.best ?? 0, game.mode === 'over' ? score(game) : 0)
  const hint =
    game.mode === 'ready' && props?.mouse === false ? 'dino · клавиатуру игре даёт клик, а клики Claude Code видит только в полноэкранном режиме: /tui fullscreen, затем /dino'
    : game.mode === 'ready' ? 'dino · кликните по полю, затем пробел, ↑ или клик — прыжок · ↓ пригнуться · p пауза · Esc — к строке ввода'
    : game.mode === 'paused' ? 'пауза · p, пробел или клик — продолжить после отсчёта 3 с · r заново'
    : game.mode === 'countdown' ? `приготовьтесь: ${countdownLeft(game)} · p — обратно на паузу`
    : game.mode === 'over' ? `столкновение · счёт ${score(game)} · пробел или клик — заново`
    : 'пробел, ↑ или клик — прыжок · ↓ пригнуться · p пауза · r заново · Esc — к строке ввода'

  // в низком окне строка подсказки уступает место полю; плашка при этом видна на самом поле
  const showHint = rows >= bandRows(game.m)

  return (
    <Box flexDirection="column" width={cols}>
      {composeFrame(game, cols, showHint ? rows - 1 : rows, { best, scoreRight: SCORE_RIGHT, mouse: props?.mouse, banner: s?.banner }).map(line => (
        <Text color={game.mode === 'over' ? 'red' : undefined} wrap="truncate-end">{line}</Text>
      ))}
      {!showHint ? null
        : s?.banner ? <Text color="yellow" bold wrap="truncate-end">{`● Claude закончил · ${hint}`}</Text>
        : <Text dimColor wrap="truncate-end">{hint}</Text>}
    </Box>
  )
}
