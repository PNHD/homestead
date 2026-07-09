import type { PlanState } from "../types";
import { emptyPlan } from "../types";
import { RETAINERS } from "../data/gameData";

const KEY = "wwm-homestead-plan-v1";
const SHEET_RETAINERS = new Set(RETAINERS.map((r) => r.name));

export function normalizePlan(parsed: Partial<PlanState>, opts: { anchorInventoryNow?: boolean } = {}): PlanState {
  const base = emptyPlan();
  const plan = { ...base, ...parsed, serveLines: parsed.serveLines ?? [] };
  const cleanRetainer = (name?: string) => (name && SHEET_RETAINERS.has(name) ? name : "");
  const skillSlots = { ...plan.skillSlots };
  if (plan.homesteadLevel >= 7 && (plan.industrySlots.Restaurant ?? 0) >= 7 && skillSlots.Catering === 6) {
    skillSlots.Catering = 7;
  }
  // migrate old per-line best-seller flags into the weekly best-seller set
  if ((plan.bestSellers ?? []).length === 0) {
    const marked = new Set<string>();
    for (const l of [...plan.craftLines, ...plan.serveLines]) if (l.bestSeller && l.productName) marked.add(l.productName);
    plan.bestSellers = [...marked];
  }
  return {
    ...plan,
    trackingSince: opts.anchorInventoryNow ? Date.now() : Number(plan.trackingSince) || Date.now(),
    craftLines: plan.craftLines.map((l) => ({ ...l, retainer: cleanRetainer(l.retainer) })),
    serveLines: plan.serveLines.map((l) => ({ ...l, retainer: cleanRetainer(l.retainer) })),
    gatherLines: plan.gatherLines.map((l) => ({ ...l, retainer: cleanRetainer(l.retainer) })),
    retainerLevels: Object.fromEntries(Object.entries(plan.retainerLevels).filter(([name]) => SHEET_RETAINERS.has(name))),
    recruitedOverride: Object.fromEntries(Object.entries(plan.recruitedOverride).filter(([name]) => SHEET_RETAINERS.has(name))),
    skillSlots,
  };
}

export function loadPlan(): PlanState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPlan();
    const parsed = JSON.parse(raw);
    return normalizePlan(parsed);
  } catch {
    return emptyPlan();
  }
}

export function savePlan(plan: PlanState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function exportPlan(plan: PlanState): void {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wwm-homestead-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importPlan(file: File): Promise<PlanState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        resolve(normalizePlan(parsed, { anchorInventoryNow: true }));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}
