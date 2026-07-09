import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeMaterialFlows, computeServe, computeSkillUsage, computeSummary, effectiveFarmFields, liveInventory, reSync, surplusTradeByProduct } from "../src/utils/calc.ts";
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

const t0 = 1_800_000_000_000;
const liveProbe = { ...plan, inventory: { "Copper Ore": 55 }, trackingSince: t0 };
const copperNet = computeMaterialFlows(liveProbe).find((f) => f.name === "Copper Ore")?.netPerHr ?? 0;
assert(copperNet < 0, "fixture should drain Copper Ore");
assert(liveInventory(liveProbe, t0 + 3_600_000)["Copper Ore"] === Math.max(0, 55 + copperNet), "live inventory should move by net/hr after one hour");
assert(reSync(liveProbe, t0 + 3_600_000).trackingSince === t0 + 3_600_000, "resync should re-anchor inventory time");

console.log("Lv7 fixture check");
console.log("fields", fields, "cateringSlots", plan.skillSlots.Catering, "serveLines", plan.serveLines.length);
console.log("catering/day", (serve.innIncomePerHr * 24).toFixed(0));
console.log("trade/day", (Object.values(trade).reduce((s, v) => s + v, 0) * 24).toFixed(0));
console.log("revenue/day", summary.revenuePerDay.toFixed(0));
console.log("profit/day", summary.profitPerDay.toFixed(0));
console.log("game/day", GAME_DAY_GOURDS, "app gross delta", `${(((summary.revenuePerDay - GAME_DAY_GOURDS) / GAME_DAY_GOURDS) * 100).toFixed(1)}%`);
console.log("stockouts", stockouts.length ? stockouts.join(", ") : "none");
