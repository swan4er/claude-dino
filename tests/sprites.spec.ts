import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { COUNTDOWN_TICKS, TICKS_PER_SECOND, duck, jump, newGame, press, tick, type Game } from '../hooks/game/dino.ts'
import { composeFrame, dinoSprite } from '../hooks/game/sprites.ts'

const running = (w = 80): Game => ({ ...newGame(w), mode: 'running', spawnIn: 1e9 })
const width = (line: string) => [...line].length

describe('composeFrame', () => {
  test('всегда ровно rows строк по cols символов', () => {
    const g: Game = { ...running(), obstacles: [{ kind: 'cactus-group', x: 76, w: 7, h: 2, alt: 0 }, { kind: 'bird-mid', x: -2, w: 5, h: 2, alt: 2 }] }
    for (const [cols, rows] of [[80, 9], [120, 10], [20, 5], [7, 2], [3, 1], [0, 4], [50, 0]]) {
      const frame = composeFrame(g, cols, rows, { best: 123 })
      assert.equal(frame.length, rows)
      for (const line of frame) assert.equal(width(line), cols)
    }
  })

  test('нижняя строка — земля, над ней стоит динозавр', () => {
    const frame = composeFrame(running(), 80, 9)
    assert.match(frame[8], /^[─╌▁]+$/)
    assert.ok(frame[7].includes('▝█'))
    assert.ok(frame[5].includes('▗▛█▙'))
  })

  test('в прыжке динозавр выше, на земле под ним пусто', () => {
    let g = jump(running())
    for (let i = 0; i < 6; i++) g = tick(g)
    const frame = composeFrame(g, 80, 9)
    assert.ok(frame[1].includes('▗▛█▙'), frame.join('\n'))
    assert.equal(frame[7].trim(), '')
  })

  test('пригнувшийся динозавр занимает две строки', () => {
    const g = duck(running())
    assert.equal(dinoSprite(g).length, 2)
    assert.equal(composeFrame(g, 80, 9)[5].slice(0, 20).trim(), '')
  })

  test('счёт справа вверху, рекорд — когда он есть', () => {
    const g = { ...running(), distance: 4 * 321 }
    assert.ok(composeFrame(g, 80, 9)[0].endsWith('00321 '))
    assert.ok(composeFrame(g, 80, 9, { best: 1500 })[0].endsWith('HI 01500  00321 '))
  })

  test('надписи режимов', () => {
    assert.ok(composeFrame(newGame(80), 80, 9).some(l => l.includes('СТАРТ')))
    assert.ok(composeFrame(newGame(80), 80, 9, { best: 0, mouse: false }).some(l => l.includes('/tui fullscreen')))
    assert.ok(composeFrame({ ...running(), mode: 'paused' }, 80, 9).some(l => l.includes('П А У З А')))
    assert.ok(composeFrame({ ...running(), mode: 'over' }, 80, 9).some(l => l.includes('G A M E')))
  })

  test('отсчёт рисует крупные 3, 2, 1 и не показывает «паузу»', () => {
    let g = press({ ...running(), mode: 'paused' })
    const seen: string[] = []
    for (let i = 0; i < COUNTDOWN_TICKS; i += TICKS_PER_SECOND) {
      const frame = composeFrame(g, 80, 9)
      assert.ok(!frame.some(l => l.includes('П А У З А')))
      seen.push(frame.slice(1, 6).map(l => l.slice(37, 42)).join('|'))
      for (let k = 0; k < TICKS_PER_SECOND; k++) g = tick(g)
    }
    assert.deepEqual(seen, [
      '█████|    █| ████|    █|█████',
      '█████|    █|█████|█    |█████',
      '  ██ | ███ |  ██ |  ██ | ████',
    ])
  })

  test('в низкой области отсчёт — обычная цифра', () => {
    const g = press({ ...running(), mode: 'paused' })
    assert.ok(composeFrame(g, 40, 4).some(l => l.includes('3')))
  })
})
