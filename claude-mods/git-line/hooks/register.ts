import type { EngineInterface, Register } from 'claude-code'

// Claude often runs `cd other/repo && git ...`; follow it there.
async function repoDir($: EngineInterface, command: string, fallback: string) {
  const m = command.match(/(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&]+)/) ?? command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)
  if (!m?.[1]) return fallback
  let p = m[1].replace(/^['"]|['"]$/g, '')
  if (p.startsWith('~')) p = ((await $.env.get('HOME')) ?? '') + p.slice(1)
  return p.startsWith('/') ? p : `${fallback}/${p}`
}

let dir = ''
let sessionCwd = ''
let pr = { branch: '', text: '' }
let isBusy = false

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
    if (st.exitCode !== 0) return $.ui.status(undefined)

    let branch = ''
    let ahead = 0
    let behind = 0
    let hasUpstream = false
    let changed = 0
    for (const line of st.stdout.split('\n')) {
      if (line.startsWith('# branch.head ')) branch = line.slice(14)
      else if (line.startsWith('# branch.upstream ')) hasUpstream = true
      else if (line.startsWith('# branch.ab ')) {
        const [a = '0', b = '0'] = line.slice(12).split(' ')
        ahead = Number(a)
        behind = -Number(b)
      } else if (line && !line.startsWith('#')) changed++
    }

    if (isPrStale || pr.branch !== branch) {
      const view = await $.process.run(['gh', 'pr', 'view', '--json', 'number,state'], { cwd: dir, timeoutMs: 10_000 }).catch(() => undefined)
      let text = ''
      if (view?.exitCode === 0) {
        const { number, state } = JSON.parse(view.stdout) as { number: number; state: string }
        text = `PR #${number}${state === 'OPEN' ? '' : ` ${state.toLowerCase()}`}`
      }
      pr = { branch, text }
    }

    const wt = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: dir })
    const worktrees = wt.stdout.split('\n').filter(l => l.startsWith('worktree ')).length - 1

    const name = await repoName($)
    const parts = [
      name ? `${name}: ${branch}` : branch,
      ahead ? `↑${ahead}` : '',
      behind ? `↓${behind}` : '',
      !hasUpstream && branch !== '(detached)' ? 'not pushed' : '',
      changed ? `${changed}Δ` : '',
      pr.text,
      worktrees > 0 ? `${worktrees} worktree${worktrees > 1 ? 's' : ''}` : '',
    ]
    $.ui.status(parts.filter(Boolean).join(' · '))
  } finally {
    isBusy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    sessionCwd = await $.session.cwd()
    dir = sessionCwd
    void refresh($)
    // ponytail: polls every 15 s to catch commits made outside Claude; a git index watcher if that ever matters
    $.clock.every(15_000, () => void refresh($))
    return started
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Bash' && /\b(git|gh)\b/.test(e.command)) {
      dir = await repoDir($, e.command, await $.session.cwd())
      void refresh($, /\bgit\s+push\b|\bgh\s+pr\b/.test(e.command))
    } else if (e.tool === 'Edit' || e.tool === 'Write') {
      void refresh($)
    }
    return ran
  }).catch(($, e, next) => next(e))
}
