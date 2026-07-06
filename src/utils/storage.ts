import type { PlanState } from "../types";
import { emptyPlan } from "../types";

const KEY = "wwm-homestead-plan-v1";

export function loadPlan(): PlanState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPlan();
    const parsed = JSON.parse(raw);
    return { ...emptyPlan(), ...parsed };
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
        resolve({ ...emptyPlan(), ...parsed });
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
