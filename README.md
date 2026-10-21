# Soil Sensor Tracker

A single-file, offline web app for tracking soil sensors on a plot map.

**Open `index.html` in any browser** — no server, no build, no internet needed.
It also works as a PWA-style portable file: use **Export HTML** to produce a single
self-contained `.html` you can email, put on a memory stick, or open on a phone offline.

## Using it

1. **Upload map** — load a plot map, drone photo or hand-drawn sketch.
   You can also drop an image straight onto the map, or paste one with `Ctrl`+`V`.
2. **＋ Add sensor** — then click the map where that sensor sits.
   Press `Esc` to stop placing. Drag any marker to nudge it into position.
3. **Click a table row** → the matching marker on the map is highlighted and panned into view.
   **Click a marker** → the matching table row is highlighted and scrolled into view.
4. Fill in the condition columns, then **Export CSV** for Excel or **Save project**
   for a JSON file containing the map and every sensor.

### Keyboard

| Key | Action |
| --- | --- |
| `A` | toggle add-sensor mode |
| `Esc` | cancel add mode / clear selection |
| `F` | fit map to window |
| `G` | toggle coordinate grid |
| `←` `→` | previous / next sensor |
| `Delete` | delete selected sensor |

## Map controls

Scroll to zoom at the cursor, drag to pan, pinch on touch screens.
Drag the divider between the map and the table to resize either side.

## Columns

Seven built-in columns suit a battery check (Sensor ID, Location/Zone, Battery,
Battery %, Condition, Last inspected, Notes). **Columns** lets you rename, hide, or add
your own (moisture, soil temperature, firmware…) and turn a column into a dropdown.

`Condition` drives the marker colour: green = good, amber = needs battery,
red = faulty, grey = not checked. The **Battery ≤ 20%** chip filters on battery level.

## Storage

Everything auto-saves to the browser (map image in IndexedDB, data in localStorage).
Use **Save project** (JSON) to move between machines or back up before clearing browser data.

## Tests

Requires `puppeteer-core` and a local Chrome.

```bash
npm install puppeteer-core
node test/run-tests.mjs      # 39 functional tests
node test/layout-audit.mjs   # 13 layout / interaction tests
```
