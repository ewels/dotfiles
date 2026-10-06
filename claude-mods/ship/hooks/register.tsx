import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RepoState } from '../types'

const repo = atom({ plugin: 'ship', key: 'repo' } as const, null)
const DEFAULT_BRANCHES = new Set(['main', 'master', 'dev'])

let dir = ''
let sessionCwd = ''
let isBusy = false
let prBranch: string | undefined
let hasPr = false

// Claude often runs `cd other/repo && git ...`; follow it there.
async function repoDir($: EngineInterface, command: string, fallback: string) {
  const m = command.match(/(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&]+)/) ?? command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)
  if (!m?.[1]) return fallback
  let p = m[1].replace(/^['"]|['"]$/g, '')
  if (p.startsWith('~')) p = ((await $.env.get('HOME')) ?? '') + p.slice(1)
  return p.startsWith('/') ? p : `${fallback}/${p}`
}

// Labels the repo when it isn't the session's own folder, so you can tell what you're looking at.
async function repoName($: EngineInterface) {
  if (dir === sessionCwd) return ''
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: dir })
  return top.stdout.trim().split('/').pop() ?? ''
}

async function refresh($: EngineInterface, isPrStale = false) {
  if (isBusy || !dir) return
  isBusy = true
  try {
    const st = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd: dir })
    if (st.exitCode !== 0) {
      await update($, repo, () => null)
      return
    }
    const next: RepoState = { name: await repoName($), branch: '', changed: 0, ahead: 0, hasUpstream: false, hasPr: false }
    for (const line of st.stdout.split('\n')) {
      if (line.startsWith('# branch.head ')) next.branch = line.slice(14)
      else if (line.startsWith('# branch.upstream ')) next.hasUpstream = true
      else if (line.startsWith('# branch.ab ')) next.ahead = Number(line.slice(12).split(' ')[0])
      else if (line && !line.startsWith('#')) next.changed++
    }
    if (isPrStale || prBranch !== next.branch) {
      const view = await $.process.run(['gh', 'pr', 'view', '--json', 'state', '-q', '.state'], { cwd: dir, timeoutMs: 10_000 }).catch(() => undefined)
      hasPr = view?.exitCode === 0 && view.stdout.trim() === 'OPEN'
      prBranch = next.branch
    }
    next.hasPr = hasPr
    await update($, repo, prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  } finally {
    isBusy = false
  }
}

// Submitted as the user's own words, so a "never commit unless asked" rule is still honoured.
function ship($: EngineInterface, text: string) {
  return $.prompt.submit({ text, asUser: true })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    sessionCwd = await $.session.cwd()
    dir = sessionCwd
    void refresh($)
    $.clock.every(15_000, () => void refresh($))
    return started
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Bash' && /\b(git|gh)\b/.test(e.command)) {
      dir = await repoDir($, e.command, await $.session.cwd())
      void refresh($, /\bgh\s+pr\b/.test(e.command))
    } else if (e.tool === 'Edit' || e.tool === 'Write') {
      void refresh($)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, repo)
    const unpushed = r ? r.ahead > 0 || !r.hasUpstream : false
    const canOpenPr = r ? !r.hasPr && !DEFAULT_BRANCHES.has(r.branch) && r.branch !== '(detached)' : false
    if (!r || e.props.hasSurvey || e.props.isWorking || (r.changed === 0 && !unpushed)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const summary = [
      r.changed ? `${r.changed} changed` : '',
      r.ahead ? `${r.ahead} unpushed` : !r.hasUpstream ? 'branch not pushed' : '',
    ].filter(Boolean).join(' · ')
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>
            {r.name ? `${r.name} ` : ''}
            {r.branch}: {summary}{' '}
          </Text>
          {r.changed > 0 && <Button key="ship-commit" label="Commit" onPress={() => ship($, 'please commit')} />}
          <Button
            key="ship-push"
            label={r.changed > 0 ? 'Commit + push' : 'Push'}
            variant="primary"
            onPress={() => ship($, r.changed > 0 ? 'please commit and push' : 'please push')}
          />
          {canOpenPr && (
            <Button
              key="ship-pr"
              label="Open PR"
              onPress={() => ship($, r.changed > 0 ? 'please commit to this branch, push and open a PR' : 'please push and open a PR')}
            />
          )}
        </Box>
        {below}
      </Box>
    )
  })
}
