import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = 'file://' + path.resolve(__dirname, '../index.html');
const MAP = '/tmp/opencode/testmap.png';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' :: ' + name + (detail ? '  ->  ' + detail : ''));
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  defaultViewport: { width: 1600, height: 950 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(APP, { waitUntil: 'load' });
await (await page.$('#fileMap')).uploadFile(MAP);
await page.waitForFunction('document.querySelector("#mapImage").style.display === "block"');
await page.click('#btnAdd');
const vp = await page.$eval('#viewport', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
for (const [fx, fy] of [[0.18,0.22],[0.34,0.30],[0.30,0.55],[0.48,0.68],[0.62,0.35],[0.78,0.55],[0.86,0.25]]) {
  await page.mouse.click(vp.x + vp.w * fx, vp.y + vp.h * fy);
  await new Promise(r => setTimeout(r, 90));
}
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#tbody tr')];
  const set = (tr, c, v) => { const el = tr.querySelector(`[data-col="${c}"]`); if (!el) return;
    if (el.tagName === 'SELECT') { el.value = v; el.dispatchEvent(new Event('change')); }
    else { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('blur')); } };
  const d = [['SM-001','North bed A1','30','CR2032','92','Good','2026-10-02',''],
             ['SM-002','North bed A3','30','CR2032','78','Good','2026-10-02',''],
             ['SM-003','North bed B2','45','AA','15','Needs Battery','2026-09-14',''],
             ['SM-004','Orchard row 2','60','Li-SOCl2 3.6V','64','Good','2026-10-05',''],
             ['SM-005','South trough','30','D cell','8','Needs Battery','2026-08-30',''],
             ['SM-006','South trough','60','D cell','41','Monitor','2026-09-28',''],
             ['SM-007','Greenhouse 2','20','AAA','0','Faulty','2026-09-01','']];
  d.forEach((r, i) => { const tr = rows[i];
    set(tr,'sensorId',r[0]); set(tr,'location',r[1]); set(tr,'depth',r[2]); set(tr,'batteryType',r[3]);
    set(tr,'batteryPct',r[4]); set(tr,'condition',r[5]); set(tr,'lastInspected',r[6]); set(tr,'notes',r[7]); });
});
await new Promise(r => setTimeout(r, 400));

// --- wheel zoom now works even right after a pan animation ---
await page.click('#tbody tr:nth-child(7) td.idx');
await new Promise(r => setTimeout(r, 120));          // mid-animation
const z0 = await page.$eval('#zoomLabel', el => el.textContent);
await page.mouse.move(vp.x + vp.w * 0.3, vp.y + vp.h * 0.3);
await page.mouse.wheel({ deltaY: -200 });
await new Promise(r => setTimeout(r, 400));
const z1 = await page.$eval('#zoomLabel', el => el.textContent);
check('wheel zoom applies during/after a pan animation', z0 !== z1, z0 + ' -> ' + z1);
const z2 = await page.$eval('#zoomLabel', el => el.textContent);
await new Promise(r => setTimeout(r, 400));
check('zoom is stable after animation settles', z2 === await page.$eval('#zoomLabel', el => el.textContent), z2);

// --- keyboard A / Esc toggle correctly from a known state ---
await page.keyboard.press('Escape');  // ensure off
await new Promise(r => setTimeout(r, 100));
const offState = await page.$eval('#viewport', el => el.classList.contains('placing'));
await page.keyboard.press('a');
await new Promise(r => setTimeout(r, 150));
const onState = await page.$eval('#viewport', el => el.classList.contains('placing'));
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 150));
const offAgain = await page.$eval('#viewport', el => el.classList.contains('placing'));
check('A enables placing mode', offState === false && onState === true, `off=${offState} on=${onState}`);
check('Esc disables placing mode', offAgain === false, 'offAgain=' + offAgain);

// --- splitter resizes the table panel (drag left = wider table) ---
const before = await page.$eval('#tablePanel', el => el.getBoundingClientRect().width);
const sp = await page.$eval('#splitter', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(sp.x, sp.y);
await page.mouse.down();
await page.mouse.move(sp.x - 200, sp.y, { steps: 10 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const after = await page.$eval('#tablePanel', el => el.getBoundingClientRect().width);
check('splitter widens the table panel', after > before + 100, Math.round(before) + ' -> ' + Math.round(after));

// dragging back right narrows it again
const sp2 = await page.$eval('#splitter', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(sp2.x, sp2.y);
await page.mouse.down();
await page.mouse.move(sp2.x + 150, sp2.y, { steps: 10 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const after2 = await page.$eval('#tablePanel', el => el.getBoundingClientRect().width);
check('splitter narrows the table panel', after2 < after - 50, Math.round(after) + ' -> ' + Math.round(after2));

// --- table scrolls horizontally inside its panel rather than spilling out ---
const spill = await page.evaluate(() => {
  const panel = document.querySelector('#tablePanel').getBoundingClientRect();
  const tbl = document.querySelector('table').getBoundingClientRect();
  const wrap = document.querySelector('#tableWrap');
  return { tableRight: Math.round(tbl.right), panelRight: Math.round(panel.right),
           canScroll: wrap.scrollWidth > wrap.clientWidth,
           bodyOverflowX: document.body.scrollWidth > innerWidth + 1 };
});
check('page does not overflow horizontally', !spill.bodyOverflowX, JSON.stringify(spill));
check('wide table scrolls inside the panel', spill.canScroll, JSON.stringify(spill));

// --- mobile: header compact, layout stacked ---
await page.setViewport({ width: 414, height: 850 });
await new Promise(r => setTimeout(r, 700));
const mob = await page.evaluate(() => {
  const h = document.querySelector('header').getBoundingClientRect();
  const panel = document.querySelector('#tablePanel').getBoundingClientRect();
  const vpEl = document.querySelector('#viewport').getBoundingClientRect();
  return { headerH: Math.round(h.height), mapH: Math.round(vpEl.height), tableH: Math.round(panel.height),
           stacked: panel.top >= vpEl.bottom - 2, bodyOverflowX: document.body.scrollWidth > innerWidth + 1 };
});
check('mobile header stays compact (<70px)', mob.headerH < 70, JSON.stringify(mob));
check('mobile layout stacks map over table', mob.stacked, JSON.stringify(mob));
check('mobile has no horizontal page overflow', !mob.bodyOverflowX, JSON.stringify(mob));

// --- tablet ---
await page.setViewport({ width: 820, height: 1180 });
await new Promise(r => setTimeout(r, 600));
const tab = await page.evaluate(() => {
  const panel = document.querySelector('#tablePanel').getBoundingClientRect();
  const vpEl = document.querySelector('#viewport').getBoundingClientRect();
  return { stacked: panel.top >= vpEl.bottom - 2, mapH: Math.round(vpEl.height),
           bodyOverflowX: document.body.scrollWidth > innerWidth + 1 };
});
check('tablet layout stacks and fits', tab.stacked && !tab.bodyOverflowX, JSON.stringify(tab));

check('no runtime errors', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter(r => !r.pass);
console.log('\n===== ' + (results.length - failed.length) + '/' + results.length + ' passed =====');
if (failed.length) { failed.forEach(f => console.log('  FAILED: ' + f.name + ' :: ' + f.detail)); process.exit(1); }
