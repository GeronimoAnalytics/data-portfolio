import * as React from "react";
import { CarState } from "../data/raceEngine";
import { EngineerCall } from "../data/strategy";
import { teamName } from "../data/teamColors";

/** "STRATEGY for Lambiase" — the race engineer's three live calls for the focus car. */
export const LambiaseCard: React.FC<{ focus: CarState | undefined; calls: EngineerCall[] }> = ({ focus, calls }) => {
    const d = focus?.driver;
    return (
        <div className="pw-lambiase">
            <h2>STRATEGY <span>for Lambiase</span></h2>
            <div className="pw-lambiase__body">
                <div className="pw-avatar" style={{ ["--team" as string]: d?.color ?? "#3D7BFF" }}>
                    <b>{d?.code ?? "—"}</b>
                    <span>{focus ? `P${focus.pos}` : ""}</span>
                </div>
                <div className="pw-lambiase__calls">
                    {calls.map((c, i) => <span key={i} className={`pw-call pw-call--${c.tone}`}>{c.text}</span>)}
                </div>
            </div>
            {d && <div className="pw-lambiase__team">{d.name} · {teamName(d.constructorId)}</div>}
        </div>
    );
};
