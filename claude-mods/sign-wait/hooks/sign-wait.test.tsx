import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const
const LOCKED = 'Exit code 128\nerror: 1Password: failed to fill whole buffer\n\nfatal: failed to write commit object'

test('a locked 1Password shows a Retry band that re-asks as the user, and a later success clears it', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { HOME: '/Users/me' })
  const prompts: string[] = []
  let fail = true
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('tool.call', () => (fail ? { isError: true, result: LOCKED, text: LOCKED } : { result: { stdout: '', stderr: '', interrupted: false }, text: '' }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  expect(ran.context?.[0]).toContain('sign-wait')

  const ui = await $.ui.mount({ plugin: 'sign-wait', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /1Password blocked a git commit/ })).toBeDefined()
  await ui.press({ key: 'sign-retry' })
  expect(prompts[0]).toContain('Retry the git commit')

  await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' })
  fail = false
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(await ui.find({ key: 'sign-retry' })).toBeUndefined()
  await ui.unmount()
})

test('a push with unsigned commits is held back until they are re-signed', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { HOME: '/Users/me' })
  const prompts: string[] = []
  const pushes: string[] = []
  let log = 'aaa1111 G\nbbb2222 N\nccc3333 N\n'
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv[1] === 'log' ? log : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash') pushes.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false }, text: '' }
  })

  const held = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(held.deny).toContain('bbb2222, ccc3333')
  expect(pushes).toEqual([])

  const ui = await $.ui.mount({ plugin: 'sign-wait', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /2 unsigned commits held back/ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'git -c commit.gpgsign=false commit -m wip' })
  expect(await ui.find({ key: 'sign-retry' })).toBeDefined()
  await ui.press({ key: 'sign-retry' })
  expect(prompts[0]).toContain('bbb2222^')

  log = 'aaa1111 G\nddd4444 G\neee5555 G\n'
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(pushes.at(-1)).toBe('git push')
  await ui.unmount()
})

test('an unsigned commit chained with a push in one command is refused', async ($, on) => {
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  const ran = await $.tool.call({ tool: 'Bash', command: 'git -c commit.gpgsign=false commit -m x && git push' })
  expect(ran.deny).toContain('separate commands')
})
