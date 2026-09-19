import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { COUNTDOWN_TICKS, METRICS, TICKS_PER_SECOND, duck, jump, newGame, press, tick, type Game, type Metrics } from '../hooks/game/dino.ts'
import { SPRITES, composeFrame, dinoSprite, toText, type Bitmap } from '../hooks/game/sprites.ts'

const running = (m: Metrics, w = 80): Game => ({ ...newGame(w, m), mode: 'running', spawnIn: 1e9 })
const width = (line: string) => [...line].length
// размер карты в клетках; заодно проверяет, что она прямоугольная и делится на клетки нацело
function cells(map: Bitmap): { w: number; h: number } {
  assert.ok(map.length % 2 === 0, 'нечётная высота карты')
  for (const line of map) {
    assert.equal(line.length, map[0].length, 'карта не прямоугольная')
    assert.match(line, /^[#.]+$/)
  }
  assert.ok(map[0].length % 2 === 0, 'нечётная ширина карты')
  return { w: map[0].length / 2, h: map.length / 2 }
}

test('toText: четвертинки клетки', () => {
  assert.deepEqual(toText(['##..', '##..', '#..#', '.##.']), ['█ ', '▚▞'])
})

for (const m of METRICS) {
  const rows = m.fieldRows + 1
  const dinoColumns = (line: string) => [...line].slice(m.dinoX, m.dinoX + m.duckW).join('')

  describe(`спрайты · ${m.name}`, () => {
    const set = SPRITES[m.name]

    test('размеры карт совпадают с числами набора', () => {
      for (const map of [set.stand, ...set.run, set.dead]) assert.deepEqual(cells(map), { w: m.dinoW, h: m.dinoH })
      for (const map of set.duck) {
        const size = cells(map)
        assert.equal(size.w, m.duckW)
        assert.equal(size.h, Math.ceil(m.duckH))
      }
      for (const [kind, frames] of Object.entries(set.obstacles)) {
        const shape = m.shapes[kind as keyof typeof m.shapes]
        for (const map of frames) assert.deepEqual(cells(map), { w: shape.w, h: shape.h }, kind)
      }
    })

    test('пригнувшийся не выше своего хитбокса, а стоящий заполняет свой', () => {
      const filledRows = (map: Bitmap) => map.filter(line => line.includes('#')).length
      for (const map of set.duck) assert.ok(filledRows(map) <= m.duckH * 2)
      assert.equal(filledRows(set.stand), m.dinoH * 2)
    })

    test('кадры бега отличаются только ногами', () => {
      assert.notDeepEqual(set.run[0], set.run[1])
      assert.deepEqual(set.run[0].slice(0, -2), set.run[1].slice(0, -2))
    })
  })

  describe(`composeFrame · ${m.name}`, () => {
    test('всегда ровно rows строк по cols символов', () => {
      const g: Game = { ...running(m), obstacles: [{ kind: 'cactus-group', x: 76, ...m.shapes['cactus-group'] }, { kind: 'bird-mid', x: -2, ...m.shapes['bird-mid'] }] }
      for (const [c, r] of [[80, rows], [120, rows + 3], [20, 5], [7, 2], [3, 1], [0, 4], [50, 0]]) {
        const frame = composeFrame(g, c, r, { best: 123 })
        assert.equal(frame.length, r)
        for (const line of frame) assert.equal(width(line), c)
      }
    })

    test('нижняя строка — земля, динозавр стоит на ней и занимает свой рост', () => {
      const frame = composeFrame(running(m), 80, rows)
      assert.match(frame[rows - 1], /^[─╌▁]+$/)
      for (let i = 1; i <= m.dinoH; i++) assert.notEqual(dinoColumns(frame[rows - 1 - i]).trim(), '')
      assert.equal(dinoColumns(frame[rows - 2 - m.dinoH]).trim(), '')
    })

    test('в прыжке под динозавром пусто, макушка не выходит за поле', () => {
      let g = jump(running(m))
      for (let i = 0; i < 7; i++) g = tick(g)
      const frame = composeFrame(g, 80, rows)
      assert.equal(dinoColumns(frame[rows - 2]).trim(), '')
      const drawn = frame.slice(0, rows - 1).filter(line => dinoColumns(line).trim() !== '').length
      assert.ok(drawn >= m.dinoH, `нарисовано ${drawn} строк из ${m.dinoH}`)
    })

    test('прыжок рисуется с шагом в полклетки', () => {
      const frames = new Set<string>()
      let g = jump(running(m))
      while (tick(g).y > 0) {
        g = tick(g)
        frames.add(composeFrame(g, 40, rows).slice(0, rows - 1).map(dinoColumns).join('\n'))
      }
      // больше разных картинок, чем целых строк высоты прыжка
      assert.ok(frames.size > m.fieldRows - m.dinoH, `${frames.size} разных кадров`)
    })

    test('пригнувшийся динозавр ниже стоящего', () => {
      const g = duck(running(m))
      assert.equal(dinoSprite(g).length / 2, Math.ceil(m.duckH))
      assert.equal(dinoColumns(composeFrame(g, 80, rows)[rows - 2 - Math.ceil(m.duckH)]).trim(), '')
    })

    test('счёт справа вверху, рекорд — когда он есть, отступ под кнопку движка', () => {
      const g = { ...running(m), distance: m.columnsPerPoint * 321.5 }
      assert.ok(composeFrame(g, 80, rows)[0].endsWith('00321 '))
      assert.ok(composeFrame(g, 80, rows, { best: 1500 })[0].endsWith('HI 01500  00321 '))
      assert.ok(composeFrame(g, 80, rows, { best: 0, scoreRight: 5 })[0].endsWith('00321     '))
    })

    test('надписи режимов', () => {
      assert.ok(composeFrame(newGame(80, m), 80, rows).some(l => l.includes('СТАРТ')))
      assert.ok(composeFrame(newGame(80, m), 80, rows, { best: 0, mouse: false }).some(l => l.includes('/tui fullscreen')))
      assert.ok(composeFrame({ ...running(m), mode: 'paused' }, 80, rows).some(l => l.includes('П А У З А')))
      assert.ok(composeFrame({ ...running(m), mode: 'paused' }, 80, rows, { best: 0, banner: true }).some(l => l.includes('CLAUDE ЗАКОНЧИЛ')))
      assert.ok(composeFrame({ ...running(m), mode: 'over' }, 80, rows).some(l => l.includes('G A M E')))
    })

    test('отсчёт рисует крупные 3, 2, 1 и не показывает «паузу»', () => {
      let g = press({ ...running(m), mode: 'paused' })
      const top = Math.floor((m.fieldRows - 5) / 2)
      const seen: string[] = []
      for (let i = 0; i < COUNTDOWN_TICKS; i += TICKS_PER_SECOND) {
        const frame = composeFrame(g, 80, rows)
        assert.ok(!frame.some(l => l.includes('П А У З А')))
        seen.push(frame.slice(top, top + 5).map(l => [...l].slice(37, 42).join('')).join('|'))
        for (let k = 0; k < TICKS_PER_SECOND; k++) g = tick(g)
      }
      assert.deepEqual(seen, [
        '█████|    █| ████|    █|█████',
        '█████|    █|█████|█    |█████',
        '  ██ | ███ |  ██ |  ██ | ████',
      ])
    })

    test('в низкой области отсчёт — обычная цифра', () => {
      const g = press({ ...running(m), mode: 'paused' })
      assert.ok(composeFrame(g, 40, 4).some(l => l.includes('3')))
    })
  })
}
