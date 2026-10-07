// Template demo flow. Copy next to demo-kit.js, then replace the URL, selectors and card text.
const { launch } = require("./demo-kit");

(async () => {
  const demo = await launch({
    url: "https://example.com/app",
    outWidth: 3840,
    outHeight: 2160,
    cssWidth: 1280, // smaller = bigger UI on screen; keep above the app's mobile breakpoint
    colorScheme: "dark",
    outDir: __dirname,
  });
  const { page } = demo;

  // Get the page into its starting state before recording (wait for editors, dismiss cookie banners, etc).
  await page.waitForLoadState("networkidle");
  await demo.startRecording();

  // Segment 1 (no card before the first segment; it reads as obvious at the start).
  await demo.click(page.getByRole("button", { name: "Dismiss" }));
  await demo.type(page.getByLabel("Title"), "My first report");
  await page.waitForTimeout(1200);

  // Segment 2
  await demo.card("Jump to any section", "Every option, grouped and documented");
  await demo.click(page.getByRole("link", { name: "Settings" }), 30);
  await page.waitForTimeout(1500);

  // After anything that scrolls the page, park the cursor somewhere neutral so it isn't left hovering a control.
  await demo.moveTo(demo.cssWidth * 0.8, demo.cssHeight * 0.75);
  await page.waitForTimeout(2000);

  await demo.finish();
})();
