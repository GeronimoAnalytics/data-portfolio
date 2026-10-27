# F1 Pitwall · Lambiase Edition — Power BI custom visual (React + Canvas)

*English version: [README.en.md](README.en.md).*

```
visual/
├── pbiviz.json · capabilities.json · tsconfig.json · package.json · eslint.config.mjs
├── assets/icon.png · assets/max_radio_rage.mp3      # radio-clip (wordt ge-embed, zie §3)
├── style/visual.less · fonts.less                     # glass pitwall theme (Red Bull-palet) + ingebedde Titillium Web
├── src/
│   ├── visual.ts                                     # IVisual-shim: DataView → fetchMoreData → React
│   ├── components/
│   │   ├── Visual.tsx        # root-app: state, replay, tab-layouts (desktop grid / portrait stack)
│   │   ├── TopBar.tsx        # merk, 6 tabs (Strategy·Telemetry·Pit stop·History·Tyres·Rival), titel, keuzelijsten, Restroom-toggle
│   │   ├── TrackMap.tsx      # neon-baan (Track/Sectors/Speed), DRS, live info-kaart, focus-label, 60 fps auto's
│   │   ├── Leaderboard.tsx   # Race order & tyre life (en Timing tower-variant met sectoren)
│   │   ├── PitWindowPanel.tsx# deg-verlies vs pit loss, voorspeld window, brandstof, plan A/B/C
│   │   ├── TelemetryPanel.tsx# gesynchroniseerde kanalen + Δ-tijd, Raw ↔ Derived Physics, G-G-diagram
│   │   ├── StrategyPanel.tsx # deg vs fuel, projectie, badges, what-if pit loss (Pit stop-tab)
│   │   ├── LapTimeline.tsx   # onderbalk: replay-tijdlijn (sleepbaar), pit window, stops, play/pause/snelheid
│   │   ├── LambiaseCard.tsx  # "Strategy for Lambiase": drie live engineer-calls
│   │   ├── RadioModule.tsx   # [ RADIO MAX ] knop, rev-lights, equalizer (Web Audio analyser)
│   │   ├── Panel.tsx         # glass card-chrome
│   │   └── charts/           # LineChart, Tyre wear, Lap times, Lap chart, Stints, Driver comparison bars
│   ├── data/                 # model, DataView-parser, replay-engine, strategie-model, teamkleuren
│   ├── hooks/                # useReplay (klok), useElementSize (+ canvas helpers)
│   └── audio/                # radioPlayer.ts (new Audio + EQ-keten), radioClip.ts (gegenereerd)
├── scripts/
│   ├── embed-audio.mjs       # mp3 → src/audio/radioClip.ts (data-URI)
│   ├── feed_to_json.py       # Fact_VisualFeed.parquet → harness/feed.json
│   └── build-preview.mjs     # browser-preview buiten Power BI
├── harness/                  # index.html + main.tsx (zelfde React-app, lokale data)
└── dist/*.pbiviz             # het pakket dat je in Power BI importeert
```

## 1. Data: één tabel voor de visual

Een custom visual krijgt één tabel. De ETL maakt daarom **`Fact_VisualFeed`** (zit al in het semantic model):
rijen met `RecordType = L` (rondes: tijden, sectoren, band, brandstof, deg) en `RecordType = T`
(telemetrie van de snelste ronde per coureur, 20 m resolutie: X/Y, kanalen, G-krachten, brake %).
≈ 5–7k rijen per Grand Prix. De visual laadt alles via `fetchMoreData` in blokken van 30k.

## 2. Bouwen (CLI)

Vereist: Node.js 18+ (getest met 22).

```bash
cd visual
npm install
npm install -g powerbi-visuals-tools@7       # levert het `pbiviz` commando
npm run embed-audio -- assets/max_radio_rage.mp3   # optioneel; zonder clip: gesynthetiseerde bleeps
npm run embed-fonts                           # Titillium Web → style/fonts.less (al gedaan, alleen na font-update)
npm run typecheck                             # strikte TypeScript-check
pbiviz package                                # → dist/<guid>.1.0.0.0.pbiviz
```

Snelle UI-preview zonder Power BI:

```bash
python scripts/feed_to_json.py ../data/star/Fact_VisualFeed.parquet
npm run preview
npx http-server harness -p 8080              # open http://localhost:8080
```

## 3. Importeren in Power BI Desktop

