import { expect, mock, test } from 'claude-code/testing'

const PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} }
const out = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const STATUS = '# branch.oid abc\n# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -0\n1 .M N... 100644 100644 100644 a b src/a.ts\n'

test('dirty, unpushed feature branch offers Commit + push and Open PR, sent as the user', async ($, on) => {
  mock.clock(on)
  const prompts: string[] = []
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'git') return { value: out(STATUS) }
    return { value: out('', 1) }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  await $.tool.call({ tool: 'Bash', command: 'git status' })

  const busy = await $.ui.mount({ plugin: 'ship', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, isWorking: true } })
  expect(await busy.find({ key: 'ship-push' })).toBeUndefined()
  await busy.unmount()

  const ui = await $.ui.mount({ plugin: 'ship', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await ui.find({ key: 'ship-pr' })).toBeDefined()
  await ui.press({ key: 'ship-push' })
  expect(prompts[0]).toBe('please commit and push')
  await ui.unmount()
})
