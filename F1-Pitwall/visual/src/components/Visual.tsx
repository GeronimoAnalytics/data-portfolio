import * as React from "react";
import { Dataset, MapMode, Tab, TelemetryMode } from "../data/model";
import { leaderLap, raceStateAt } from "../data/raceEngine";
import { engineerCalls, plansAt, strategyAt } from "../data/strategy";
import { PALETTE } from "../data/teamColors";
import { useReplay } from "../hooks/useReplay";
import { DriverCompareBars } from "./charts/DriverCompareBars";
import { PaceChart, PositionChart, TyreWearChart } from "./charts/RaceCharts";
import { StintChart } from "./charts/StintChart";
import { LambiaseCard } from "./LambiaseCard";
import { LapTimeline } from "./LapTimeline";
import { Leaderboard } from "./Leaderboard";
import { Legend, Panel } from "./Panel";
import { PitWindowPanel } from "./PitWindowPanel";
import { RadioModule } from "./RadioModule";
import { StatusBadges, StrategyPanel } from "./StrategyPanel";
import { TelemetryPanel } from "./TelemetryPanel";
import { TopBar } from "./TopBar";
import { TrackMap } from "./TrackMap";

export interface PitwallAppProps {
    dataset: Dataset | null;
    width: number;
    height: number;
    loadingRows?: number | null;
    missingColumns?: string[];
}

type PanelId = "track" | "order" | "timing" | "pit" | "wear" | "trace" | "tele" | "compare" | "stratchart" | "stints" | "positions" | "pace";

/** Desktop grid per tab: [columns, rows, areas]. Areas use the PanelId names. */
const DESKTOP: Record<Tab, [string, string, string[]]> = {
    strategy: ["1.15fr 1.1fr 1.05fr", "1fr 1fr 1fr", ["track order pit", "track order wear", "trace trace compare"]],
    telemetry: ["1fr 2fr", "1fr 1fr", ["track tele", "compare tele"]],
    pitstop: ["1.1fr 1.25fr 1fr", "1fr 1fr", ["pit stratchart order", "wear stratchart order"]],
    history: ["1.5fr 1fr", "1.2fr 1fr", ["positions timing", "pace timing"]],
    tyres: ["1.5fr 1fr", "1.25fr 1fr", ["stints order", "wear order"]],
    rival: ["1fr 1.6fr", "1fr 1fr", ["compare tele", "pace tele"]],
};
/** Portrait ("restroom") stacks per tab. */
const MOBILE: Record<Tab, PanelId[]> = {
    strategy: ["track", "order", "pit", "wear", "compare"],
    telemetry: ["track", "trace", "compare"],
    pitstop: ["pit", "stratchart", "order"],
    history: ["positions", "pace"],
    tyres: ["stints", "wear"],
    rival: ["compare", "pace", "trace"],
};

/** Root component: owns selection + replay state and lays out the pitwall / restroom views. */
export const PitwallApp: React.FC<PitwallAppProps> = props => {
    if (props.loadingRows !== null && props.loadingRows !== undefined) return <Loading rows={props.loadingRows} />;
    if (!props.dataset || props.dataset.races.length === 0) return <Landing missing={props.missingColumns ?? []} />;
    return <Pitwall dataset={props.dataset} width={props.width} height={props.height} />;
};

