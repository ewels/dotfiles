# Claude Code mods

Small [Claude Code](https://claude.com/claude-code) plugins written as function hooks. Each folder is one mod.

| Mod | What it does |
| --- | --- |
| `sign-wait` | When 1Password blocks a git commit or push, sends a macOS notification and shows a band with a Retry button. Lets Claude commit unsigned meanwhile, but holds back any `git push` that would include unsigned commits until they're re-signed. |
| `ci-watch` | After Claude runs `git push`, polls `gh run list` for that commit and shows progress in the status line (`CI ⏳ 1/3`, `CI ✓`, `CI ✗ e2e`). On failure, a Fix it button hands the failing run's logs to Claude. |
| `dev-servers` | `/dev-servers` opens a pane listing local dev servers (node, python, bun, …) with port links and Restart / Stop buttons. Stops the servers a session started when that session exits. |
| `ship` | When Claude is idle and the repo has uncommitted or unpushed work, shows Commit, Commit + push and Open PR buttons above the prompt. Each sends a normal prompt in your words. |
| `git-line` | Status line with branch, ahead/behind, changed files, PR number and worktree count, labelled with the repo name when it isn't the session's folder. |
| `md` | `.md` paths in Claude's replies become links that open the file in a pane, rendered by [rich-cli](https://github.com/Textualize/rich-cli) colours and all. `/md <file>` does the same by hand. |

The status line and buttons cost no usage. Buttons that send a prompt (Retry, Fix it, ship's buttons) cost one turn, same as typing it.

## Install

Symlink this folder into place and list the mods in `~/.claude/settings.json`:

```sh
ln -s ~/GitHub/ewels/dotfiles/claude-mods ~/.claude/mods
```

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/sign-wait:~/.claude/mods/ci-watch:~/.claude/mods/dev-servers:~/.claude/mods/ship:~/.claude/mods/git-line:~/.claude/mods/md"
}
```

New sessions load them, and running sessions reload a mod when its files change. Drop a path from the list to turn that mod off.

## Develop

```sh
claude plugin validate sign-wait   # check the module the way the engine reads it
claude plugin test sign-wait       # run its *.test.ts(x)
```

`.claude-plugin/types/` in each mod is written by Claude Code on load (it's what `tsconfig.json` extends) and is git-ignored.
