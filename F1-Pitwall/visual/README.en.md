# F1 Pitwall · Lambiase Edition — Power BI custom visual (React + Canvas)

*Nederlandse versie: [README.md](README.md).*

```
visual/
├── pbiviz.json · capabilities.json · tsconfig.json · package.json · eslint.config.mjs
├── assets/icon.png · assets/max_radio_rage.mp3      # radio clip (gets embedded, see §2)
├── style/visual.less · fonts.less                     # glass pitwall theme (Red Bull palette) + embedded Titillium Web
├── src/
│   ├── visual.ts                                     # IVisual shim: DataView → fetchMoreData → React
│   ├── components/
│   │   ├── Visual.tsx        # root app: state, replay, tab layouts (desktop grid / portrait stack)
│   │   ├── TopBar.tsx        # brand, 6 tabs (Strategy·Telemetry·Pit stop·History·Tyres·Rival), title, pickers, Restroom toggle
│   │   ├── TrackMap.tsx      # neon track (Track/Sectors/Speed), DRS, live info card, focus label, 60 fps cars
│   │   ├── Leaderboard.tsx   # Race order & tyre life (and Timing tower variant with sectors)
│   │   ├── PitWindowPanel.tsx# deg loss vs pit loss, predicted window, fuel, plan A/B/C
│   │   ├── TelemetryPanel.tsx# synchronised channels + Δ time, Raw ↔ Derived Physics, G-G diagram
│   │   ├── StrategyPanel.tsx # deg vs fuel, projection, badges, what-if pit loss (Pit stop tab)
│   │   ├── LapTimeline.tsx   # bottom bar: replay timeline (draggable), pit window, stops, play/pause/speed
│   │   ├── LambiaseCard.tsx  # "Strategy for Lambiase": three live engineer calls
│   │   ├── RadioModule.tsx   # [ RADIO MAX ] button, rev lights, equalizer (Web Audio analyser)
│   │   ├── Panel.tsx         # glass card chrome
│   │   └── charts/           # LineChart, Tyre wear, Lap times, Lap chart, Stints, Driver comparison bars
│   ├── data/                 # model, DataView parser, replay engine, strategy model, team colours
│   ├── hooks/                # useReplay (clock), useElementSize (+ canvas helpers)
│   └── audio/                # radioPlayer.ts (new Audio + EQ chain), radioClip.ts (generated)
├── scripts/
│   ├── embed-audio.mjs       # mp3 → src/audio/radioClip.ts (data URI)
│   ├── embed-fonts.mjs       # Titillium Web → style/fonts.less
│   ├── feed_to_json.py       # Fact_VisualFeed.parquet → harness/feed.json
│   ├── build-preview.mjs     # browser preview outside Power BI
│   └── backtest.ts           # replays every real pit stop against the strategy model
├── harness/                  # index.html + main.tsx (same React app, local data)
└── dist/*.pbiviz             # the package you import into Power BI
```

## 1. Data: one table for the visual

