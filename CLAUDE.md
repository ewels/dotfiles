# General

- If my message is a question, answer it — never edit files or run mutating commands until I explicitly ask for a change.
- This machine's interactive shell is zsh, not bash. Avoid bash-only read flags (-a/-A array reads, -u fd reads) and other bashisms in shell scripts; prefer POSIX-portable constructs or write throwaway logic in Python instead of zsh/bash loops.
- `nt` isn't a stray keystroke, that's the user opening a new tab at this working directory. No action needed.

# Agents file

If no `CLAUDE.md` file is found in the root of the repo, check if there is a root-level `AGENTS.md`. If there is, read it and treat it as if it were a `CLAUDE.md` file.

# Git

- The user typically wants to review code in a separate window before pushing.
- Never run `git commit` or `git push` unless I explicitly ask in that message.
- Showing diffs is fine; committing is not, by default.

# GitHub

- When posting PRs and issues, check for available templates on GitHub and use if applicable.
- GitHub flavoured markdown renders single line breaks. When posting issues and PR descriptions keep lines / paragraphs full length.
- Avoid referencing sub-tasks within reviews and issues with a hash symbol (`#2`, `#6` etc), only use this notation for referencing GitHub issue and PR numbers.
- The GitHub CLI can now attach files to issues/PRs with `--attach`. Use a local path in the markdown then `--attach` with the same path.

## Code Comments

- Default to no comment. Code shows *how*; comment only to carry *why* — a non-obvious constraint, deliberate deviation, gotcha, or workaround.
- Never narrate the code ("loop over users", "parse the body"), restate names/types/signatures, or mark block ends.
- Never narrate the change ("fixed X", "updated to Y", "as requested"). A comment must read correctly to someone seeing the file fresh who never saw the diff; change context belongs in the commit message.
- Delete by default. A comment that just restates a decision the code already reflects — "1 vCPU is deliberate", "right-sized from prod" — is dead weight even when it points to a doc: the doc is where anyone questioning it looks anyway. Keep inline only what a reader needs *at that line* and can't get from the code — a non-obvious invariant/constraint ("timeout must stay < interval — ALB rule") or a cross-file sync obligation ("keep in sync with the router's TGs").
- Comments must stand on their own with any link removed — encode the substance, never a pointer as a substitute for it. Banned: specs, section numbers, design docs — point-in-time artifacts that get superseded and rot ("spec §7" is the canonical case). Fine: a maintained doc/README at a stable path — and when the *why* is a system-level narrative ("why it's built this way"), extract it there as a *pure* extraction: not an inline block, and not a comment that merely points to the doc. What stays inline are the non-obvious local details, which reference the doc only when a reader genuinely needs it *at that line* — a pointer-only comment generally shouldn't exist at all. Tickets, Confluence, RFCs, permalinks stay fine as trailing breadcrumbs.
- Occam's razor on every comment you *keep*, not just the ones you delete. "Carries a real *why*" and "is worded minimally" are independent judgments — a genuine *why* can still be 3x too long, and "it's a real why" is not license to keep the wording verbatim. Keep only the one non-obvious fact a reader needs *at that line*, in the fewest words; cut the mechanism the code already shows, where a value is consumed downstream, the consequence-of-the-consequence, and justification-of-the-justification. A 5-line block almost never survives intact — suspect it on sight; the razored answer is sometimes zero.
- A one-line summary on a public function/endpoint is fine; inline restatement of a single clear line never is.
- TODOs are fine and don't need issue IDs — but a TODO is a marker, not a substitute for doing the work in scope.

# Browser testing

You can use use either the `agent-browser` CLI, playwright or chrome devtools to test web artefacts. `agent-browser` is much more token efficient though and is preferred over the alternatives wherever possible.

Agent-browser has skills available that instruct usage:

```sh
agent-browser skills get core --full
```

Skills ship with the CLI (always version-matched) and include workflow patterns, ref/selector usage, and copy-paste examples. Prefer this over guessing commands from flag docs alone. Specialized skills cover Electron apps, Slack, exploratory testing, and cloud browser providers.

- `skills [list]`                List available skills
- `skills get core`              Core usage guide (overview + common patterns)
- `skills get core --full`       Include full command reference and templates
- `skills get <name>`            Load a specialized skill (electron, slack, ...)
- `skills path [name]`           Print skill directory path

# GitHub Actions

When working with GitHub actions, please do the following after writing or editing the file:

- `ghactionsup` bash function (runs `npx actions-up`) to bump all actions to their latest version
- Use `zizmor` to check for security issues.

Actions under nextflow-io/seqeralabs/nf-core orgs should be pinned to major-version tag only, so that they can automatically get fixes and updates without pipeline changes. These orgs are controlled by us. The bash function does this. See ~/GitHub/ewels/dotfiles for source.
Environment has `export ZIZMOR_CONFIG="$HOME/GitHub/ewels/dotfiles/zizmor.yml"` for same reason.

If you find issues outside the scope of the current file, ask the user if you should fix them as well. He probably will want you to.

# npm packages

When installing packages from `npm`, always check for the latest available version instead of using version numbers you remember. New websites should always use the latest versions of packages (where possible).
