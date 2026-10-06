import { expect, mock, test } from 'claude-code/testing'

const out = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

test('status line sums up branch, ahead/behind, changes, PR and worktrees', async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    if (cmd.startsWith('git status')) return { value: out('# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -1\n? new.ts\n1 .M x\n') }
    if (cmd.startsWith('gh pr view')) return { value: out('{"number":336,"state":"OPEN"}') }
    if (cmd.startsWith('git worktree')) return { value: out('worktree /repo\nHEAD a\n\nworktree /repo/.wt/a\nHEAD b\n') }
    return { value: out('') }
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))

  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await clock.settle()
  expect(statuses.at(-1)).toBe('feat/x · ↑2 · ↓1 · 2Δ · PR #336 · 1 worktree')
})

test('a repo outside the session folder is labelled with its name', async ($, on) => {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  const statuses: (string | undefined)[] = []
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: '/Users/me/demo' }))
  on('process.run', ($, e) => {
    const cmd = e.argv.join(' ')
    if (cmd.startsWith('git status')) return { value: out('# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n1 .M x\n') }
    if (cmd.startsWith('git rev-parse --show-toplevel')) return { value: out('/Users/me/GitHub/ewels/starlight-codeblocks\n') }
    if (cmd.startsWith('git worktree')) return { value: out('worktree /x\n') }
    return { value: out('', 1) }
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))

  await $.tool.call({ tool: 'Bash', command: 'cd ~/GitHub/ewels/starlight-codeblocks && git log -5' })
  await clock.settle()
  expect(statuses.at(-1)).toBe('starlight-codeblocks: main · 1Δ')
})
