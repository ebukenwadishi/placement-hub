// Retakes the app screenshots used on the website (site/img/*.webp).
// Run with: npm run screenshots   (after big visual changes to the app)
// Each one is the real app at phone size (390 wide), saved as 600 x 1298 WebP.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { startServer } from './serve.mjs';

const PORT = 4198;
const APP = `http://localhost:${PORT}/app/index.html`;
const at = (h, m) => { const t = new Date(); t.setHours(h, m, 0, 0); return t; };

const server = await startServer(PORT);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

async function shot(name, who, time, steps) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.install({ time });
  await page.goto(APP);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('placementhub.welcomed.v4', '1'); });
  await page.reload(); await page.waitForTimeout(300);
  await page.click(`[data-demo-login="${who}@placementhub.demo"]`); await page.waitForTimeout(300);
  await steps(page);
  await page.addStyleTag({ content: '#toast{display:none!important}' });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
  const png = (await page.screenshot()).toString('base64');
  const webp = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = 600; c.height = 1298;
    c.getContext('2d').drawImage(img, 0, 0, 600, 1298);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, png);
  await writeFile(new URL(`../site/img/${name}.webp`, import.meta.url), Buffer.from(webp, 'base64'));
  console.log(`Saved site/img/${name}.webp`);
  await ctx.close();
}

try {
  // A support worker's shift at Brookside House
  await shot('shift', 'nia', at(13, 8), async page => {
    await page.click('[data-sheet=startShift]'); await page.waitForTimeout(150);
    await page.click('form[data-form=startShift] input[value="Day"] + span');
    await page.click('form[data-form=startShift] button[type=submit]'); await page.waitForTimeout(400);
  });
  // The manager's home screen
  await shot('manager', 'amira', at(13, 8), async () => {});
  // Jordan's profile
  await shot('profile', 'nia', at(13, 8), async page => {
    await page.evaluate(() => { location.hash = 'person-yp2'; }); await page.waitForTimeout(300);
  });
  // The daily note form
  await shot('note', 'nia', at(13, 8), async page => {
    await page.evaluate(() => { location.hash = 'person-yp2'; }); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.createElement('button'); b.dataset.sheet = 'note'; b.dataset.young = 'yp2'; document.getElementById('app').appendChild(b); b.click(); });
    await page.waitForTimeout(300);
  });
} finally {
  await browser.close();
  server.close();
}
