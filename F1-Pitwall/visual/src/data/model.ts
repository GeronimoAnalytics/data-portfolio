/**
 * Domain model of the Pitwall visual.
 *
 * The Power BI table (Fact_VisualFeed) is parsed into generic FeedRow records and then
 * folded into this race-centric structure once per data refresh. Everything the UI needs
 * per animation frame (positions, gaps, pit windows) is derived from it by pure functions
 * in raceEngine.ts and strategy.ts.
 */

export type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN";

/** One row of Fact_VisualFeed, keyed by normalised column name (see parseDataView.ts). */
export type FeedRow = Record<string, string | number | null>;

export interface LapRow {
    lap: number;
    /** seconds since lights-out at which this lap started */
    start: number;
    /** seconds since lights-out at which this lap ended (next lap start or start + lapTime) */
    end: number;
    lapTime: number | null;
    s1: number | null;
    s2: number | null;
    s3: number | null;
    compound: Compound;
    tyreAge: number | null;
    stint: number | null;
    pitIn: boolean;
    pitOut: boolean;
    clean: boolean;
    fuelKg: number | null;
    fuelCorr: number | null;
    degPct: number | null;
}

export interface TelSample {
    d: number;       // distance from lap start (m)
    t: number;       // elapsed lap time (s)
    x: number;
    y: number;
    speed: number;
    throttle: number;
    brake: number;   // 0 / 1
    brakePct: number;
    gear: number;
    drs: number;     // 0 / 1
    gLong: number;
    gLat: number;
}

export interface Driver {
    id: string;
    code: string;
    name: string;
    constructorId: string;
    color: string;
    grid: number | null;
    classified: string;
    laps: LapRow[];          // sorted by lap number
    tel: TelSample[];        // fastest lap, sorted by distance
    fastestLapNo: number | null;
    fastestLapTime: number | null;
}

export interface Race {
    id: number;
    season: number;
    round: number;
    name: string;
    circuit: string;
    totalLaps: number;
    pitLoss: number;
    drivers: Driver[];
    /** reference lap (overall fastest lap of the race) used for the track outline & dot placement */
    track: TelSample[];
    trackLength: number;
    /** normalised time -> distance profile of the reference lap, used to place cars on track */
    refFrac: number[];
    refDist: number[];
    /** distance at the end of sector 1 and 2 on the reference lap */
    sectorDist: [number, number];
    /** time at which the last car crosses the line */
    raceEnd: number;
    /** session-best sector times (for purple sectors) */
    bestSector: [number, number, number];
}

export interface Dataset {
    races: Race[];
    rowCount: number;
}

export type TelemetryMode = "raw" | "physics";
export type MapMode = "neon" | "sectors" | "speed";
export type Tab = "strategy" | "telemetry" | "pitstop" | "history" | "tyres" | "rival";
