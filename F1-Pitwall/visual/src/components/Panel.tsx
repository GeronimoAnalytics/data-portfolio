import * as React from "react";

/** Glass panel with a title row (all pitwall cards share this chrome). */
export const Panel: React.FC<{
    title: React.ReactNode;
    right?: React.ReactNode;
    className?: string;
    area?: string;
    children: React.ReactNode;
}> = ({ title, right, className, area, children }) => (
    <section className={`pw-card ${className ?? ""}`} style={area ? { gridArea: area } : undefined}>
        <div className="pw-card__head">
            <h2>{title}</h2>
            {right && <div className="pw-card__right">{right}</div>}
        </div>
        <div className="pw-card__body">{children}</div>
    </section>
);

/** Small legend item: coloured dot + label. */
export const Legend: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
    <span className="pw-legend"><i style={{ background: color, boxShadow: `0 0 6px ${color}` }} />{children}</span>
);
