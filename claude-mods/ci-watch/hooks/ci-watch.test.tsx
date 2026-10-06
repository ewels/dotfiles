import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const
const out = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

test('a push is watched until CI fails, then Fix it hands the failing run to Claude', async ($, on) => {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  const statuses: (string | undefined)[] = []
  const prompts: string[] = []
  let runs = [
    { databaseId: 1, name: 'lint', status: 'completed', conclusion: 'success' },
    { databaseId: 2, name: 'e2e', status: 'in_progress', conclusion: '' },
  ]
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    if (cmd === 'git rev-parse HEAD') return { value: out('abcdef1234\n') }
    if (cmd.startsWith('git rev-parse --abbrev-ref')) return { value: out('feat/x\n') }
    if (cmd.startsWith('gh run list')) return { value: out(JSON.stringify(runs)) }
    return { value: out('') }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))

  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await clock.advance(20_000)
  expect(statuses.at(-1)).toBe('CI ⏳ 1/2')

  runs = [runs[0]!, { databaseId: 2, name: 'e2e', status: 'completed', conclusion: 'failure' }]
  await clock.advance(20_000)
  expect(statuses.at(-1)).toBe('CI ✗ e2e')

  const ui = await $.ui.mount({ plugin: 'ci-watch', surface: 'terminal', ...BAND })
  await ui.press({ key: 'ci-fix' })
  expect(prompts[0]).toContain('gh run view 2 --log-failed')
  expect(await ui.find({ key: 'ci-fix' })).toBeUndefined()
  await ui.unmount()
})