const Pitwall: React.FC<{ dataset: Dataset; width: number; height: number }> = ({ dataset, width, height }) => {
    const races = dataset.races;
    const [raceId, setRaceId] = React.useState(races[races.length - 1].id);
    const race = races.find(r => r.id === raceId) ?? races[0];
    const replay = useReplay(race.raceEnd);

    const finalOrder = React.useMemo(() => raceStateAt(race, race.raceEnd), [race]);
    const [focusId, setFocusId] = React.useState<string | undefined>(finalOrder[0]?.driver.id);
    const [compareId, setCompareId] = React.useState<string | undefined>(finalOrder[1]?.driver.id);
    const [tab, setTab] = React.useState<Tab>("strategy");
    const [teleMode, setTeleMode] = React.useState<TelemetryMode>("raw");
    const [mapMode, setMapMode] = React.useState<MapMode>("neon");
    const [restroom, setRestroom] = React.useState(false);
    const [hoverDist, setHoverDist] = React.useState<number | null>(null);
    const [pitLossOverride, setPitLossOverride] = React.useState<number | null>(null);

    // Keep focus / compare valid when the race changes (same driver if they raced, else winner / P2).
    // Intentionally keyed on race.id only.
    React.useEffect(() => {
        const ids = new Set(race.drivers.map(d => d.id));
        if (!focusId || !ids.has(focusId)) setFocusId(finalOrder[0]?.driver.id);
        if (!compareId || !ids.has(compareId)) setCompareId(finalOrder[1]?.driver.id);
        setPitLossOverride(null);
        replay.reset();
    }, [race.id]);

    const cars = React.useMemo(() => raceStateAt(race, replay.t), [race, replay.t]);
    const focusCar = cars.find(c => c.driver.id === focusId);
    const focus = race.drivers.find(d => d.id === focusId);
    const compare = race.drivers.find(d => d.id === compareId);
    const strategy = React.useMemo(() => strategyAt(race, cars, focusCar, replay.t, pitLossOverride),
        [race, cars, focusCar, replay.t, pitLossOverride]);
    const plans = React.useMemo(() => plansAt(race, strategy, focusCar?.lap ?? 1), [race, strategy, focusCar?.lap]);
    const calls = React.useMemo(() => engineerCalls(race, cars, focusCar, strategy, plans), [race, cars, focusCar, strategy, plans]);
    const lap = leaderLap(cars, race.totalLaps);

    const onSeason = (s: number) => {
        const list = races.filter(r => r.season === s);
        if (list.length) setRaceId(list[list.length - 1].id);
    };
    const onFocus = (id: string) => { if (id === compareId) setCompareId(focusId); setFocusId(id); };
    const pitWin: [number, number] | null = strategy.windowOpen !== null && strategy.windowClose !== null ? [strategy.windowOpen, strategy.windowClose] : null;
    const duo = (
        <>
            <Legend color={PALETTE.a}>{focus?.code ?? "—"}</Legend>
            <Legend color={PALETTE.b}>{compare?.code ?? "—"}</Legend>
        </>
    );

    const panel = (id: PanelId, mobile: boolean): React.ReactNode => {
        const area = mobile ? undefined : id;
        const cls = mobile ? `pw-m-${id}` : "";
        switch (id) {
            case "track":
                return (
                    <section key={id} className={`pw-card pw-card--track ${cls}`} style={area ? { gridArea: area } : undefined}>
                        <TrackMap race={race} tRef={replay.tRef} focus={focus} compare={compare} focusCar={focusCar}
                                  hoverDist={hoverDist} mode={mapMode} onMode={setMapMode} onSelect={onFocus} compact={mobile} />
                    </section>
                );
            case "order":
                return (
                    <Panel key={id} area={area} className={cls} title="Race order & tyre life" right={<span className="pw-sub">Lap {lap}/{race.totalLaps}</span>}>
                        <Leaderboard race={race} cars={cars} t={replay.t} pitLoss={strategy.pitLoss} focusId={focusId} compareId={compareId}
                                     onFocus={onFocus} onCompare={setCompareId} maxRows={mobile ? 10 : undefined} />
                    </Panel>
                );
            case "timing":
                return (
                    <Panel key={id} area={area} className={cls} title="Timing tower" right={<span className="pw-sub">Gap to leader · sectors</span>}>
                        <Leaderboard race={race} cars={cars} t={replay.t} pitLoss={strategy.pitLoss} focusId={focusId} compareId={compareId}
                                     onFocus={onFocus} onCompare={setCompareId} variant="timing" />
                    </Panel>
                );
            case "pit":
                return (
                    <Panel key={id} area={area} className={`pw-card--pit ${cls}`} title="Pit window strategy (predicted)"
                           right={<span className="pw-sub">{focus?.code}</span>}>
                        {tab !== "pitstop" && <StatusBadges strategy={strategy} />}
                        <PitWindowPanel race={race} focus={focusCar} strategy={strategy} plans={plans} compact={mobile} />
                    </Panel>
                );
            case "wear":
                return (
                    <Panel key={id} area={area} className={cls} title="Tyre wear & degradation" right={<>{duo}<span className="pw-sub">loss vs laps</span></>}>
                        <TyreWearChart race={race} a={focus} b={compare} t={replay.t} window={pitWin} />
                    </Panel>
                );
            case "trace":
            case "tele":
                return (
                    <section key={id} className={`pw-card pw-card--flush ${cls}`} style={area ? { gridArea: area } : undefined}>
                        <TelemetryPanel race={race} a={focus} b={compare} mode={teleMode} onMode={setTeleMode}
                                        hoverDist={hoverDist} onHover={setHoverDist} compact={id === "trace" || mobile} />
                    </section>
                );
            case "compare":
                return (
                    <Panel key={id} area={area} className={cls} title="Driver telemetry comparison" right={duo}>
                        <DriverCompareBars a={focus} b={compare} compact={mobile} />
                    </Panel>
                );
            case "stratchart":
                return (
                    <section key={id} className={`pw-card pw-card--flush ${cls}`} style={area ? { gridArea: area } : undefined}>
                        <StrategyPanel race={race} focus={focusCar} strategy={strategy} t={replay.t}
                                       pitLossOverride={pitLossOverride} onPitLoss={setPitLossOverride} />
                    </section>
                );
            case "stints":
                return (
                    <Panel key={id} area={area} className={cls} title="Tyre strategy" right={<span className="pw-sub">all cars · up to now</span>}>
                        <StintChart race={race} cars={cars} t={replay.t} focusId={focusId} compareId={compareId} onFocus={onFocus} />
                    </Panel>
                );
            case "positions":
                return (
                    <Panel key={id} area={area} className={cls} title="Lap chart" right={<span className="pw-sub">running order per lap</span>}>
                        <PositionChart race={race} t={replay.t} focusId={focusId} compareId={compareId} />
                    </Panel>
                );
            case "pace":
                return (
                    <Panel key={id} area={area} className={cls} title="Lap times" right={duo}>
                        <PaceChart race={race} a={focus} b={compare} t={replay.t} />
                    </Panel>
                );
        }
    };

    const topBar = (compact: boolean) => (
        <TopBar races={races} race={race} season={race.season} onSeason={onSeason} onRace={setRaceId}
                focus={focus} compare={compare} onFocus={onFocus} onCompare={setCompareId} lap={lap}
                tab={tab} onTab={setTab} restroom={restroom} onRestroom={() => setRestroom(!restroom)} compact={compact} />
    );
    const timeline = (compact: boolean) => (
        <LapTimeline race={race} focus={focus} compare={compare} strategy={strategy} t={replay.t}
                     playing={replay.playing} onPlayPause={() => replay.setPlaying(!replay.playing)} onReset={replay.reset}
                     speed={replay.speed} onSpeed={replay.setSpeed} onSeek={replay.seek} compact={compact} />
    );

    // narrow visual (e.g. phone layout in Power BI) -> always portrait
    if (restroom || width < 720) {
        return (
            <div className="pw-root is-restroom" style={{ width, height }}>
                <div className="pw-phone">
                    {topBar(true)}
                    <section className="pw-card pw-m-timeline">{timeline(true)}</section>
                    {MOBILE[tab].map(id => panel(id, true))}
                    <section className="pw-card pw-m-lambiase"><LambiaseCard focus={focusCar} calls={calls} /></section>
                    <section className="pw-card pw-m-radio"><RadioModule channelLabel={`for ${focus?.code ?? "—"}`} lap={lap} compact /></section>
                </div>
            </div>
        );
    }

    const [cols, rows, areas] = DESKTOP[tab];
    return (
        <div className="pw-root" style={{ width, height }}>
            {topBar(false)}
            <main className="pw-grid" style={{ gridTemplateColumns: cols, gridTemplateRows: rows, gridTemplateAreas: areas.map(a => `"${a}"`).join(" ") }}>
                {[...new Set(areas.join(" ").split(" "))].map(id => panel(id as PanelId, false))}
            </main>
            <footer className="pw-bottom">
                <section className="pw-card pw-bottom__lambiase"><LambiaseCard focus={focusCar} calls={calls} /></section>
                <section className="pw-card pw-bottom__timeline">{timeline(false)}</section>
                <section className="pw-card pw-bottom__radio"><RadioModule channelLabel={`for ${focus?.code ?? "—"}`} lap={lap} compact /></section>
            </footer>
        </div>
    );
};

const Loading: React.FC<{ rows: number }> = ({ rows }) => (
    <div className="pw-landing">
        <div className="pw-landing__card">
            <div className="pw-brand__text"><b>PITWALL</b><span>DIAGNOSTICS · LAMBIASE EDITION</span></div>
            <div className="pw-loading"><i /></div>
            <p>Streaming telemetry · {rows.toLocaleString()} rows</p>
        </div>
    </div>
);

const Landing: React.FC<{ missing: string[] }> = ({ missing }) => (
    <div className="pw-landing">
        <div className="pw-landing__card">
            <div className="pw-brand__text"><b>PITWALL</b><span>DIAGNOSTICS · LAMBIASE EDITION</span></div>
            <p>Drag <b>all columns of <code>Fact_VisualFeed</code></b> into the <b>Pitwall feed</b> field well.</p>
            <p className="dim">Tip: add a Season slicer on the page to keep the data volume low (≈5–7k rows per Grand Prix).</p>
            {missing.length > 0 && <p className="warn">Missing: {missing.join(", ")}</p>}
        </div>
    </div>
);
