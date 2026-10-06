import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CiFailure } from '../types'

type Run = { databaseId: number; name: string; status: string; conclusion: string }

const failure = atom({ plugin: 'ci-watch', key: 'failure' } as const, null)
const FAILED = new Set(['failure', 'timed_out', 'startup_failure'])

let watch: { dir: string; sha: string; branch: string; polls: number; timer?: { cancel(): void } } | undefined

// Claude often runs `cd other/repo && git push`; follow it there.
async function repoDir($: EngineInterface, command: string, fallback: string) {
  const m = command.match(/(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&]+)/) ?? command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)
  if (!m?.[1]) return fallback
  let p = m[1].replace(/^['"]|['"]$/g, '')
  if (p.startsWith('~')) p = ((await $.env.get('HOME')) ?? '') + p.slice(1)
  return p.startsWith('/') ? p : `${fallback}/${p}`
}

async function poll($: EngineInterface) {
  const w = watch
  if (!w) return
  w.polls++
  const res = await $.process.run(
    ['gh', 'run', 'list', '--commit', w.sha, '--json', 'databaseId,name,status,conclusion', '-L', '50'],
    { cwd: w.dir, timeoutMs: 15_000 },
  ).catch(() => undefined)
  if (w !== watch) return
  const runs: Run[] = res?.exitCode === 0 ? JSON.parse(res.stdout) : []
  const short = w.sha.slice(0, 7)

  // Runs take a few seconds to appear; give up after ~2 min with none, or ~1 h overall.
  if ((runs.length === 0 && w.polls > 6) || w.polls > 180) {
    w.timer?.cancel()
    watch = undefined
    $.ui.status(runs.length === 0 ? undefined : `CI ? ${short} (stopped watching)`)
    return
  }
  if (runs.length === 0) return

  const done = runs.filter(r => r.status === 'completed')
  const failed = done.filter(r => FAILED.has(r.conclusion))
  if (done.length < runs.length) {
    $.ui.status(`CI ⏳ ${done.length}/${runs.length}${failed.length ? ` · ${failed.length} ✗` : ''}`)
    return
  }

  w.timer?.cancel()
  watch = undefined
  if (failed.length === 0) {
    $.ui.status(`CI ✓ ${short}`)
    $.ui.toast(`CI green on ${w.branch} (${runs.length} runs)`)
    await update($, failure, () => null)
    return
  }
  const names = failed.map(r => r.name)
  $.ui.status(`CI ✗ ${names.join(', ')}`)
  $.ui.toast(`CI failed on ${w.branch}: ${names.join(', ')}`, { timeoutMs: 10_000 })
  const f: CiFailure = { branch: w.branch, sha: w.sha, names, runId: failed[0]!.databaseId }
  await update($, failure, () => f)
}

async function start($: EngineInterface, dir: string) {
  const sha = await $.process.run(['git', 'rev-parse', 'HEAD'], { cwd: dir })
  const branch = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir })
  if (sha.exitCode !== 0) return
  watch?.timer?.cancel()
  watch = { dir, sha: sha.stdout.trim(), branch: branch.stdout.trim(), polls: 0 }
  watch.timer = $.clock.every(20_000, () => void poll($))
  await update($, failure, () => null)
  $.ui.status(`CI ⏳ ${watch.sha.slice(0, 7)}`)
}

async function fix($: EngineInterface, f: CiFailure) {
  await update($, failure, () => null)
  await $.prompt.submit({
    text: `CI failed on ${f.branch} (${f.sha.slice(0, 7)}): ${f.names.join(', ')}. Read the failing logs with \`gh run view ${f.runId} --log-failed\`, fix the cause, then commit and push.`,
    asUser: true,
  })
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'Bash' && ran.isError !== true && ran.deny === undefined && /\bgit\s+push\b/.test(e.command)) {
      await start($, await repoDir($, e.command, await $.session.cwd()))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, failure)
    if (!f || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="red">CI ✗ </Text>
          <Text>
            {f.branch} {f.sha.slice(0, 7)}: {f.names.join(', ')}{' '}
          </Text>
          <Button key="ci-fix" label="Fix it" variant="primary" onPress={() => fix($, f)} />
          <Button key="ci-dismiss" label="Dismiss" role="dismiss" onPress={() => update($, failure, () => null)} />
        </Box>
        {below}
      </Box>
    )
  })
}
