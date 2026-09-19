// Тесты чистой логики. Запуск: node --test "tests/**/*.spec.ts" (node 24 исполняет .ts сам).
// Расширение .spec.ts, а не .test.ts: *.test.ts подбирает `claude plugin test`.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  COMPACT, COUNTDOWN_TICKS, DUCK_TICKS, LARGE, METRICS, TICKS_PER_SECOND,
  advance, airTicks, bandRows, pickMetrics, countdownLeft, duck, hits, isDucking, jump, newGame, pause, press, restart, score, speed, tick, togglePause,
  type Game, type Metrics, type Obstacle,
} from '../hooks/game/dino.ts'

// детерминированный генератор (mulberry32)
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const never = () => 0
// бегущая игра без препятствий на горизонте
const running = (w = 100, m: Metrics = COMPACT): Game => ({ ...newGame(w, m), mode: 'running', spawnIn: 1e9 })
const ticks = (g: Game, n: number, rand = never) => {
  for (let i = 0; i < n; i++) g = tick(g, rand)
  return g
}
const obstacle = (m: Metrics, kind: Obstacle['kind'], x: number): Obstacle => ({ kind, x, ...m.shapes[kind] })
const cactus = (x: number, m: Metrics = COMPACT): Obstacle => obstacle(m, 'cactus-small', x)

describe('выбор набора по высоте полосы', () => {
  test('крупный — когда хватает строк, иначе компактный', () => {
    assert.equal(bandRows(COMPACT), 11)
    assert.equal(bandRows(LARGE), 15)
    assert.equal(pickMetrics(40), LARGE)
    assert.equal(pickMetrics(15), LARGE)
    assert.equal(pickMetrics(14), COMPACT)
    assert.equal(pickMetrics(11), COMPACT)
    assert.equal(pickMetrics(5), COMPACT)
  })
})

for (const m of METRICS) {
  describe(`прыжок · ${m.name}`, () => {
    test('поднимает, возвращает на землю, длится airTicks и помещается в поле', () => {
      let g = jump(running(100, m))
      let peak = 0
      let n = 0
      do {
        g = tick(g)
        peak = Math.max(peak, g.y)
        n++
      } while (g.y > 0)
      assert.equal(n, airTicks(m))
      assert.ok(n / TICKS_PER_SECOND > 0.55 && n / TICKS_PER_SECOND < 0.8, `прыжок ${n} тиков`)
      assert.equal(g.vy, 0)
      // выше самого высокого кактуса с запасом в строку, но не выше поля
      const tallest = Math.max(m.shapes['cactus-small'].h, m.shapes['cactus-large'].h, m.shapes['cactus-group'].h)
      assert.ok(peak >= tallest + 0.99, `пик ${peak} против кактуса ${tallest}`)
      assert.ok(m.dinoH + peak <= m.fieldRows + 0.05, `макушка на ${m.dinoH + peak} при поле ${m.fieldRows}`)
      for (const shape of Object.values(m.shapes)) assert.ok(shape.alt + shape.h <= m.fieldRows)
    })

    test('в воздухе второй прыжок не срабатывает', () => {
      const g = tick(jump(running(100, m)))
      assert.equal(jump(g), g)
    })

    test('↓ в воздухе ускоряет падение', () => {
      const plain = ticks(jump(running(100, m)), 8)
      const fast = ticks(duck(ticks(jump(running(100, m)), 4)), 4)
      assert.ok(fast.y < plain.y)
    })
  })
}

describe('пригибание', () => {
  test('держится DUCK_TICKS и продлевается повторным нажатием', () => {
    let g = duck(running())
    assert.ok(isDucking(g))
    g = ticks(g, DUCK_TICKS - 1)
    assert.ok(isDucking(g))
    g = ticks(duck(g), DUCK_TICKS - 1)
    assert.ok(isDucking(g))
    assert.ok(!isDucking(tick(g)))
  })

  test('из пригибания можно прыгнуть', () => {
    const g = tick(jump(duck(running())))
    assert.ok(g.y > 0)
  })
})

