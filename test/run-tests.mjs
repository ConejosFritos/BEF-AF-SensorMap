const puppeteer = await import('puppeteer-core');
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP = 'file://' + path.resolve(__dirname, '../index.html');
const MAP = '/tmp/opencode/testmap.png';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS' : 'FAIL') + ' :: ' + name + (detail ? '  ->  ' + detail : ''));
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForFunction('typeof window.__testReady !== "undefined" || true');

  // --- 1. Empty state ---
  const emptyVisible = await page.$eval('#emptyMap', el => getComputedStyle(el).display !== 'none');
  check('empty state visible before map upload', emptyVisible);

  // --- 2. Upload map ---
  const input = await page.$('#fileMap');
  await input.uploadFile(MAP);
  await page.waitForFunction('document.querySelector("#mapImage").style.display === "block"', { timeout: 5000 });
  check('map image loaded and displayed', true);

  const mapName = await page.$eval('#mapName', el => el.textContent);
  check('map name shown in HUD', mapName.includes('testmap.png'), mapName);

  // --- 3. Add markers by clicking the map ---
  await page.click('#btnAdd');
  const placing = await page.$eval('#viewport', el => el.classList.contains('placing'));
  check('add mode engages (cursor/label change)', placing);

  const vp = await page.$eval('#viewport', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  const spots = [
    { x: vp.x + vp.w * 0.25, y: vp.y + vp.h * 0.30 },
    { x: vp.x + vp.w * 0.55, y: vp.y + vp.h * 0.55 },
    { x: vp.x + vp.w * 0.75, y: vp.y + vp.h * 0.20 },
  ];
  for (const s of spots) {
    await page.mouse.click(s.x, s.y);
    await new Promise(r => setTimeout(r, 120));
  }

  const markerCount = await page.$$eval('#markerLayer .marker', els => els.length);
  check('3 markers placed on map', markerCount === 3, 'got ' + markerCount);

  const rowCount = await page.$$eval('#tbody tr', els => els.length);
  check('3 rows created in table', rowCount === 3, 'got ' + rowCount);

  // --- 4. Table columns ---
  const headers = await page.$$eval('#theadRow th .sortbtn span:first-child', els => els.map(e => e.textContent));
  const expectedCols = ['#', 'Sensor ID', 'Location / Zone', 'Battery', 'Battery %', 'Condition', 'Last inspected', 'Notes', 'Actions'];
  check('table has expected column set', JSON.stringify(headers) === JSON.stringify(expectedCols), JSON.stringify(headers));
  check('Depth (cm) column removed', !headers.includes('Depth (cm)'), JSON.stringify(headers));

  // --- 5. Edit a cell, verify persistence to state + marker ---
  await page.click('#tbody tr:nth-child(1) .cell-input[data-col="sensorId"]');
  await page.type('#tbody tr:nth-child(1) .cell-input[data-col="sensorId"]', 'SM-014');
  await page.click('#tbody tr:nth-child(1) .cell-input[data-col="location"]');
  await page.type('#tbody tr:nth-child(1) .cell-input[data-col="location"]', 'North bed row 3');
  await new Promise(r => setTimeout(r, 150));

  const tagText = await page.$eval('#markerLayer .marker .tag', el => el.textContent);
  check('edited sensor id propagates to marker label', tagText === 'SM-014', tagText);

  // --- 6. Condition change recolours marker ---
  await page.select('#tbody tr:nth-child(1) select[data-col="condition"]', 'Needs Battery');
  await new Promise(r => setTimeout(r, 150));
  const markerColor = await page.$eval('#markerLayer .marker', el => el.style.getPropertyValue('--c'));
  check('condition change recolours marker (amber)', markerColor === '#d29922', markerColor);

  // --- 7. CORE: click table row -> marker highlighted ---
  await page.click('#tbody tr:nth-child(3) td.idx');
  await new Promise(r => setTimeout(r, 200));
  const selAfterRow = await page.$$eval('#markerLayer .marker', els => els.map(e => e.classList.contains('selected')));
  check('clicking row highlights exactly its marker', selAfterRow.filter(Boolean).length === 1 && selAfterRow[2] === true, JSON.stringify(selAfterRow));
  const rowSel = await page.$$eval('#tbody tr', els => els.map(e => e.classList.contains('selected')));
  check('clicking row highlights that row', rowSel.filter(Boolean).length === 1 && rowSel[2] === true, JSON.stringify(rowSel));

  // --- 8. CORE: click marker -> row highlighted ---
  const markerBox = await page.$eval('#markerLayer .marker:nth-child(2)', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(markerBox.x, markerBox.y);
  await new Promise(r => setTimeout(r, 250));
  const rowSel2 = await page.$$eval('#tbody tr', els => els.map(e => e.classList.contains('selected')));
  check('clicking marker highlights exactly its row', rowSel2.filter(Boolean).length === 1 && rowSel2[1] === true, JSON.stringify(rowSel2));

  // --- 9. Clicking marker does not place a new marker ---
  const markerCount2 = await page.$$eval('#markerLayer .marker', els => els.length);
  check('clicking a marker does not add a new one', markerCount2 === 3, 'got ' + markerCount2);

  // --- 10. Filter chips ---
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#summary .chip')).find(c => c.textContent.includes('Needs battery')).click();
  });
  await new Promise(r => setTimeout(r, 150));
  const filtered = await page.$$eval('#tbody tr', els => els.length);
  check('status filter narrows the table', filtered === 1, 'got ' + filtered);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#summary .chip')).find(c => c.textContent.trim().startsWith('All')).click();
  });
  await new Promise(r => setTimeout(r, 150));

  // --- 11. Search ---
  await page.type('#search', 'SM-014');
  await new Promise(r => setTimeout(r, 200));
  const searched = await page.$$eval('#tbody tr', els => els.length);
  check('search filters rows', searched === 1, 'got ' + searched);
  await page.$eval('#search', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
  await new Promise(r => setTimeout(r, 150));

  // --- 12. Sorting by battery % ---
  await page.$$eval('#tbody tr:nth-child(1) .cell-input[data-col="batteryPct"]', els => {});
  await page.evaluate(() => {
    const set = (n, v) => {
      const el = document.querySelector(`#tbody tr:nth-child(${n}) .cell-input[data-col="batteryPct"]`);
      el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('blur'));
    };
    set(1, '55'); set(2, '12'); set(3, '90');
  });
  await new Promise(r => setTimeout(r, 200));
  const battCol = await page.$$eval('#tbody .cell-input[data-col="batteryPct"]', els => els.map(e => e.value));
  await page.evaluate(() => {
    const th = Array.from(document.querySelectorAll('#theadRow th')).find(t => t.textContent.includes('Battery %'));
    th.querySelector('.sortbtn').click();
  });
  await new Promise(r => setTimeout(r, 200));
  const battSorted = await page.$$eval('#tbody .cell-input[data-col="batteryPct"]', els => els.map(e => e.value));
  check('sort by battery % ascending', JSON.stringify(battSorted) === JSON.stringify(['12', '55', '90']), JSON.stringify(battSorted) + ' (before ' + JSON.stringify(battCol) + ')');

  // --- 13. Drag a marker to a new position ---
  const before = await page.$eval('#markerLayer .marker:nth-child(1)', el => el.style.left);
  const mb = await page.$eval('#markerLayer .marker:nth-child(1)', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(mb.x, mb.y);
  await page.mouse.down();
  await page.mouse.move(mb.x + 120, mb.y + 60, { steps: 12 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 200));
  const after = await page.$eval('#markerLayer .marker:nth-child(1)', el => el.style.left);
  check('marker can be dragged to a new position', before !== after, before + ' -> ' + after);

  // --- 14. Grid toggle ---
  await page.click('#btnGrid');
  await new Promise(r => setTimeout(r, 150));
  const gridOn = await page.$('#gridSvg') !== null;
  check('grid overlay renders', gridOn);

  // --- 15. Zoom ---
  const z0 = await page.$eval('#zoomLabel', el => el.textContent);
  await page.click('#btnZoomIn');
  await new Promise(r => setTimeout(r, 150));
  const z1 = await page.$eval('#zoomLabel', el => el.textContent);
  check('zoom in changes scale', z0 !== z1, z0 + ' -> ' + z1);

  // --- 16. Persistence across reload ---
  await new Promise(r => setTimeout(r, 500));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('document.querySelector("#mapImage").style.display === "block"', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 300));
  const rowsAfterReload = await page.$$eval('#tbody tr', els => els.length);
  const markersAfterReload = await page.$$eval('#markerLayer .marker', els => els.length);
  check('sensors persist across reload', rowsAfterReload === 3, 'rows=' + rowsAfterReload);
  check('map persists across reload', markersAfterReload === 3, 'markers=' + markersAfterReload);
  const sidAfterReload = await page.$eval('#tbody .cell-input[data-col="sensorId"]', el => el.value);
  check('edited values persist across reload', sidAfterReload === 'SM-014', sidAfterReload);

  // --- 17. CSV export ---
  const csv = await page.evaluate(() => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { captured = b; return 'blob:stub'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    document.querySelector('#btnCsv').click();
    URL.createObjectURL = orig;
    HTMLAnchorElement.prototype.click = origClick;
    return captured ? captured.text() : null;
  });
  check('CSV export produces content', !!csv && csv.split('\r\n').length >= 4, csv ? csv.split('\r\n')[0] : 'null');
  check('CSV includes sensor id + battery %', !!csv && csv.includes('SM-014') && csv.includes('Battery %'), '');

  // --- 18. Project JSON export ---
  const proj = await page.evaluate(() => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { captured = b; return 'blob:stub'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    document.querySelector('#btnProject').click();
    URL.createObjectURL = orig;
    HTMLAnchorElement.prototype.click = origClick;
    return captured ? captured.text() : null;
  });
  let projOk = false, projDetail = 'null';
  try {
    const p = JSON.parse(proj);
    projOk = p.points.length === 3 && p.map && p.map.dataUrl && p.map.dataUrl.startsWith('data:image');
    projDetail = 'points=' + p.points.length + ' map=' + !!p.map;
  } catch (e) { projDetail = 'parse fail: ' + e.message; }
  check('project JSON export contains points + map image', projOk, projDetail);

  // --- 19. Standalone HTML export ---
  const html = await page.evaluate(() => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { captured = b; return 'blob:stub'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {};
    document.querySelector('#btnHtml').click();
    URL.createObjectURL = orig;
    HTMLAnchorElement.prototype.click = origClick;
    return captured ? captured.text() : null;
  });
  check('standalone HTML export produced', !!html && html.length > 1000, html ? html.length + ' bytes' : 'null');
  check('standalone HTML embeds data + map', !!html && html.includes('__SOIL_APP_DATA__') && html.includes('data:image'));
  fs.writeFileSync('/tmp/opencode/exported.html', html || '');

  // --- 20. Exported HTML loads standalone and restores everything ---
  const page2 = await browser.newPage();
  const errs2 = [];
  page2.on('pageerror', e => errs2.push(e.message));
  await page2.goto('file:///tmp/opencode/exported.html', { waitUntil: 'load' });
  await page2.waitForFunction('document.querySelector("#mapImage").style.display === "block"', { timeout: 8000 });
  await new Promise(r => setTimeout(r, 400));
  const r2 = await page2.$$eval('#tbody tr', els => els.length);
  const m2 = await page2.$$eval('#markerLayer .marker', els => els.length);
  check('standalone HTML restores table rows', r2 === 3, 'rows=' + r2);
  check('standalone HTML restores markers + map', m2 === 3, 'markers=' + m2);
  const v2 = await page2.$eval('#tbody .cell-input[data-col="sensorId"]', el => el.value);
  check('standalone HTML restores values', v2 === 'SM-014', v2);
  await page2.close();

  // --- 21. Column manager: add + hide ---
  await page.click('#btnCols');
  await page.waitForSelector('#modalBack.show');
  await page.click('#addCol');
  await page.waitForSelector('#modalBack.show');
  await page.evaluate(() => {
    const inp = document.querySelector('#colList .colrow:last-child input[data-name]');
    inp.value = 'Moisture %';
    inp.dispatchEvent(new Event('input'));
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#modalFoot button')).find(b => b.textContent === 'Save').click();
  });
  await new Promise(r => setTimeout(r, 250));
  const headers2 = await page.$$eval('#theadRow th .sortbtn span:first-child', els => els.map(e => e.textContent));
  check('custom column added to table', headers2.includes('Moisture %'), JSON.stringify(headers2));
  // hide a column
  await page.click('#btnCols');
  await page.waitForSelector('#modalBack.show');
  await page.evaluate(() => {
    const cb = document.querySelector('#colList input[data-vis="notes"]');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  await new Promise(r => setTimeout(r, 200));
  const headers3 = await page.$$eval('#theadRow th .sortbtn span:first-child', els => els.map(e => e.textContent));
  check('column can be hidden', !headers3.includes('Notes'), JSON.stringify(headers3));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#modalFoot button')).find(b => b.textContent === 'Cancel').click();
  });

  // --- 22. Delete a row ---
  page.on('dialog', async d => { await d.accept(); });
  await page.click('#tbody tr:nth-child(2) td.acts button.danger');
  await new Promise(r => setTimeout(r, 250));
  const afterDel = await page.$$eval('#tbody tr', els => els.length);
  const afterDelMarkers = await page.$$eval('#markerLayer .marker', els => els.length);
  check('deleting a row removes its marker too', afterDel === 2 && afterDelMarkers === 2, 'rows=' + afterDel + ' markers=' + afterDelMarkers);

  // --- 23. Migration: pre-existing saved data with the removed Depth column ---
  const page3 = await browser.newPage();
  // seed localStorage before the app script runs (a plain reload would be
  // clobbered by the app's own beforeunload auto-save)
  await page3.evaluateOnNewDocument(() => {
    localStorage.setItem('soilSensorTracker.v1', JSON.stringify({
      points: [{ id:'old1', x:0.5, y:0.5, cols:{ sensorId:'OLD-1', depth:'30', condition:'Good' } }],
      columns: [
        { key:'sensorId', label:'Sensor ID', type:'text', width:120, visible:true, locked:true },
        { key:'depth', label:'Depth (cm)', type:'number', width:100, visible:true, locked:true },
        { key:'condition', label:'Condition', type:'select', width:140, visible:true, locked:true, options:['Good','Needs Battery','Faulty','Not Checked'] }
      ],
      gridOn: false, mapMeta: null
    }));
  });
  await page3.goto(APP, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 500));
  const migHeaders = await page3.$$eval('#theadRow th .sortbtn span:first-child', els => els.map(e => e.textContent));
  check('removed column is dropped from saved settings', !migHeaders.includes('Depth (cm)'), JSON.stringify(migHeaders));
  check('other saved columns survive the migration', migHeaders.includes('Sensor ID') && migHeaders.includes('Condition'), JSON.stringify(migHeaders));
  const migRows = await page3.$$eval('#tbody tr', els => els.length);
  check('saved rows survive the migration', migRows === 1, 'rows=' + migRows);
  const migVal = await page3.$eval('#tbody .cell-input[data-col="sensorId"]', el => el.value);
  check('saved row values survive the migration', migVal === 'OLD-1', migVal);
  await page3.close();

  // --- 24. No runtime errors ---
  check('no page errors during run', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.pass);
  console.log('\n===== ' + (results.length - failed.length) + '/' + results.length + ' passed =====');
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log('  - ' + f.name + ' :: ' + f.detail)); process.exit(1); }
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
