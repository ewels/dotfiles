import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PANE = 'md'
const doc = atom({ plugin: 'md', key: 'path' } as const, null)

type Style = { color?: string; backgroundColor?: string; bold?: boolean; dimColor?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; inverse?: boolean }
type Span = Style & { text: string }

const BASIC = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const CUBE = [0, 95, 135, 175, 215, 255]
const hex = (...rgb: number[]) => '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('')

function color256(n: number) {
  if (n < 8) return BASIC[n]
  if (n < 16) return `${BASIC[n - 8]}Bright`
  if (n < 232) return hex(CUBE[Math.floor((n - 16) / 36)]!, CUBE[Math.floor((n - 16) / 6) % 6]!, CUBE[(n - 16) % 6]!)
  const g = 8 + (n - 232) * 10
  return hex(g, g, g)
}

function applySgr(style: Style, params: number[]): Style {
  const s = { ...style }
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!
    if (p === 0) for (const k of Object.keys(s)) delete s[k as keyof Style]
    else if (p === 1) s.bold = true
    else if (p === 2) s.dimColor = true
    else if (p === 3) s.italic = true
    else if (p === 4) s.underline = true
    else if (p === 7) s.inverse = true
    else if (p === 9) s.strikethrough = true
    else if (p === 22) s.bold = s.dimColor = undefined
    else if (p === 23) s.italic = undefined
    else if (p === 24) s.underline = undefined
    else if (p === 27) s.inverse = undefined
    else if (p === 29) s.strikethrough = undefined
    else if (p === 39) s.color = undefined
    else if (p === 49) s.backgroundColor = undefined
    else if (p >= 30 && p <= 37) s.color = BASIC[p - 30]
    else if (p >= 90 && p <= 97) s.color = `${BASIC[p - 90]}Bright`
    else if (p >= 40 && p <= 47) s.backgroundColor = BASIC[p - 40]
    else if (p >= 100 && p <= 107) s.backgroundColor = `${BASIC[p - 100]}Bright`
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'color' : 'backgroundColor'
      if (params[i + 1] === 5) {
        s[key] = color256(params[i + 2] ?? 0)
        i += 2
      } else if (params[i + 1] === 2) {
        s[key] = hex(params[i + 2] ?? 0, params[i + 3] ?? 0, params[i + 4] ?? 0)
        i += 4
      }
    }
  }
  return s
}

/** Splits rich's ANSI output into lines of styled spans. */
export function parseAnsi(out: string): Span[][] {
  const lines: Span[][] = []
  let style: Style = {}
  for (const raw of out.replace(/\n$/, '').split('\n')) {
    const line: Span[] = []
    for (const part of raw.split(/(\x1b\[[0-9;]*m)/)) {
      const sgr = part.match(/^\x1b\[([0-9;]*)m$/)
      if (sgr) style = applySgr(style, (sgr[1] || '0').split(';').map(Number))
      else if (part) line.push({ ...style, text: part })
    }
    lines.push(line)
  }
  return lines
}

function absolute(path: string, cwd: string, home: string) {
  const full = path.startsWith('~/') ? home + path.slice(1) : path.startsWith('/') ? path : `${cwd}/${path}`
  const parts: string[] = []
  for (const seg of full.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return '/' + parts.join('/')
}

// Fenced code first so paths inside it are left alone; then [text](x.md), `x.md`, bare x.md.
const MD_REF = /(```[\s\S]*?```)|\[([^\]\n]*)\]\(([^)\s]+\.md)\)|`([^`\s]+\.md)`|(?<![\w/.~\-[(`:])([\w.~/-]*\w\.md)(?![\w/])/g

/** Turns .md paths in a chat message into file:// links; `links` lists the hrefs made. */
export function linkMd(text: string, cwd: string, home: string) {
  const links: string[] = []
  const out = text.replace(MD_REF, (all, fence, label, href, code, bare) => {
    if (fence || /^[a-z]+:/i.test(href ?? '')) return all
    const url = 'file://' + encodeURI(absolute(href ?? code ?? bare, cwd, home))
    links.push(url)
    return `[${label ?? (code ? `\`${code}\`` : bare)}](${url})`
  })
  return { text: out, links }
}

const cache = new Map<string, Span[][]>()

async function render($: EngineInterface, path: string, width: number) {
  const key = `${width}:${path}`
  const hit = cache.get(key)
  if (hit) return hit
  const run = await $.process.run(['env', 'COLORTERM=truecolor', 'rich', '--markdown', '--force-terminal', '--width', String(width), path])
  const lines = run.exitCode === 0 ? parseAnsi(run.stdout) : [[{ text: run.stderr.trim() || `rich exited ${run.exitCode}`, color: 'error' }]]
  // ponytail: no file watching; reopening the file re-renders it.
  if (run.exitCode === 0) cache.set(key, lines)
  return lines
}

async function show($: EngineInterface, path: string) {
  for (const k of [...cache.keys()]) if (k.endsWith(`:${path}`)) cache.delete(k)
  await update($, doc, () => path)
  await $.ui.open({ id: PANE, title: path.split('/').pop() ?? 'Markdown' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'md', description: 'Render a markdown file in a pane with rich' })
    return next(e)
  })

  on('command.run', { command: 'md' }, async ($, e) => {
    const arg = e.args.trim().replace(/^['"]|['"]$/g, '')
    if (!arg) return { text: 'Usage: /md <file.md>' }
    const path = absolute(arg, await $.session.root(), (await $.env.get('HOME')) ?? '')
    await show($, path)
    return { text: `Rendering ${path}` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const linked = linkMd(e.props.text, await $.session.root(), (await $.env.get('HOME')) ?? '')
    if (!linked.links.length) return next(e)
    const { Markdown } = $.ui.resolve(e)
    return (
      <Markdown
        key={`md-${linked.links[0]}-${e.props.text.length}`}
        text={linked.text}
        pressableLinks={linked.links.slice(0, 256)}
        onLinkPress={link => void show($, decodeURI(link.href.slice('file://'.length)))}
      />
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const path = await read($, doc)
    if (!path) return <Text dimColor>Run /md &lt;file&gt; to render a markdown file.</Text>
    const lines = await render($, path, Math.max(20, (e.viewport?.columns ?? 80) - 4))
    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text wrap="truncate-end">{line.length ? line.map(({ text, ...style }) => <Text {...style}>{text}</Text>) : ' '}</Text>
        ))}
      </Box>
    )
  })
}