for (const m of METRICS) {
  describe(`столкновения · ${m.name}`, () => {
    const at = m.dinoX + m.hitLeft
    const small = m.shapes['cactus-small']

    test('кактус в хитбоксе — столкновение, рядом — нет', () => {
      const g = running(100, m)
      assert.ok(hits(g, cactus(at, m)))
      assert.ok(!hits(g, cactus(at + m.hitWidth, m)))
      assert.ok(!hits(g, cactus(at - small.w, m)))
    })

    test('прыжок выше кактуса с допуском в полстроки проходит', () => {
      assert.ok(hits({ ...running(100, m), y: small.h - 0.6 }, cactus(at, m)))
      assert.ok(!hits({ ...running(100, m), y: small.h - 0.5 }, cactus(at, m)))
    })

    test('под средней птицей проходит только пригнувшийся, низкую надо перепрыгнуть', () => {
      const mid = obstacle(m, 'bird-mid', at)
      const low = obstacle(m, 'bird-low', at)
      assert.ok(hits(running(100, m), mid))
      assert.ok(!hits(duck(running(100, m)), mid))
      assert.ok(hits(duck(running(100, m)), low))
      assert.ok(!hits({ ...running(100, m), y: low.alt + low.h - 0.4 }, low))
    })

    test('столкновение в тике заканчивает игру, дальше мир стоит', () => {
      const g = tick({ ...running(100, m), obstacles: [cactus(at + 1, m)] })
      assert.equal(g.mode, 'over')
      assert.equal(tick(g), g)
    })
  })

  describe(`скорость, счёт и препятствия · ${m.name}`, () => {
    test('скорость растёт с дистанцией до потолка', () => {
      assert.equal(speed(running(100, m)), m.startSpeed)
      assert.ok(speed({ ...running(100, m), distance: 1000 }) > m.startSpeed)
      assert.equal(speed({ ...running(100, m), distance: 1e7 }), m.maxSpeed)
    })

    test('очки в секунду на старте одинаковы у всех наборов', () => {
      const perSecond = (x: Metrics) => (x.startSpeed * TICKS_PER_SECOND) / x.columnsPerPoint
      assert.ok(Math.abs(perSecond(m) - perSecond(COMPACT)) < 0.05, `${perSecond(m)}`)
    })

    test('птицы не появляются до 150 очков, группы — до своей скорости', () => {
      const rand = seeded(7)
      let g: Game = { ...running(100, m), spawnIn: 0 }
      const kinds = new Set<string>()
      for (let i = 0; i < 2000 && score(g) < 150 && speed(g) < m.groupsFromSpeed; i++) {
        g = tick({ ...g, mode: 'running', y: 50 }, rand)
        g.obstacles.forEach(o => kinds.add(o.kind))
      }
      assert.deepEqual([...kinds].sort(), ['cactus-large', 'cactus-small'])
    })

    test('между препятствиями не меньше полутора путей прыжка', () => {
      const rand = seeded(11)
      let g: Game = { ...running(400, m), spawnIn: 0, distance: 3000 }
      for (let i = 0; i < 400; i++) g = tick({ ...g, mode: 'running', y: 50 }, rand)
      const xs = [...g.obstacles].sort((a, b) => a.x - b.x)
      assert.ok(xs.length >= 2)
      for (let i = 1; i < xs.length; i++) {
        const gap = xs[i].x - (xs[i - 1].x + xs[i - 1].w)
        assert.ok(gap >= m.startSpeed * airTicks(m) * 1.5 - 1e-9, `зазор ${gap}`)
      }
    })
  })
}

describe('режимы', () => {
  test('ready: первое нажатие запускает игру с прыжка, без отсчёта', () => {
    const g = press(newGame(100))
    assert.equal(g.mode, 'running')
    assert.ok(g.vy > 0)
  })

  test('over: нажатие сразу начинает новую игру', () => {
    const g = press({ ...running(), mode: 'over', distance: 999 })
    assert.equal(g.mode, 'running')
    assert.equal(g.distance, 0)
    assert.equal(restart(g).mode, 'running')
    // размер нового раунда можно сменить, посреди раунда он остаётся прежним
    assert.equal(press({ ...running(), mode: 'over' }, LARGE).m, LARGE)
    assert.equal(press(running(), LARGE).m, COMPACT)
  })

  test('в ready, paused и over мир стоит', () => {
    for (const mode of ['ready', 'paused', 'over'] as const) {
      const g: Game = { ...running(), mode, obstacles: [cactus(50)] }
      assert.equal(tick(g), g)
    }
  })
})

