# Claude Code skills

[Agent skills](https://docs.claude.com/en/docs/claude-code/skills) for Claude Code. Each folder is one skill.

| Skill | What it does |
| --- | --- |
| `demo-video` | Records polished, high-resolution demo videos of any web app with Playwright: a smooth animated cursor with click ripples, smooth scrolling, optional title cards over a blurred background, and per-step clips with a held last frame for slides. Needs Node.js, ffmpeg and uv. |

The Python scripts declare their (empty) dependencies inline, so `uv run script.py` works without a virtual environment.

## Install

Symlink each skill into `~/.claude/skills/`:

```sh
ln -s ~/GitHub/ewels/dotfiles/claude-skills/demo-video ~/.claude/skills/demo-video
```
