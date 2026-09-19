/* @jsx h */
import type { ClientSurface } from 'claude-code'
import { TICK_MS, advance, countdownLeft, duck, newGame, pause, press, restart, score, togglePause, type Game } from './game/dino.ts'
import { composeFrame } from './game/sprites.ts'

// Поверхность игры: модуль, который хуки (./register.tsx) монтируют над строкой ввода. Работает
// в потоке отрисовки со своим таймером кадров, клавишами (после клика по полю или ctrl+x tab;
// Esc возвращает фокус строке ввода) и мышью. Вся игра — в ./game, здесь только ввод и вывод.
//
// Нельзя называть локальную переменную `h`: каждый JSX-тег компилируется в вызов `h`.

// mouse — false в обычном (не полноэкранном) режиме Claude Code: там терминал не сообщает о кликах
type Props = { best?: number; done?: number; mouse?: boolean } | undefined
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
  const rows = Math.max(3, surface.rows || 10)

  const moving = (g: Game) => g.mode === 'running' || g.mode === 'countdown'

  // любое действие игрока снимает плашку; если игра стояла, её часы начинают идти с этого момента
  const act = (fn: (g: Game) => Game) => {
    const s = surface.state
    if (s) surface.setState({ ...s, banner: false, game: fn(s.game), clock: moving(s.game) ? s.clock : Date.now() })
  }

  if (surface.state === undefined) {
    surface.setState({ game: newGame(cols), clock: Date.now(), seenDone: props?.done ?? 0, banner: false })
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
      if (action === 'press') act(press)
      else if (action === 'duck') act(duck)
      else if (action === 'pause') act(togglePause)
      else if (action === 'restart') act(restart)
    })
    surface.onPointer(ev => {
      if (ev.type === 'down') act(press)
    })
  }

  // хуки увеличивают props.done, когда Claude заканчивает ход: пауза и плашка, один раз на ход
  const seen = surface.state
  const done = props?.done ?? 0
  if (seen && done !== seen.seenDone) {
    surface.setState({ ...seen, seenDone: done, banner: moving(seen.game), game: pause(seen.game) })
  }

  const s = surface.state
  const game = s?.game ?? newGame(cols)
  const best = Math.max(props?.best ?? 0, game.mode === 'over' ? score(game) : 0)
  const hint =
    game.mode === 'ready' && props?.mouse === false ? 'dino · клавиатуру игре даёт клик, а клики Claude Code видит только в полноэкранном режиме: /tui fullscreen, затем /dino'
    : game.mode === 'ready' ? 'dino · кликните по полю, затем пробел, ↑ или клик — прыжок · ↓ пригнуться · p пауза · Esc — к строке ввода'
    : game.mode === 'paused' ? 'пауза · p, пробел или клик — продолжить после отсчёта 3 с · r заново'
    : game.mode === 'countdown' ? `приготовьтесь: ${countdownLeft(game)} · p — обратно на паузу`
    : game.mode === 'over' ? `столкновение · счёт ${score(game)} · пробел или клик — заново`
    : 'пробел, ↑ или клик — прыжок · ↓ пригнуться · p пауза · r заново · Esc — к строке ввода'

  return (
    <Box flexDirection="column" width={cols}>
      {composeFrame(game, cols, rows - 1, { best, scoreRight: SCORE_RIGHT, mouse: props?.mouse }).map(line => (
        <Text color={game.mode === 'over' ? 'red' : undefined} wrap="truncate-end">{line}</Text>
      ))}
      {s?.banner
        ? <Text color="yellow" bold wrap="truncate-end">{`● Claude закончил · ${hint}`}</Text>
        : <Text dimColor wrap="truncate-end">{hint}</Text>}
    </Box>
  )
}
