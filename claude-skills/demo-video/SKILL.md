---
name: demo-video
description: Record polished, high-resolution screen-recording demo videos of any web app or browser-based tool with Playwright, with a smooth animated fake cursor, click ripples, smooth scrolling, optional blurred-background title cards between steps, and per-step clips for slides. Use when the user asks to record, screen-capture or make a video/clip/GIF-style demo of a website, web UI, tool or feature for a talk, slide deck, docs, launch or social post, or wants an existing demo recording redone at higher resolution, a different aspect ratio, with a visible cursor, with captions/cards, or split into clips.
---

# Demo videos

Script a real browser session with Playwright, capture it frame by frame at full device resolution, and encode with ffmpeg. The result looks like a Screen Studio recording: crisp UI, a smooth cursor that glides to each target, click ripples, and optional title cards.

Requirements: Node.js, ffmpeg/ffprobe, and [uv](https://docs.astral.sh/uv/) (or any Python 3.9+) for `encode.py`, which has no dependencies.

Bundled files, referred to below as `$SKILL/scripts/...` where `$SKILL` is this skill's directory. Copy the `.js` files into a fresh work dir (they `require("playwright")` from there):

- `scripts/demo-kit.js`: `launch()` returns a `demo` object with `startRecording`, `click`, `type`, `hover`, `moveTo`, `clickAt`, `scrollTo`, `pointIn`, `card`, `finish`.
- `scripts/example-flow.js`: template flow to copy and edit.
- `scripts/encode.py`: `full` (frames to MP4), `clips` (split at cards, with end hold), `sheet` (frame grid at given times), `ends` (last frame of every clip).

## 1. Agree the brief

Ask only what you can't default, in one round:

- **Target:** URL or local build. Check the features to demo actually exist there before recording (load the page and query the DOM). If a feature is missing or looks broken, stop and say so; never fake it.
- **Output size and aspect:** where it will be shown. Default 3840×2160 (4K, 16:9). Slides often want a custom frame (e.g. 3456×1600); record at that size directly instead of cropping.
- **UI zoom:** `cssWidth` sets how big the UI looks. 1280 CSS px across a 4K frame is chunky and projector-friendly; 1920 shows more. Stay above the app's mobile breakpoint or the layout changes.
- **Title cards:** recorded into the video, or none (the user adds titles on slides). Card text is editable in the flow script.
- **Clips:** one clip per step for click-through slides? Hold the last frame at the end (default 120s), because some players (e.g. Claude Design) loop video. Mind upload limits of the destination (some slide tools cap videos at around 20 MB).
- **Theme:** `colorScheme: "dark" | "light"`, or click the app's own toggle.
- **Destination folder** for final files.

## 2. Set up

```bash
W=<a scratch dir> && mkdir -p $W && cd $W
npm init -y >/dev/null && npm i playwright@latest && npx playwright install chromium
cp $SKILL/scripts/demo-kit.js . && cp $SKILL/scripts/example-flow.js flow.js
```

## 3. Write the flow

Edit `flow.js`. Rules that make it look good:

- Drive every interaction through `demo.click/type/hover/moveTo`, never bare `locator.click()`, or the cursor jumps or stays still.
- `demo.type()` clicks near the input's right edge so the cursor doesn't cover the typed text.
- `demo.click()` smoothly scrolls the target into view first. Use `demo.scrollTo(loc, topPx)` to frame a whole region (e.g. both inputs of a step) before acting.
- **After anything that scrolls the page** (filter buttons, anchor links, re-renders), the content moves under a stationary cursor and can leave it hovering a different button, which looks like an intended action. Follow with `demo.moveTo()` to an empty spot.
- Pace for viewers: about 1–2.5s after each visible change, 55ms per typed key.
- `demo.card(title, sub)` before each step after the first. Cards on the very first step read as obvious and obstructive. Keep titles to 2–5 words plus one short subtitle.
- Code editors (Monaco etc.): use the editor's API to find screen coordinates (`getScrolledVisiblePosition`), then `demo.clickAt()`; paste through `editor.trigger("keyboard", "paste", { text })`.
- Do setup (waiting for editors, dismissing cookie banners) before `startRecording()`, unless dismissing it is part of the story.

Dry run first (`node flow.js`, no frames saved) until it completes and `dryrun-end.png` shows the expected final state.

## 4. Record and encode

```bash
node flow.js --record                      # with cards
uv run $SKILL/scripts/encode.py full . demo.mp4

node flow.js --record --no-cards           # cards become 1s pauses + markers in marks.json
uv run $SKILL/scripts/encode.py full . demo-no-cards.mp4
uv run $SKILL/scripts/encode.py clips . demo-no-cards.mp4 clips --hold 120 --first-title "Fill in the form"
```

Each `--record` run overwrites `frames/`, `frames.txt` and `marks.json`, so encode (or copy `marks.json`) before the next run. Clips come from the no-cards run so cut points fall on the pauses.

Long holds and 4K encodes can take minutes: run them with `run_in_background`, not a foreground command that times out.

## 5. Verify before handing over

Look at the frames yourself; don't report success from file sizes alone.

```bash
uv run $SKILL/scripts/encode.py sheet demo.mp4 check.png 2.5 8 14 20 27 --cols 2   # key moments
uv run $SKILL/scripts/encode.py ends clips ends.png                                   # what each clip freezes on
ffmpeg -v error -sseof -0.3 -i demo.mp4 -frames:v 1 -vf "crop=1400:900:2400:700" crop.png  # full-res sharpness
```

Check that each step's result is fully in frame (not clipped at an edge), the cursor isn't parked over a misleading control, cards are readable, the frame size is exact (`ffprobe`), and clip ends show the outcome. Fix the flow and re-record rather than patching in post.

Report: files with size, duration and resolution; card or clip titles (useful as slide titles); anything that looked off.

## How it works, and the traps

- **Don't use Playwright's `recordVideo`.** It records at CSS pixel size, ignores `deviceScaleFactor`, and has a low bitrate, so text is soft at any upscaled size.
- **Frames come from CDP `Page.startScreencast`.** The default headless shell also ignores the device scale factor here. `launch()` uses `channel: "chromium"` (new headless) plus `--force-device-scale-factor`, which gives true device-pixel frames. A headed browser on a Retina screen also works, but at the display's scale.
- **The scale factor can be fractional.** `launch()` picks a `cssWidth` near the requested one so `cssWidth × outH/outW` is a whole number, then sets `dsf = outW / cssWidth`. Example: 3456×1600 with a 1458×675 viewport at 2.370x.
- **The screencast only emits frames when something changes** (about 60fps in motion, none when idle). `frames.txt` is an ffmpeg concat list with per-frame durations taken from the frame timestamps; `encode.py full` resamples to constant 60fps.
- **The cursor is a DOM element** with CSS-transition movement (duration scales with distance, 0.38–1s) and an ease-in-out curve. The real mouse moves to the same point on arrival, so hover states and tooltips still fire. The cursor has a lower z-index than the card overlay, so cards blur it with the page.
- **Hold frames:** `trim` + `tpad=stop_mode=clone`. Don't cut with output `-ss/-to`: `-to` also truncates the padded hold. A static 4K hold costs roughly 75 KB/s (2 minutes ≈ 9–10 MB on top of the action).
- **Homebrew ffmpeg may lack `drawtext`,** so don't rely on burned-in labels for contact sheets.
- **Shell gotchas:** if `cp`/`mv` are aliased to `-i`, a non-interactive command hangs on the overwrite prompt; use `/bin/cp -f`. zsh doesn't word-split `$VAR`, so keep ffmpeg argument lists in Python, not shell variables.
- **Each run uses a fresh browser context,** so dismissed banners and localStorage reset every time. That's what you want for repeatable takes.