describe('пауза и обратный отсчёт', () => {
  const paused = (): Game => pause({ ...jump(running()), obstacles: [cactus(60)], distance: 500 })

  test('p ставит на паузу, p ещё раз запускает отсчёт, а не игру', () => {
    const p = togglePause(running())
    assert.equal(p.mode, 'paused')
    const c = togglePause(p)
    assert.equal(c.mode, 'countdown')
    assert.equal(c.countdown, COUNTDOWN_TICKS)
  })

  test('пробел или клик на паузе тоже запускает отсчёт', () => {
    assert.equal(press(paused()).mode, 'countdown')
  })

  test('отсчёт длится ровно 3 секунды и показывает 3 → 2 → 1', () => {
    let g = press(paused())
    const shown: number[] = []
    let n = 0
    while (g.mode === 'countdown') {
      shown.push(countdownLeft(g))
      g = tick(g)
      n++
    }
    assert.equal(n, COUNTDOWN_TICKS)
    assert.equal(n * (1000 / TICKS_PER_SECOND), 3000)
    assert.deepEqual([...new Set(shown)], [3, 2, 1])
    for (const d of [3, 2, 1]) assert.equal(shown.filter(x => x === d).length, TICKS_PER_SECOND)
    assert.equal(g.mode, 'running')
    assert.equal(countdownLeft(g), 0)
  })

  test('во время отсчёта мир заморожен', () => {
    const before = press(paused())
    const after = ticks(before, COUNTDOWN_TICKS - 1)
    assert.equal(after.mode, 'countdown')
    assert.deepEqual(
      { y: after.y, vy: after.vy, obstacles: after.obstacles, distance: after.distance, ticks: after.ticks },
      { y: before.y, vy: before.vy, obstacles: before.obstacles, distance: before.distance, ticks: before.ticks },
    )
  })

  test('после отсчёта игра продолжается с того же места', () => {
    const before = paused()
    const resumed = ticks(press(before), COUNTDOWN_TICKS)
    assert.equal(resumed.mode, 'running')
    assert.equal(resumed.y, before.y)
    assert.equal(resumed.distance, before.distance)
    assert.ok(tick(resumed).distance > before.distance)
  })

  test('нажатия во время отсчёта не прыгают и не сбивают отсчёт', () => {
    const c = ticks(press({ ...paused(), y: 0, vy: 0 }), 10)
    assert.equal(press(c), c)
    assert.equal(duck(c), c)
  })

  test('p во время отсчёта возвращает в паузу, следующий отсчёт снова полный', () => {
    const c = ticks(press(paused()), 25)
    const p = togglePause(c)
    assert.equal(p.mode, 'paused')
    assert.equal(togglePause(p).countdown, COUNTDOWN_TICKS)
  })

  test('Claude закончил ход во время отсчёта — снова пауза; в ready и over пауза ничего не меняет', () => {
    assert.equal(pause(press(paused())).mode, 'paused')
    const ready = newGame(100)
    assert.equal(pause(ready), ready)
    const over: Game = { ...running(), mode: 'over' }
    assert.equal(pause(over), over)
  })
})

describe('реальное время (advance)', () => {
  // кадры приходят раз в frameMs; возвращает, через сколько мс по часам кончился отсчёт
  function countdownWallMs(frameMs: number): number {
    let game = press(pause(running()))
    let clock = 1000
    let now = 1000
    while (game.mode === 'countdown') {
      now += frameMs
      ;({ game, clock } = advance(game, clock, now))
    }
    return now - 1000
  }

  test('отсчёт длится 3 с по часам при любой частоте кадров', () => {
    for (const frameMs of [16, 50, 64, 100, 130]) {
      const ms = countdownWallMs(frameMs)
      assert.ok(ms >= 3000 && ms < 3000 + frameMs, `кадр ${frameMs} мс: отсчёт ${ms} мс`)
    }
  })

  test('скорость игры не зависит от частоты кадров', () => {
    const distanceAfter2s = (frameMs: number) => {
      let game = running()
      let clock = 0
      for (let now = frameMs; now <= 2000; now += frameMs) ({ game, clock } = advance(game, clock, now, never))
      return game.distance
    }
    const at50 = distanceAfter2s(50)
    for (const frameMs of [20, 64, 100]) assert.ok(Math.abs(distanceAfter2s(frameMs) - at50) <= at50 * 0.05, `кадр ${frameMs} мс`)
  })

  test('на паузе время не копится: после неё отсчёт снова полный', () => {
    const paused = pause(running())
    const idle = advance(paused, 0, 60_000)
    assert.equal(idle.game, paused)
    assert.equal(idle.clock, 60_000)
    const resumed = advance(press(paused), idle.clock, 60_064)
    assert.equal(resumed.game.mode, 'countdown')
    assert.equal(resumed.game.countdown, COUNTDOWN_TICKS - 1)
  })

  test('после долгого простоя игра не проматывается', () => {
    const { game, clock } = advance(running(), 0, 10_000, never)
    assert.equal(game.ticks, 5)
    assert.equal(clock, 10_000)
  })
})

// Бот играет по простому правилу. Если он доживает до потолка скорости на разных зёрнах и
// ширинах — физика, размеры препятствий и зазоры набора проходимы.
for (const m of METRICS) {
  describe(`проходимость · ${m.name}`, () => {
    function bot(g: Game): Game {
      const left = m.dinoX + m.hitLeft
      const o = g.obstacles.filter(o => o.x + o.w > left).sort((a, b) => a.x - b.x)[0]
      if (!o) return g
      const v = speed(g)
      if (o.kind === 'bird-mid') return o.x - (left + m.hitWidth) < v * 4 ? duck(g) : g
      // прыжок так, чтобы вершина пришлась на середину препятствия
      const ticksToCentre = (o.x + o.w / 2 - (left + m.hitWidth / 2)) / v
      return ticksToCentre <= airTicks(m) / 2 ? jump(g) : g
    }

    for (const w of [60, 120, 200]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        test(`ширина ${w}, зерно ${seed}: бот набирает 3000 очков`, () => {
          const rand = seeded(seed)
          let g = press(newGame(w, m))
          for (let i = 0; i < 60000 && g.mode === 'running' && score(g) < 3000; i++) g = tick(bot(g), rand)
          assert.equal(g.mode, 'running', `погиб на ${score(g)} очках, скорость ${speed(g).toFixed(2)}, у ${JSON.stringify(g.obstacles[0])}`)
          assert.equal(speed(g), m.maxSpeed)
        })
      }
    }
  })
}
