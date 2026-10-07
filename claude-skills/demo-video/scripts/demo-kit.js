// Helpers for recording polished browser demo videos with Playwright.
// Copy this file next to your flow script (it requires "playwright" from there).
//
//   node flow.js              dry run, no frames saved
//   node flow.js --record     save frames + frames.txt + marks.json into outDir
//   node flow.js --record --no-cards   cards become short pauses (segment markers only)

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CARD_CSS = `
#demo-card-bg { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center;
  background: rgba(10, 8, 20, 0.35); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  opacity: 0; transition: opacity 450ms ease; }
#demo-card-bg.show { opacity: 1; }
#demo-card { background: #fff; color: #160f26; border-radius: 18px; padding: 36px 52px; max-width: 760px; text-align: center;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45); transform: translateY(14px) scale(0.98); transition: transform 450ms ease;
  font-family: Inter, system-ui, -apple-system, sans-serif; }
#demo-card-bg.show #demo-card { transform: none; }
#demo-card h1 { margin: 0; font-size: 40px; font-weight: 700; letter-spacing: -0.01em; }
#demo-card p { margin: 14px 0 0; font-size: 22px; color: #4d4466; line-height: 1.4; }
`;

// Runs in the page. The cursor sits below the card overlay (z-index) so cards blur it with the page.
function installCursor([x, y]) {
  const svg = `<svg width="30" height="30" viewBox="0 0 24 24" style="position:absolute;left:-4px;top:-2.4px;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">
    <path d="M4 2.4 L4 20 L8.6 15.6 L11.6 22.4 L14.6 21.1 L11.7 14.5 L18 14.3 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const css = `#fake-cursor { position: fixed; left: 0; top: 0; z-index: 99990; pointer-events: none; will-change: transform;
      transition-property: transform; transition-timing-function: cubic-bezier(0.45, 0, 0.2, 1); }
    #fake-cursor .arrow { position: absolute; transition: transform 120ms ease; transform-origin: 0 0; }
    #fake-cursor.down .arrow { transform: scale(0.82); }
    .fake-ripple { position: fixed; z-index: 99989; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.85); background: rgba(255,255,255,0.18); animation: fake-ripple 520ms ease-out forwards; }
    @keyframes fake-ripple { from { transform: scale(0.2); opacity: 1; } to { transform: scale(1.25); opacity: 0; } }`;
  const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  const el = document.createElement("div"); el.id = "fake-cursor"; el.innerHTML = `<div class="arrow">${svg}</div>`;
  document.documentElement.appendChild(el);
  el.style.transform = `translate(${x}px, ${y}px)`;
  window.__cur = {
    move(nx, ny) {
      const d = Math.round(Math.min(1000, Math.max(380, 280 + Math.hypot(nx - x, ny - y) * 0.85)));
      el.style.transitionDuration = d + "ms";
      el.style.transform = `translate(${nx}px, ${ny}px)`;
      x = nx; y = ny;
      return d;
    },
    down() {
      el.classList.add("down");
      const r = document.createElement("div"); r.className = "fake-ripple"; r.style.left = x + "px"; r.style.top = y + "px";
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    },
    up() { el.classList.remove("down"); },
  };
}

// Screencast frames are only exact when cssWidth * (outH / outW) is a whole number.
function pickCssSize(outW, outH, cssWidth) {
  for (let delta = 0; delta < 400; delta++) {
    for (const w of [cssWidth + delta, cssWidth - delta]) {
      if (w > 0 && (outH * w) % outW === 0) return { w, h: (outH * w) / outW };
    }
  }
  throw new Error(`No CSS width near ${cssWidth} maps exactly onto ${outW}x${outH}`);
}

async function launch({
  url,
  outWidth = 3840,
  outHeight = 2160,
  cssWidth = 1280,
  colorScheme = "light",
  outDir = process.cwd(),
  record = process.argv.includes("--record"),
  cards = !process.argv.includes("--no-cards"),
  waitUntil = "networkidle",
} = {}) {
  const css = pickCssSize(outWidth, outHeight, cssWidth);
  if (css.w !== cssWidth) console.log(`cssWidth ${cssWidth} -> ${css.w} so frames land exactly on ${outWidth}x${outHeight}`);
  const dsf = outWidth / css.w;
  // The default headless shell ignores deviceScaleFactor for screencasts; the new headless mode + this flag does not.
  const browser = await chromium.launch({ channel: "chromium", args: [`--force-device-scale-factor=${dsf}`] });
  const ctx = await browser.newContext({ viewport: { width: css.w, height: css.h }, deviceScaleFactor: dsf, colorScheme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERR", e.message));
  if (url) await page.goto(url, { waitUntil });

  const frameDir = path.join(outDir, "frames");
  const frames = [];
  const marks = [];
  let cdp;
  let cursorReady = false;
  const t0 = Date.now();

  const demo = {
    page, ctx, browser, cssWidth: css.w, cssHeight: css.h, record, cards,

    async installCursor(x = css.w * 0.6, y = css.h * 0.6) {
      await page.evaluate(installCursor, [x, y]);
      await page.mouse.move(x, y);
      cursorReady = true;
    },

    async startRecording() {
      if (!cursorReady) await demo.installCursor();
      if (!record) return;
      fs.rmSync(frameDir, { recursive: true, force: true });
      fs.mkdirSync(frameDir, { recursive: true });
      cdp = await ctx.newCDPSession(page);
      cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
        const f = path.join(frameDir, `${String(frames.length).padStart(6, "0")}.jpg`);
        frames.push({ f, t: metadata.timestamp });
        fs.writeFile(f, Buffer.from(data, "base64"), () => {});
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: outWidth, maxHeight: outHeight, everyNthFrame: 1 });
      await page.waitForTimeout(800);
    },

    async moveTo(x, y) {
      const d = await page.evaluate(([x, y]) => window.__cur.move(x, y), [x, y]);
      await page.waitForTimeout(d + 40);
      await page.mouse.move(x, y);
    },

    async clickAt(x, y) {
      await demo.moveTo(x, y);
      await page.waitForTimeout(80);
      await page.evaluate(() => window.__cur.down());
      await page.mouse.down();
      await page.waitForTimeout(110);
      await page.mouse.up();
      await page.evaluate(() => window.__cur.up());
      await page.waitForTimeout(150);
    },

    // Smoothly scroll the window so `loc` is visible. With `top`, put its top edge at that y;
    // otherwise only scroll if it is not fully on screen, centring it.
    async scrollTo(loc, top) {
      const moved = await loc.evaluate((el, top) => {
        const r = el.getBoundingClientRect();
        if (top === undefined) {
          if (r.top >= 90 && r.bottom <= innerHeight - 20) return false;
          top = Math.max(90, (innerHeight - r.height) / 2);
        }
        if (Math.abs(r.top - top) < 4) return false;
        window.scrollBy({ top: r.top - top, behavior: "smooth" });
        return true;
      }, top);
      if (moved) await page.waitForTimeout(900);
    },

    // Point inside `loc`: centre by default; dx/dy offsets from its top-left, negative dx from its right edge.
    async pointIn(loc, dx, dy) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      const ox = dx === undefined ? b.width / 2 : dx < 0 ? b.width + dx : dx;
      return [b.x + ox, b.y + (dy ?? b.height / 2)];
    },

    async hover(loc, dx, dy) {
      await demo.scrollTo(loc);
      await demo.moveTo(...(await demo.pointIn(loc, dx, dy)));
    },

    async click(loc, dx, dy) {
      await demo.scrollTo(loc);
      await demo.clickAt(...(await demo.pointIn(loc, dx, dy)));
    },

    // Click near the right edge so the cursor doesn't cover the text being typed.
    async type(loc, text, { delay = 55 } = {}) {
      await demo.click(loc, -60);
      await loc.pressSequentially(text, { delay });
    },

    // A title card over a blurred page. With --no-cards it becomes a 1s pause, still recorded as a segment marker.
    async card(title, sub, hold = 2600) {
      if (!cards) {
        await page.waitForTimeout(500);
        marks.push({ title, sub, t: Date.now() / 1000 });
        await page.waitForTimeout(500);
        return;
      }
      marks.push({ title, sub, t: Date.now() / 1000 });
      await page.evaluate(([css, title, sub]) => {
        if (!document.getElementById("demo-card-style")) {
          const s = document.createElement("style"); s.id = "demo-card-style"; s.textContent = css; document.head.appendChild(s);
        }
        const bg = document.createElement("div"); bg.id = "demo-card-bg";
        bg.innerHTML = `<div id="demo-card"><h1></h1>${sub ? "<p></p>" : ""}</div>`;
        bg.querySelector("h1").textContent = title;
        if (sub) bg.querySelector("p").textContent = sub;
        document.body.appendChild(bg);
        requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add("show")));
      }, [CARD_CSS, title, sub]);
      await page.waitForTimeout(450 + hold);
      await page.evaluate(() => document.getElementById("demo-card-bg").classList.remove("show"));
      await page.waitForTimeout(500);
      await page.evaluate(() => document.getElementById("demo-card-bg").remove());
      await page.waitForTimeout(300);
    },

    async finish({ tail = 1500 } = {}) {
      await page.waitForTimeout(tail);
      console.log(`flow done at ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (record) {
        await cdp.send("Page.stopScreencast");
        await page.waitForTimeout(500);
        if (!frames.length) throw new Error("No frames captured");
        const end = frames[frames.length - 1].t + 0.5;
        const lines = frames.map((fr, i) => `file '${fr.f}'\nduration ${((frames[i + 1]?.t ?? end) - fr.t).toFixed(4)}`);
        lines.push(`file '${frames[frames.length - 1].f}'`);
        fs.writeFileSync(path.join(outDir, "frames.txt"), lines.join("\n") + "\n");
        fs.writeFileSync(path.join(outDir, "marks.json"), JSON.stringify(marks.map((m) => ({ ...m, t: m.t - frames[0].t })), null, 1));
        const span = frames[frames.length - 1].t - frames[0].t;
        console.log(`${frames.length} frames over ${span.toFixed(1)}s -> ${outDir}/frames.txt, marks.json`);
      } else {
        await page.screenshot({ path: path.join(outDir, "dryrun-end.png") });
        console.log(`dry run; final state in ${outDir}/dryrun-end.png`);
      }
      await browser.close();
    },
  };
  return demo;
}

module.exports = { launch, pickCssSize };
