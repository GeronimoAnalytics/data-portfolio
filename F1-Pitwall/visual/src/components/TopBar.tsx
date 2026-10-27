import * as React from "react";
import { Driver, Race, Tab } from "../data/model";

export interface TopBarProps {
    races: Race[];
    race: Race;
    season: number;
    onSeason: (s: number) => void;
    onRace: (id: number) => void;
    focus: Driver | undefined;
    compare: Driver | undefined;
    onFocus: (id: string) => void;
    onCompare: (id: string) => void;
    lap: number;
    tab: Tab;
    onTab: (t: Tab) => void;
    restroom: boolean;
    onRestroom: () => void;
    compact?: boolean;
}

const I = (d: string) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
export const TABS: { id: Tab; label: string; title: string; icon: React.ReactNode }[] = [
    { id: "strategy", label: "STRATEGY", title: "RACE STRATEGY", icon: I("M5 4v4m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 4v8m0 0a2 2 0 1 0 0 4M5 12h6a4 4 0 0 0 4-4V6m0 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 10v-4m0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z") },
    { id: "telemetry", label: "TELEMETRY", title: "TELEMETRY", icon: I("M4 17a8 8 0 1 1 16 0M12 17l4-6M7.5 13.5l-1-.6M12 9V8m4.5 5.5 1-.6") },
    { id: "pitstop", label: "PIT STOP", title: "PIT STOP STRATEGY", icon: I("M8 3h8l1 5H7l1-5Zm-2 5h12v4a6 6 0 0 1-12 0V8Zm6 10v3m-4 0h8") },
    { id: "history", label: "HISTORY", title: "RACE HISTORY", icon: I("M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2") },
    { id: "tyres", label: "TYRES", title: "TYRE MANAGEMENT", icon: I("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v5m0 8v5M3 12h5m8 0h5") },
    { id: "rival", label: "RIVAL ANALYSIS", title: "RIVAL ANALYSIS", icon: I("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9a6 6 0 0 1 12 0m1-9a3 3 0 1 0 0-6m2 15a6 6 0 0 0-3-5.2") },
];

export const TopBar: React.FC<TopBarProps> = p => {
    const seasons = React.useMemo(() => [...new Set(p.races.map(r => r.season))].sort(), [p.races]);
    const gps = p.races.filter(r => r.season === p.season);
    const drivers = [...p.race.drivers].sort((a, b) => a.code.localeCompare(b.code));
    const tab = TABS.find(t => t.id === p.tab) ?? TABS[0];
    const gpName = p.race.name.replace(" Grand Prix", " GP").toUpperCase();

    return (
        <header className={`pw-header ${p.compact ? "is-compact" : ""}`}>
            <div className="pw-header__bar">
                {!p.compact && (
                    <div className="pw-brand">
                        <span className="pw-brand__mark" aria-hidden="true"><i /><i /></span>
                        <div className="pw-brand__text">
                            <b>PITWALL</b>
                            <span>DIAGNOSTICS · LAMBIASE EDITION</span>
                        </div>
                    </div>
                )}
                <nav className="pw-tabs" aria-label="Views">
                    {TABS.map(t => (
                        <button key={t.id} className={t.id === p.tab ? "is-on" : ""} onClick={() => p.onTab(t.id)} title={t.label}>
                            {t.icon}
                            <span>{t.label}</span>
                            {t.id === p.tab && <em>Active</em>}
                        </button>
                    ))}
                </nav>
                <button className={`pw-restroom ${p.restroom ? "is-on" : ""}`} onClick={p.onRestroom}
                        title="Toggle portrait view">
                    {p.compact ? "[ Pitwall ]" : p.restroom ? "[ Back to Pitwall ]" : "[ Emergency Restroom View ]"}
                </button>
            </div>

            <div className="pw-titlerow">
                <h1>{tab.title}: <span>{gpName} {p.race.season} - LAP {p.lap}/{p.race.totalLaps}</span></h1>
                <div className="pw-pickers">
                    <label className="pw-pick">
                        <span>Season</span>
                        <select value={p.season} onChange={e => p.onSeason(Number(e.target.value))}>
                            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </label>
                    <label className="pw-pick pw-pick--wide">
                        <span>Grand Prix</span>
                        <select value={p.race.id} onChange={e => p.onRace(Number(e.target.value))}>
                            {gps.map(r => <option key={r.id} value={r.id}>R{r.round} · {r.name.replace(" Grand Prix", "")}</option>)}
                        </select>
                    </label>
                    <label className="pw-pick pw-pick--a">
                        <span>Driver</span>
                        <select value={p.focus?.id ?? ""} onChange={e => p.onFocus(e.target.value)}>
                            {drivers.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
                        </select>
                    </label>
                    <label className="pw-pick pw-pick--b">
                        <span>vs</span>
                        <select value={p.compare?.id ?? ""} onChange={e => p.onCompare(e.target.value)}>
                            {drivers.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
                        </select>
                    </label>
                </div>
            </div>
        </header>
    );
};
