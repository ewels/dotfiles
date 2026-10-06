import { expect, test } from 'claude-code/testing'

import { linkMd, parseAnsi } from './register'

test('rich ANSI output becomes styled spans per line', async () => {
  const lines = parseAnsi('\x1b[1mHi\x1b[0m \x1b[97;40mcode\x1b[0m\n\n\x1b[38;2;255;0;16mx\x1b[0m\x1b[38;5;196my\x1b[0m\n')
  expect(lines.length).toBe(3)
  expect(lines[0]).toEqual([{ bold: true, text: 'Hi' }, { text: ' ' }, { color: 'whiteBright', backgroundColor: 'black', text: 'code' }])
  expect(lines[1]).toEqual([])
  expect(lines[2]).toEqual([{ color: '#ff0010', text: 'x' }, { color: '#ff0000', text: 'y' }])
})

test('.md paths in chat become file links, code fences left alone', async () => {
  const r = linkMd('See `docs/a.md`, [the readme](../README.md) and ~/notes.md.\n```\nx.md\n```\nNot https://x.y/a.md', '/r/sub', '/home/me')
  expect(r.text).toBe('See [`docs/a.md`](file:///r/sub/docs/a.md), [the readme](file:///r/README.md) and [~/notes.md](file:///home/me/notes.md).\n```\nx.md\n```\nNot https://x.y/a.md')
  expect(r.links.length).toBe(3)
})
