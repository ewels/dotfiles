import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DevServer } from '../types'

const PANE = 'dev-servers'
const servers = atom({ plugin: 'dev-servers', key: 'servers' } as const, [])

const SERVER_PROCESS = /^(node|bun|deno|python[\d.]*|Python|ruby|php)$/
const DEV_COMMAND = /\b(dev|serve|preview|start|storybook|vite|astro|next|http\.server|jekyll|hugo)\b/
// A server can take a while to bind after the background command starts.
const ADOPT_WINDOW_MS = 120_000

let pending: { command: string; at: number }[] = []
let known = new Set<number>()
let owned = new Map<number, string>()
let isPaneOpen = false

async function scan($: EngineInterface) {
  const ls = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']).catch(() => undefined)
  if (!ls) return
  const found = new Map<number, { process: string; ports: Set<number> }>()
  let pid = 0
  let proc = ''
  for (const line of ls.stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('c')) proc = line.slice(1)
    else if (line.startsWith('n') && SERVER_PROCESS.test(proc)) {
      const port = Number(line.slice(line.lastIndexOf(':') + 1))
      if (port < 1024) continue
      const s = found.get(pid) ?? { process: proc, ports: new Set<number>() }
      s.ports.add(port)
      found.set(pid, s)
    }
  }

  const cwds = new Map<number, string>()
  if (found.size) {
    const cw = await $.process.run(['lsof', '-a', '-d', 'cwd', '-Fn', '-p', [...found.keys()].join(',')]).catch(() => undefined)
    let p = 0
    for (const line of cw?.stdout.split('\n') ?? []) {
      if (line.startsWith('p')) p = Number(line.slice(1))
      else if (line.startsWith('n')) cwds.set(p, line.slice(1))
    }
  }

  // ponytail: attributes a new listener to the oldest pending start; two servers launched at once may swap commands
  const now = await $.clock.now()
  pending = pending.filter(p => now - p.at < ADOPT_WINDOW_MS)
  for (const p of found.keys()) {
    if (!known.has(p) && pending.length) {
      const start = pending.shift()
      if (start) owned.set(p, start.command)
    }
  }
  known = new Set(found.keys())
  for (const p of owned.keys()) if (!known.has(p)) owned.delete(p)

  const list: DevServer[] = [...found].map(([p, s]) => ({
    pid: p,
    ports: [...s.ports].sort((a, b) => a - b),
    process: s.process,
    cwd: cwds.get(p) ?? '',
    command: owned.get(p),
  }))
  await update($, servers, prev => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list))

  if (!isPaneOpen && list.some(s => s.command)) await openPane($)
}

async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: 'Dev servers' })
  isPaneOpen = opened.isPlaced
}

async function stop($: EngineInterface, s: DevServer) {
  await $.process.run(['kill', String(s.pid)]).catch(() => undefined)
  owned.delete(s.pid)
  await scan($)
}

async function restart($: EngineInterface, s: DevServer) {
  if (!s.command) return
  await stop($, s)
  pending.push({ command: s.command, at: await $.clock.now() })
  await $.tool.call({ tool: 'Bash', command: s.command, run_in_background: true, description: 'Restart dev server' })
}

function shortPath(cwd: string) {
  return cwd.split('/').slice(-2).join('/')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'dev-servers', description: 'Show local dev servers with Open, Restart and Stop' })
    void scan($)
    $.clock.every(5_000, () => void scan($))
    return started
  })

  on('command.run', { command: 'dev-servers' }, async $ => {
    await scan($)
    await $.ui.open({ id: PANE, title: 'Dev servers' })
    isPaneOpen = true
    return { text: 'Dev servers pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) isPaneOpen = false
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash' && e.run_in_background === true && DEV_COMMAND.test(e.command)) {
      pending.push({ command: e.command, at: await $.clock.now() })
      $.clock.after(3_000, () => void scan($))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Leave servers running across /clear: you often clear and keep reviewing the same site.
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear') {
      for (const pid of owned.keys()) await $.process.run(['kill', String(pid)]).catch(() => undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const list = await read($, servers)
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No dev servers listening.</Text>}
        {list.map(s => (
          <Box key={`srv-${s.pid}`} flexDirection="column" marginBottom={1}>
            <Box>
              {s.ports.map(port => (
                <Link key={`open-${s.pid}-${port}`} href={`http://localhost:${port}`} label={`:${port} `} />
              ))}
              <Text dimColor>
                {s.process} {s.command ? '' : '(not this session)'}
              </Text>
            </Box>
            <Text dimColor>{shortPath(s.cwd)}</Text>
            <Box>
              {s.command && <Button key={`restart-${s.pid}`} label="Restart" onPress={() => restart($, s)} />}
              <Button key={`stop-${s.pid}`} label="Stop" onPress={() => stop($, s)} />
            </Box>
          </Box>
        ))}
        {list.length > 1 && (
          <Button
            key="stop-all"
            label="Stop all"
            onPress={async () => {
              for (const s of list) await stop($, s)
            }}
          />
        )}
      </Box>
    )
  })
}
