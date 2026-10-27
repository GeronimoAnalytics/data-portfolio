/** Livery colours per Jolpica constructorId (seasons 2023-2025). Unknown teams fall back to grey. */
const TEAM_COLORS: Record<string, string> = {
    red_bull: "#3671C6",
    ferrari: "#E8002D",
    mercedes: "#27F4D2",
    mclaren: "#FF8000",
    aston_martin: "#229971",
    alpine: "#FF87BC",
    williams: "#64C4FF",
    rb: "#6692FF",
    alphatauri: "#5E8FAA",
    sauber: "#52E252",
    alfa: "#C92D4B",
    haas: "#B6BABD",
};

export function teamColor(constructorId: string): string {
    return TEAM_COLORS[constructorId] ?? "#8A94A6";
}

export const COMPOUND_COLORS: Record<string, string> = {
    SOFT: "#FF3333",
    MEDIUM: "#FFD400",
    HARD: "#F2F2F2",
    INTERMEDIATE: "#39B54A",
    WET: "#1E8BFF",
    UNKNOWN: "#7A8AA6",
};

export const COMPOUND_LETTER: Record<string, string> = {
    SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "?",
};

const TEAM_NAMES: Record<string, string> = {
    red_bull: "Red Bull Racing", ferrari: "Ferrari", mercedes: "Mercedes", mclaren: "McLaren",
    aston_martin: "Aston Martin", alpine: "Alpine", williams: "Williams", rb: "RB", alphatauri: "AlphaTauri",
    sauber: "Kick Sauber", alfa: "Alfa Romeo", haas: "Haas",
};
export function teamName(constructorId: string): string {
    return TEAM_NAMES[constructorId] ?? constructorId.replace(/_/g, " ");
}

/** Pitwall palette (Red Bull Racing inspired) shared by canvas/SVG drawing code. */
export const PALETTE = {
    navy: "#0B1640", red: "#E4002B", yellow: "#FFC906", blue: "#3D7BFF", neon: "#5B95FF",
    a: "#FF2B4F", b: "#FFC906", text: "#EAF0FF", muted: "#8B9BC6", dim: "#56648C", grid: "rgba(120,150,230,0.12)",
    green: "#2BE38B", amber: "#FF9F1C",
};
