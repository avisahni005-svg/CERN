// Renders beamline-loop.html to PNG frames: node render.js <outDir> [fps] [onlyTimes,comma,separated]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2], fps = +(process.argv[3] || 60);
  const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, 'beamline-loop.html') + '?capture');
  const dur = await page.evaluate(() => window.DURATION);
  const times = only || Array.from({ length: Math.round(dur * fps) }, (_, i) => i / fps);
  for (let i = 0; i < times.length; i++) {
    await page.evaluate(t => window.render(t), times[i]);
    await page.screenshot({ path: `${out}/f${String(i).padStart(5, '0')}.png` });
  }
  await browser.close();
  console.log('frames', times.length, 'duration', dur);
})();
