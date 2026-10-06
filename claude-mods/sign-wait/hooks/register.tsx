import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SignBlock } from '../types'

const block = atom({ plugin: 'sign-wait', key: 'block' } as const, null)

// Commit signing (op-ssh-sign) and SSH push auth both go through the 1Password agent.
const AGENT_FAILED = /1Password:|sign_and_send_pubkey: signing failed|communication with agent failed/
const GIT_WRITE = /\bgit\s+(commit|push|rebase|cherry-pick|merge|tag)\b/
const RENOTIFY_MS = 10 * 60_000

let lastNotifiedAt = 0

// Claude often runs `cd other/repo && git commit`; follow it there.
async function repoDir($: EngineInterface, command: string, fallback: string) {
  const m = command.match(/(?:^|&&|;)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&]+)/) ?? command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)
  if (!m?.[1]) return fallback
  let p = m[1].replace(/^['"]|['"]$/g, '')
  if (p.startsWith('~')) p = ((await $.env.get('HOME')) ?? '') + p.slice(1)
  return p.startsWith('/') ? p : `${fallback}/${p}`
}

function describe(b: SignBlock) {
  return b.kind === 'unsigned'
    ? `${b.unsigned?.length} unsigned commit${b.unsigned?.length === 1 ? '' : 's'} held back from push`
    : `1Password blocked a git ${b.kind}`
}

// ponytail: checks every commit not on any remote, not just the pushed refspec; parse the refspec if pushing other branches matters
async function unsignedCommits($: EngineInterface, dir: string) {
  const log = await $.process.run(['git', 'log', '--reverse', '--format=%h %G?', 'HEAD', '--not', '--remotes'], { cwd: dir })
  if (log.exitCode !== 0) return []
  return log.stdout.split('\n').filter(l => l.endsWith(' N')).map(l => l.slice(0, -2))
}

async function blocked($: EngineInterface, b: SignBlock) {
  await update($, block, () => b)
  $.ui.toast(`${describe(b)}. Unlock 1Password, then press Retry.`, { timeoutMs: 15_000 })
  if (b.at - lastNotifiedAt < RENOTIFY_MS) return
  lastNotifiedAt = b.at
  // A macOS notification reaches you away from the terminal; the toast doesn't.
  await $.process.run([
    'osascript', '-e',
    `display notification "${describe(b)}. Unlock 1Password, then Retry." with title "Claude Code: signing" sound name "Glass"`,
  ]).catch(() => undefined)
}

// An unsigned-commits block stays until a push gets through, i.e. the commits were re-signed.
async function cleared($: EngineInterface, isPush: boolean) {
  const b = await read($, block)
  if (!b || (b.kind === 'unsigned' && !isPush)) return
  await update($, block, () => null)
  $.ui.toast('1Password signing works again')
}

async function retry($: EngineInterface, b: SignBlock) {
  await update($, block, () => null)
  const text =
    b.kind === 'unsigned'
      ? `1Password is unlocked now. In ${b.dir}, re-sign the unsigned commits (${b.unsigned?.join(', ')}) with \`git rebase --exec 'git commit --amend --no-edit -n -S' ${b.unsigned?.[0]}^\`, check \`git log --format='%h %G?' HEAD --not --remotes\` shows no N, then push.`
      : `1Password is unlocked now. Retry the git ${b.kind} that failed in ${b.dir}, then carry on.`
  await $.prompt.submit({ text, asUser: true })
}

function ago(ms: number) {
  const min = Math.round(ms / 60_000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

export const register: Register = on => {
  // Fails open: if the unsigned check itself errors, the push goes ahead.
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Bash' || !GIT_WRITE.test(e.command)) return next(e)

    if (/\bgit\s+push\b/.test(e.command)) {
      const dir = await repoDir($, e.command, await $.session.cwd())
      const unsigned = await unsignedCommits($, dir)
      // The check runs before the command, so an unsigned commit made earlier in it would slip past.
      if (/commit\.gpgsign=false|--no-gpg-sign/.test(e.command)) {
        return { deny: 'sign-wait: commit unsigned and push in separate commands, so the push can be checked for unsigned commits.' }
      }
      if (unsigned.length > 0) {
        await blocked($, { dir, kind: 'unsigned', at: await $.clock.now(), unsigned })
        return {
          deny: `sign-wait: push held back, ${unsigned.length} commit(s) are unsigned (${unsigned.join(', ')}). The user has been notified and will press Retry to re-sign and push once 1Password is unlocked. Do not push them unsigned; carry on with other work.`,
        }
      }
    }

    const ran = await next(e)

    if (ran.isError === true && AGENT_FAILED.test(ran.text ?? '')) {
      const dir = await repoDir($, e.command, await $.session.cwd())
      const kind = /\bgit\s+push\b/.test(e.command) && !/\bgit\s+commit\b/.test(e.command) ? 'push' : 'commit'
      await blocked($, { dir, kind, at: await $.clock.now() })
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          "sign-wait: the 1Password agent is locked or away and the user has been notified. Commit unsigned to keep going (`git -c commit.gpgsign=false commit ...`); pushes are held back until those commits are re-signed.",
        ],
      }
    }
    if (ran.isError !== true && ran.deny === undefined) await cleared($, /\bgit\s+push\b/.test(e.command))
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await read($, block)
    if (!b || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="yellow">🔒 {describe(b)} </Text>
          <Text dimColor>
            in {b.dir.split('/').pop()} · {ago(now - b.at)}{' '}
          </Text>
          <Button key="sign-retry" label="Retry" variant="primary" onPress={() => retry($, b)} />
          <Button key="sign-dismiss" label="Dismiss" role="dismiss" onPress={() => update($, block, () => null)} />
        </Box>
        {below}
      </Box>
    )
  })
}
