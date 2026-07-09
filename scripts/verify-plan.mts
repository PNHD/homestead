import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeMaterialFlows, computeServe, computeSkillUsage, computeSummary, effectiveFarmFields, surplusTradeByProduct } from "../src/utils/calc.ts";
import { emptyPlan } from "../src/types.ts";
import { normalizePlan } from "../src/utils/storage.ts";

const GAME_DAY_GOURDS = 17_800;
const plan = normalizePlan({
  ...emptyPlan(),
  ...JSON.parse(readFileSync(join(process.cwd(), "scripts", "fixtures", "lv7-user-plan.json"), "utf8")),
});

function assert(ok: boolean, msg: string) {
  if (!ok) throw new Error(msg);
}

const fields = plan.farmLines.reduce((sum, line) => sum + effectiveFarmFields(line.farms), 0);
const serve = computeServe(plan);
const flows = computeMaterialFlows(plan);
const summary = computeSummary(plan, flows);
const usage = computeSkillUsage(plan);
const stockouts = flows.filter((f) => f.status === "stockout").map((f) => f.name);
const trade = surplusTradeByProduct(plan);

assert(plan.homesteadLevel === 7, "fixture should be homestead level 7");
assert(plan.skillSlots.Catering === 7, `Lv7 Catering should migrate to 7, got ${plan.skillSlots.Catering}`);
assert(fields === 4, `four 16-plot crops should count as 4 fields, got ${fields}`);
assert(usage.find((u) => u.job === "Catering")?.over === false, "7 catering lines should fit Lv7 capacity");
assert(summary.revenuePerDay > 0 && summary.profitPerDay > 0, "plan should produce positive revenue");

console.log("Lv7 fixture check");
console.log("fields", fields, "cateringSlots", plan.skillSlots.Catering, "serveLines", plan.serveLines.length);
console.log("catering/day", (serve.innIncomePerHr * 24).toFixed(0));
console.log("trade/day", (Object.values(trade).reduce((s, v) => s + v, 0) * 24).toFixed(0));
console.log("revenue/day", summary.revenuePerDay.toFixed(0));
console.log("profit/day", summary.profitPerDay.toFixed(0));
console.log("game/day", GAME_DAY_GOURDS, "app gross delta", `${(((summary.revenuePerDay - GAME_DAY_GOURDS) / GAME_DAY_GOURDS) * 100).toFixed(1)}%`);
console.log("stockouts", stockouts.length ? stockouts.join(", ") : "none");
