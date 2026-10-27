/**
 * Power BI entry point (IVisual). Thin shim around the React app in components/Visual.tsx.
 *
 * Data flow:
 *   Power BI table DataView (Fact_VisualFeed, segments of 30k rows)
 *     -> fetchMoreData() until every segment is loaded (aggregateSegments = true)
 *     -> parseDataView()  -> FeedRow[]
 *     -> buildDataset()   -> races / drivers / laps / telemetry
 *     -> <PitwallApp/>
 */
import "./../style/visual.less";

import powerbi from "powerbi-visuals-api";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";

import { PitwallApp } from "./components/Visual";
import { buildDataset } from "./data/buildDataset";
import { Dataset } from "./data/model";
import { parseDataView } from "./data/parseDataView";

import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly root: Root;
    private dataset: Dataset | null = null;
    private missing: string[] = [];
    private loadingRows: number | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        const container = document.createElement("div");
        container.className = "pw-host";
        options.element.appendChild(container);
        this.root = createRoot(container);
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dv = options.dataViews?.[0];
            const dataChanged = (options.type & powerbi.VisualUpdateType.Data) === powerbi.VisualUpdateType.Data;
            if (dataChanged) {
                const rowCount = dv?.table?.rows?.length ?? 0;
                // more segments available -> ask for them and show progress
                if (dv?.metadata?.segment && this.host.fetchMoreData(true)) {
                    this.loadingRows = rowCount;
                } else {
                    this.loadingRows = null;
                    const { rows, missing } = parseDataView(dv);
                    this.missing = missing;
                    this.dataset = missing.length ? null : buildDataset(rows);
                }
            }
            const { width, height } = options.viewport;
            this.root.render(React.createElement(PitwallApp, {
                dataset: this.dataset, width, height, loadingRows: this.loadingRows, missingColumns: this.missing,
            }));
            this.host.eventService.renderingFinished(options);
        } catch (e) {
            this.host.eventService.renderingFailed(options, String(e));
            throw e;
        }
    }

    /** All styling lives inside the visual (pitwall theme); the format pane only shows the default cards. */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return { cards: [] };
    }

    public destroy(): void {
        this.root.unmount();
    }
}
