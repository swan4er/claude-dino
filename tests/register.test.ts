// Тесты хуков и поверхности в окружении движка. Запуск: claude plugin test .
// Игровая логика и время проверяются отдельно (tests/*.spec.ts, node --test): поверхность
// считает время по настоящим часам, а тестовый `ui.advance` двигает только таймер кадров.
import type { RenderElement } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

// что движок рисует в полосе сам, «под» плагином
const BENEATH: RenderElement = { type: 'Text', children: [''] }

const run = (args: string) => ({ command: 'dino', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 100 } }) as const

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

describe('register', () => {
  test('/dino открывает игру, клавиши ведут её через паузу к отсчёту, /dino закрывает', async ($, on) => {
    mock.clock(on)
    mock.store(on, {})
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => BENEATH)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const opened = await $.command.run(run(''))
    expect(opened.text).toContain('кликните по полю')

    const ui = await $.ui.mount({ plugin: 'claude-dino', surface: 'terminal', ...BAND })
    expect(await ui.find({ type: 'Text', text: /КЛИК ПО ПОЛЮ — СТАРТ/, in: 'dino' })).toBeDefined()

    await ui.key({ key: 'space' })
    expect(await ui.find({ type: 'Text', text: /^пробел, ↑ или клик — прыжок/, in: 'dino' })).toBeDefined()
    await ui.key({ key: 'p' })
    expect(await ui.find({ type: 'Text', text: /П А У З А/, in: 'dino' })).toBeDefined()
    // снятие с паузы — не игра, а отсчёт
    await ui.key({ key: 'p' })
    expect(await ui.find({ type: 'Text', text: /^приготовьтесь: 3/, in: 'dino' })).toBeDefined()
    // русская раскладка: з = p — обратно на паузу
    await ui.key({ key: 'з' })
    expect(await ui.find({ type: 'Text', text: /^пауза/, in: 'dino' })).toBeDefined()
    await ui.unmount()

    const closed = await $.command.run(run(''))
    expect(closed.text).toContain('закрыта')
  })

  test('рекорд сохраняется в хранилище и возвращается командой /dino best', async ($, on) => {
    const written: Record<string, unknown> = {}
    mock.clock(on)
    // хранилище отвечает сам тест, чтобы видеть записи
    on('store.get', ($, e) => ({ value: written[e.key] }))
    on('store.set', ($, e) => {
      written[e.key] = e.value
      return { value: undefined }
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => BENEATH)
    on('ui.toast', () => ({ value: undefined }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: 'claude-dino', surface: 'terminal', ...BAND })
    await ui.post({ score: 321 })
    await ui.post({ score: 12 })
    await ui.unmount()

    expect(written.best).toBe(321)
    const best = await $.command.run(run('best'))
    expect(best.text).toContain('321')
  })

  test('в низком окне вместо игры — строка с объяснением', async ($, on) => {
    mock.clock(on)
    mock.store(on, {})
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => BENEATH)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: 'claude-dino', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND.props, maxRows: 6 } })
    expect(await ui.find({ type: 'Text', text: /низковато/ })).toBeDefined()
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    await ui.unmount()
  })

  test('в обычном режиме терминала игра говорит, что нужна мышь', async ($, on) => {
    mock.clock(on)
    mock.store(on, {})
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => BENEATH)

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run(run(''))
    const ui = await $.ui.mount({ plugin: 'claude-dino', surface: 'terminal', viewport: { columns: 100, rows: 40, isFullscreen: false }, ...BAND })
    expect(await ui.find({ type: 'Text', text: /tui fullscreen/, in: 'dino' })).toBeDefined()
    await ui.unmount()
  })
})
