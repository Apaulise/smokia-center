import { AREA_LABEL } from "./schema";
import { OPS_WORK_AREAS, type OpsAreaSummary, type OpsStatusItem } from "./types";

export function summarizeAreas(items: OpsStatusItem[]): OpsAreaSummary[] {
  return OPS_WORK_AREAS.map((area) => {
    const rows = items.filter((item) => item.area === area);
    const done = rows.filter((item) => item.estado === "hecho").length;
    const pending = rows.filter((item) => item.estado === "pendiente").length;
    const blocked = rows.filter((item) => item.estado === "bloqueo").length;
    const agents = Array.from(new Set(rows.map((item) => item.agent)));
    const total = rows.length;
    return {
      area,
      label: AREA_LABEL[area],
      agents: agents.length > 0 ? agents.join(" + ") : "—",
      done,
      pending,
      blocked,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
}