1. Refresh het model zodat `Fact_VisualFeed` gevuld is.
2. Deelvenster **Visualizations** → `…` → **Import a visual from a file** → kies `dist/*.pbiviz` → *OK*.
3. Klik het nieuwe icoon, maak de visual groot (bijv. hele pagina 1920×1080).
4. Sleep **alle kolommen van `Fact_VisualFeed`** naar het veld **Pitwall feed**
   (kolommen worden op naam herkend; volgorde maakt niet uit).
5. Optioneel: een **Season-slicer** (Dim_Race[Season]) op de pagina houdt het datavolume laag.
6. Zet in *Format → General* de titel uit; de visual heeft z'n eigen header.

Kan je organisatie geen custom visuals uit bestanden toestaan, dan moet een Power BI-admin dat toestaan
(Admin portal → Tenant settings → *Allow visuals created using the Power BI SDK*).

## 4. Bediening

* **Tabs** bovenin: Strategy (overzicht), Telemetry, Pit stop, History (lap chart + rondetijden + timing tower), Tyres (stints van alle auto's), Rival analysis.
* **Lap timeline** onderin: klik of sleep om door de race te gaan; rode stip = pitstop focus, gele = rivaal, blauw = voorspeld pit window.
* **Play / Pause / Reset**, snelheid **1x · 2x · 5x** (+ 20x / 60x om snel door een race te gaan; 1x = echte tijd).
* **Klik op een auto** (kaart) of een rij = focus-coureur (rood) · **rechtermuisklik** op een rij of de *vs*-keuzelijst = rivaal (geel).
* **Hover in de telemetrie** → crosshair op de baankaart en waarden van beide coureurs.
* **PIT LOSS ±** in Strategy = what-if; *RACE ESTIMATE* zet hem terug op de schatting uit de data.
* **[ Emergency Restroom View ]** → portret-layout zoals de mobiele mockup (tabs, timeline, kaart, top-10, pit window, slijtage, vergelijking, Lambiase-kaart, radio).
* **Strategy for Lambiase** geeft drie calls: pit-target (of "stay out"), het beste plan met tijdsverschil, en defend/attack/watch op basis van de gaps.

## 5. Bekende grenzen

* De **baankaart-replay** plaatst auto's via de rondetijden langs de referentieronde (snelste ronde van de race);
  de pitstraat wordt niet apart getekend (auto's krijgen een "PIT"-label).
* **Telemetrie** = snelste ronde per coureur (zo staat de ETL standaard ingesteld). Voor elke ronde: `F1_TELEMETRY_SCOPE=all`,
  maar dan wordt de feed veel groter.
* De Restroom View is een layout binnen de visual; voor de Power BI-telefoonapp maak je daarnaast een mobiele layout van de pagina.
* **Audio**: de clip zit in het .pbiviz-bestand (≈ 320 KB). Het geluid is van de rechthebbende (F1/omroep) —
  prima voor eigen gebruik, maar deel het pakket niet publiek. `npm run embed-audio -- --clear` haalt hem eruit.

## 6. Strategiemodel en backtest

* **Slijtage d** (s/ronde): helling van brandstofgecorrigeerde rondetijd vs. bandleeftijd in de lopende stint (≥ 5 schone ronden), anders het gemiddelde van het veld op dezelfde compound tot nu toe.
* **Plannen**: voor de resterende ronden worden 0, 1 en 2 extra stops exhaustief doorgerekend (lineaire slijtage, nieuwe set start op leeftijd 0, pit loss uit de data of de what-if). *No stop* valt af zolang de coureur in een droge race nog geen tweede droge compound heeft gebruikt.
* **Pit window** = alle laps voor de eerste stop van het beste plan waarbij het totaal binnen 1,0 s van het optimum blijft.
* **Undercut-dreiging**: de auto erachter wint bij een stop ≈ 2 × d × onze bandleeftijd − 1 s (opwarmen); groter dan de interval → HIGH.
* In regen/intermediates wordt het droge model gepauzeerd.

`npm run backtest` speelt elke echte pitstop in de feed na (3 en 8 ronden vooraf; stops onder SC/VSC uitgesloten).
Op de 8 sample-GP's: de werkelijke stop valt in ~41–46 % van de gevallen in het voorspelde window, gemiddeld ~4,5–5 ronden van het optimum,
en in 14 % zei het model "geen stop meer" terwijl het team wel stopte (vaak undercut-reacties, verkeer of tactiek). Het eerste model (√(2·pitloss/d)) zat op ~8 ronden afwijking.
Grenzen: geen Safety Car-kansen, geen compound-snelheidsverschil, geen verkeer/inhaalkans en geen bandenvoorraad.
