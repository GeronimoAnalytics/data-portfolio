/**
 * Browser preview outside Power BI: renders the exact same React app from a JSON export of
 * Fact_VisualFeed (see scripts/feed_to_json.py). Useful for fast UI iteration.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { PitwallApp } from "../src/components/Visual";
import { buildDataset } from "../src/data/buildDataset";
import { FeedRow } from "../src/data/model";
import { normaliseColumnName } from "../src/data/parseDataView";

async function main() {
    const res = await fetch("feed.json");
    const { columns, rows } = await res.json() as { columns: string[]; rows: (string | number | null)[][] };
    const names = columns.map(c => normaliseColumnName(undefined, c));
    const feed: FeedRow[] = rows.map(r => Object.fromEntries(names.map((n, i) => [n, r[i]])));
    const dataset = buildDataset(feed);
    const root = createRoot(document.getElementById("root")!);
    const render = () => root.render(<PitwallApp dataset={dataset} width={window.innerWidth} height={window.innerHeight} loadingRows={null} />);
    window.addEventListener("resize", render);
    render();
}
main();