A custom visual receives a single table. The ETL therefore builds **`Fact_VisualFeed`** (already in the semantic model):
rows with `RecordType = L` (laps: times, sectors, tyre, fuel, deg) and `RecordType = T`
(telemetry of each driver's fastest lap at 20 m resolution: X/Y, channels, G-forces, brake %).
≈ 5–7k rows per Grand Prix. The visual loads everything via `fetchMoreData` in blocks of 30k.

## 2. Build (CLI)

Requires Node.js 18+ (tested with 22).

```bash
cd visual
npm install
npm install -g powerbi-visuals-tools@7       # provides the `pbiviz` command
npm run embed-audio -- assets/max_radio_rage.mp3   # optional; without a clip: synthesized beeps
npm run embed-fonts                           # Titillium Web → style/fonts.less (already done; only after a font update)
npm run typecheck                             # strict TypeScript check
pbiviz package                                # → dist/<guid>.1.0.0.0.pbiviz
npm run backtest                              # optional: strategy model vs. real pit stops
```

Quick UI preview without Power BI:

```bash
python scripts/feed_to_json.py ../data/star/Fact_VisualFeed.parquet
npm run preview
npx http-server harness -p 8080              # open http://localhost:8080
```

## 3. Import into Power BI Desktop

1. Refresh the model so `Fact_VisualFeed` is populated.
2. **Visualizations** pane → `…` → **Import a visual from a file** → pick `dist/*.pbiviz` → *OK*.
3. Click the new icon and make the visual large (e.g. a full 1920×1080 page).
4. Drag **all columns of `Fact_VisualFeed`** into the **Pitwall feed** field well
   (columns are matched by name; order does not matter).
5. Optional: a **Season slicer** (Dim_Race[Season]) on the page keeps the data volume low.
6. Turn the title off in *Format → General*; the visual has its own header.

If your organisation blocks custom visuals from files, a Power BI admin has to allow them
(Admin portal → Tenant settings → *Allow visuals created using the Power BI SDK*).

## 4. Controls

* **Tabs** at the top: Strategy (overview), Telemetry, Pit stop, History (lap chart + lap times + timing tower), Tyres (stints of all cars), Rival analysis.
* **Lap timeline** at the bottom: click or drag to move through the race; red dot = focus pit stop, yellow = rival, blue = predicted pit window.
* **Play / Pause / Reset**, speed **1x · 2x · 5x** (+ 20x / 60x to move through a race quickly; 1x = real time).
* **Click a car** (map) or a row = focus driver (red) · **right-click** a row or use the *vs* picker = rival (yellow).
* **Hover in the telemetry** → crosshair on the track map and values for both drivers.
* **PIT LOSS ±** on the Pit stop tab = what-if; *RACE ESTIMATE* resets it to the estimate from the data.
* **[ Emergency Restroom View ]** → portrait layout like the mobile mockup (tabs, timeline, map, top 10, pit window, wear, comparison, Lambiase card, radio). Also switches on automatically below 720 px width.
* **Strategy for Lambiase** gives three calls: pit target (or "stay out"), the best plan with its time difference, and defend/attack/watch based on the gaps.

## 5. Known limits

* The **track map replay** places cars using lap times along the reference lap (fastest lap of the race);
  the pit lane is not drawn separately (cars get a "PIT" label).
* **Telemetry** = each driver's fastest lap (the ETL default). For every lap: `F1_TELEMETRY_SCOPE=all`,
  but the feed gets much larger.
* The Restroom View is a layout inside the visual; for the Power BI phone app you also create a mobile layout of the page.
* **Audio**: the clip is embedded in the .pbiviz (≈ 320 KB). The sound belongs to the rights holder (F1/broadcaster) —
  fine for personal use, but do not share the package publicly. `npm run embed-audio -- --clear` removes it.

## 6. Strategy model and backtest

* **Degradation d** (s/lap): slope of fuel-corrected lap time vs. tyre age in the current stint (≥ 5 clean laps), otherwise the field average on the same compound so far.
* **Plans**: for the remaining laps, 0, 1 and 2 more stops are searched exhaustively (linear degradation, a new set starts at age 0, pit loss from the data or the what-if). *No stop* is excluded while the driver has not yet used a second dry compound in a dry race.
* **Pit window** = every lap for the best plan's first stop where the total stays within 1.0 s of the optimum.
* **Undercut threat**: the car behind gains ≈ 2 × d × our tyre age − 1 s (warm-up) by stopping; more than the interval → HIGH.
* In rain / on intermediates the dry model pauses.

`npm run backtest` replays every real pit stop in the feed (3 and 8 laps ahead; stops under SC/VSC excluded).
On the 8 sample GPs: the real stop falls inside the predicted window in ~41–46 % of cases, on average ~4.5–5 laps from the optimum,
and in 14 % the model said "no more stops" while the team did stop (often undercut reactions, traffic or tactics). The first model (√(2·pitloss/d)) was ~8 laps off.
Limits: no Safety Car probability, no compound pace difference, no traffic/overtaking difficulty and no tyre allocation.
