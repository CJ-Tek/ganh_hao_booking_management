import type { TableStatus } from "@/lib/types";

/** Fill/stroke for Konva table blocks — mirrors floor-map `page.module.css` light theme. */
export const tableStatusKonvaStyle: Record<
  TableStatus,
  { fill: string; stroke: string; label: string }
> = {
  available: {
    fill: "rgba(230, 252, 245, 0.95)",
    stroke: "rgba(32, 201, 151, 0.85)",
    label: "#0d6e56",
  },
  hold: {
    fill: "rgba(255, 251, 230, 0.96)",
    stroke: "rgba(250, 197, 21, 0.9)",
    label: "#7a5c00",
  },
  occupied: {
    fill: "rgba(245, 240, 252, 0.96)",
    stroke: "rgba(151, 112, 215, 0.85)",
    label: "#5b3d8a",
  },
  locked: {
    fill: "rgba(248, 250, 252, 0.96)",
    stroke: "rgba(100, 116, 139, 0.75)",
    label: "#475569",
  },
};

export const mergeGroupKonvaStyle = {
  fill: "rgba(230, 252, 245, 0.35)",
  stroke: "rgba(32, 201, 151, 0.55)",
  dash: [8, 6] as number[],
};

export const pickerSelectionStroke = "#228be6";
export const pickerHoverStroke = "#1c7ed6";
export const pickerDisabledFill = "rgba(226, 232, 240, 0.7)";
export const pickerDisabledStroke = "rgba(148, 163, 184, 0.6)";
