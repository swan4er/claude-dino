/* @jsx h */
import type { Register } from 'claude-code'

// Модуль хуков. Одна команда, /dino: открывает и закрывает игру над строкой ввода. Саму игру
// рисует ./dino.tsx в потоке отрисовки; здесь — команда, рекорд в $.store и сигнал поверхности,
// что Claude закончил ход (она ставит игру на паузу). Команда отвечает сама, модель не вызывается;
// её ответы движок сам подписывает именем плагина (`claude-dino: …`).

const BAND_ROWS = 10 // восемь строк поля, земля, строка подсказки

let open = false
let best = 0
// растёт с каждым завершённым ходом; поверхность ставит паузу, когда видит новое значение
let turnsDone = 0
// false в обычном режиме терминала: кликов нет, игра не может получить клавиатуру и говорит об этом
let mouse = true

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // непойманный отказ здесь выгрузил бы весь модуль: хранилище стоит рекорда, но не игры
    const saved = Number(await $.store.get('best').catch(err => $.ui.log(`claude-dino: рекорд не прочитан: ${err}`)))
    if (saved > 0) best = saved
    await $.command.register({
      name: 'dino',
      description: 'Игра про динозаврика над строкой ввода: открыть или закрыть (claude-dino)',
      argumentHint: '[stop | best]',
      immediate: true,
    }).catch(err => $.ui.log(`claude-dino: /dino не зарегистрирована: ${err}`))
    return r
  })

  on('command.run', { command: 'dino' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'best') return { text: best > 0 ? `рекорд ${best}` : 'рекорда пока нет' }
    if (arg !== '' && arg !== 'stop') return { text: `не знаю «${arg}» · /dino открывает и закрывает, /dino best — рекорд` }
    open = arg === 'stop' ? false : !open
    $.ui.invalidate('ui.render')
    return { text: open ? 'кликните по полю над строкой ввода, затем пробел — прыжок · Esc возвращает к строке ввода · /dino закрывает' : 'игра закрыта' }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (open) {
      turnsDone++
      $.ui.invalidate('ui.render')
    }
    return r
  })

  // поверхность сообщает счёт оконченного раунда; рекорд возвращается ей следующими props
  on('ui.message', async ($, e, next) => {
    const result = (e.data as { score?: unknown } | null)?.score
    if (typeof result !== 'number') return next(e)
    if (result > best) {
      best = result
      await $.store.set('best', best).catch(err => $.ui.log(`claude-dino: рекорд не сохранён: ${err}`))
      $.ui.toast(`dino: новый рекорд ${best}`)
    }
    return { props: { best, done: turnsDone, mouse } }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // игре нужны клавиши и мышь терминала; опрос занимает полосу сам
    if (!open || e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const rows = Math.min(BAND_ROWS, e.props.maxRows)
    if (rows < 3) return next(e)
    mouse = e.viewport?.isFullscreen !== false
    const { Box, Client } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Client key="dino" module="./dino.tsx" width={e.props.bodyColumns} height={rows} props={{ best, done: turnsDone, mouse }} />
        {await next(e)}
      </Box>
    )
  })
}
