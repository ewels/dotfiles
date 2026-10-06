import { expect, mock, test } from 'claude-code/testing'

const out = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

test('a server this session started is listed with Restart; Stop kills it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const killed: string[] = []
  let listening = 'p100\ncnode\nn*:4321\np7\ncrapportd\nn*:49152\n'
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', () => ({ value: { command: 'dev-servers' } }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'kill') {
      killed.push(e.argv[1]!)
      listening = ''
      return { value: out('') }
    }
    if (e.argv.includes('-sTCP:LISTEN')) return { value: out(listening) }
    return { value: out('p100\nn/Users/me/GitHub/site/docs\n') }
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: '' }))

  await $.tool.call({ tool: 'Bash', command: 'cd docs && npm run dev', run_in_background: true })
  await clock.advance(3_000)

  const ui = await $.ui.mount({ plugin: 'dev-servers', surface: 'terminal', component: 'Pane', requestId: 'dev-servers', props: {} as never })
  expect(await ui.find({ key: 'restart-100' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /site\/docs/ })).toBeDefined()
  await ui.press({ key: 'stop-100' })
  expect(killed).toEqual(['100'])
  expect(await ui.find({ key: 'stop-100' })).toBeUndefined()
  await ui.unmount()
})
