import powerbi from "powerbi-visuals-api";
import { FeedRow } from "./model";

/** "Sum(Fact_VisualFeed.LapTime)" / "Fact_VisualFeed.LapTime" / "LapTime" -> "laptime" */
export function normaliseColumnName(queryName: string | undefined, displayName: string): string {
    const raw = queryName ?? displayName;
    const inner = raw.replace(/^[A-Za-z]+\((.*)\)$/, "$1");
    const last = inner.includes(".") ? inner.substring(inner.lastIndexOf(".") + 1) : inner;
    return last.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const REQUIRED_COLUMNS = ["recordtype", "raceid", "driverid", "lapnumber", "lapstart"];

/** Convert the table DataView into generic records keyed by normalised column name. */
export function parseDataView(dv: powerbi.DataView | undefined): { rows: FeedRow[]; missing: string[] } {
    const table = dv?.table;
    if (!table || !table.columns?.length) return { rows: [], missing: REQUIRED_COLUMNS };
    const names = table.columns.map(c => normaliseColumnName(c.queryName, c.displayName));
    const missing = REQUIRED_COLUMNS.filter(r => !names.includes(r));
    const rows: FeedRow[] = new Array(table.rows?.length ?? 0);
    (table.rows ?? []).forEach((r, i) => {
        const o: FeedRow = {};
        for (let c = 0; c < names.length; c++) {
            const v = r[c];
            o[names[c]] = v === undefined ? null : (v as string | number | null);
        }
        rows[i] = o;
    });
    return { rows, missing };
}
