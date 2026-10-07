#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Encode demo-kit recordings.

  uv run encode.py full  WORKDIR OUT.mp4
  uv run encode.py clips WORKDIR SOURCE.mp4 OUTDIR [--hold SECONDS] [--first-title "Intro"]
  uv run encode.py sheet VIDEO.mp4 OUT.png T1 T2 ... [--width 960] [--cols 2]
  uv run encode.py ends  CLIPDIR OUT.png      (last frame of every clip, before any hold)

`full` turns WORKDIR/frames.txt (variable frame timing from the screencast) into constant 60fps H.264.
`clips` cuts SOURCE at WORKDIR/marks.json and freezes each clip's last frame for --hold seconds
(players that loop video otherwise jump back to the start).
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]


def ff(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def probe(path, entries="format=duration"):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", entries, "-of", "default=nw=1:nk=1", str(path)])
    return out.decode().split()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def full(a):
    ff("-f", "concat", "-safe", "0", "-i", str(Path(a.workdir) / "frames.txt"), "-vf", "fps=60", *X264, a.out)
    w, h, d = probe(a.out, "stream=width,height:format=duration")
    print(f"{a.out}: {w}x{h}, {float(d):.1f}s, {Path(a.out).stat().st_size / 1e6:.1f} MB")


def clips(a):
    marks = json.loads((Path(a.workdir) / "marks.json").read_text())
    if not marks:
        sys.exit("marks.json is empty: call demo.card() between segments")
    dur = float(probe(a.source)[0])
    cuts = [0.0] + [m["t"] for m in marks] + [dur]
    names = [a.first_title] + [m["title"] for m in marks]
    Path(a.outdir).mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names):
        out = Path(a.outdir) / f"{i + 1:02d}-{slug(name)}.mp4"
        # trim (not -ss/-to output options): -to would also cut off the tpad hold.
        vf = f"trim=start={cuts[i]:.3f}:end={cuts[i + 1]:.3f},setpts=PTS-STARTPTS"
        if a.hold > 0:
            vf += f",tpad=stop_mode=clone:stop_duration={a.hold}"
        ff("-i", a.source, "-vf", vf, *X264, str(out))
        print(f"{out.name}: action {cuts[i + 1] - cuts[i]:.1f}s, {out.stat().st_size / 1e6:.1f} MB")


def grid(images, out, cols, width):
    inputs = []
    for img in images:
        inputs += ["-i", str(img)]
    n = len(images)
    if n == 1:
        ff(*inputs, "-vf", f"scale={width}:-1", out)
        return
    scaled = "".join(f"[{i}:v]scale={width}:-1[s{i}];" for i in range(n))
    layout = "|".join(
        f"{'+'.join(['w0'] * (i % cols)) or '0'}_{'+'.join(['h0'] * (i // cols)) or '0'}" for i in range(n)
    )
    labels = "".join(f"[s{i}]" for i in range(n))
    ff(*inputs, "-filter_complex", f"{scaled}{labels}xstack=inputs={n}:layout={layout}:fill=black", out)


def sheet(a):
    tmp = Path(a.out).with_suffix("")
    tmp.mkdir(exist_ok=True)
    imgs = []
    for i, t in enumerate(a.times):
        p = tmp / f"{i:02d}.png"
        ff("-ss", str(t), "-i", a.video, "-frames:v", "1", str(p))
        imgs.append(p)
    grid(imgs, a.out, a.cols, a.width)
    print(a.out)


def ends(a):
    tmp = Path(a.out).with_suffix("")
    tmp.mkdir(exist_ok=True)
    imgs = []
    for clip in sorted(Path(a.clipdir).glob("*.mp4")):
        p = tmp / f"{clip.stem}.png"
        ff("-sseof", "-0.5", "-i", str(clip), "-frames:v", "1", "-update", "1", str(p))
        imgs.append(p)
    grid(imgs, a.out, a.cols, a.width)
    print(a.out)


p = argparse.ArgumentParser()
sub = p.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("full")
s.add_argument("workdir")
s.add_argument("out")
s.set_defaults(fn=full)
s = sub.add_parser("clips")
s.add_argument("workdir")
s.add_argument("source")
s.add_argument("outdir")
s.add_argument("--hold", type=float, default=120)
s.add_argument("--first-title", default="Intro")
s.set_defaults(fn=clips)
s = sub.add_parser("sheet")
s.add_argument("video")
s.add_argument("out")
s.add_argument("times", nargs="+", type=float)
s.add_argument("--width", type=int, default=960)
s.add_argument("--cols", type=int, default=2)
s.set_defaults(fn=sheet)
s = sub.add_parser("ends")
s.add_argument("clipdir")
s.add_argument("out")
s.add_argument("--width", type=int, default=960)
s.add_argument("--cols", type=int, default=2)
s.set_defaults(fn=ends)
args = p.parse_args()
args.fn(args)
