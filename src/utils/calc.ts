// Revenue / income / material-flow / labor engine.
// Formulas are ported from the official WWM Homestead Planner v2.0 spreadsheet:
//   output/hr   = base_rate(job) * efficiency(retainer level)     (Rates & Efficiency)
//   draw/hr     = output/hr * recipe_amount                       (Queues)
//   revenue/hr  = output/hr * sale_price                          (Weekly Plan / Recipes)
//   profit/hr   = output/hr * (price - input_cost)                (Recipes: Profit/Unit)
// A production line = ONE queue slot worked by ONE retainer. The output rate is
// fixed by that retainer's skill level for the product's job — never typed by hand.

import {
  BASE_RATES,
  EFF_MULT_VERIFIED,
  EFF_MULT_VERIFIED_MAX,
  EFF_MULT_UNKNOWN,
  MYSTIC_JOBS,
  EFF_L6_NO_MYSTIC,
  WORKERS_PER_STATION_L7,
  BEST_SELLER_BONUS,
  PRODUCTS,
  MATERIALS,
  CROPS,
  RETAINERS,
  type Product,
  type Job,
} from "../data/gameData";
import type { CraftLine, ServeLine, PlanState } from "../types";

// ---- lookups -------------------------------------------------------------
export const PRODUCT_BY_NAME: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.name, p])
);
export const CROP_BY_NAME = Object.fromEntries(CROPS.map((c) => [c.name, c]));
export const RETAINER_BY_NAME = Object.fromEntries(RETAINERS.map((r) => [r.name, r]));

/** Raw materials that can be gathered (not crops, not kiln intermediates). */
export const GATHERABLE_MATERIALS = Object.values(MATERIALS).filter(
  (m) => m.job && ["Fishing", "Hunting", "Mining", "Forestry"].includes(m.job)
);

/** A recipe is unlocked once your homestead level reaches its required level. */
export function isUnlocked(p: Product, homesteadLevel: number): boolean {
  return (p.lvl ?? 1) <= homesteadLevel;
}

export type PriceOverrides = Record<string, { inn?: number; trade?: number }>;
export type RetainerLevels = Record<string, Partial<Record<Job, number>>>;

/** Price overrides that are actually in effect (empty when the user turns them off). */
export function activeOverrides(plan: PlanState): PriceOverrides {
  return plan.manualPricesEnabled === false ? {} : plan.priceOverrides;
}

// ---- efficiency ----------------------------------------------------------
export interface Eff {
  mult: number;
  estimated: boolean;
}
export function efficiency(level: number, job?: Job | string): Eff {
  const lv = Math.max(1, Math.round(level));
  const mystic = !!job && MYSTIC_JOBS.includes(job);
  if (lv <= 5) return { mult: EFF_MULT_VERIFIED[lv] ?? 1.02, estimated: false };
  if (lv === EFF_MULT_VERIFIED_MAX) {
    // L6: mystic jobs jump to 125%; Brewing/Catering hold the pre-mystic value.
    return mystic ? { mult: EFF_MULT_VERIFIED[6], estimated: false } : { mult: EFF_L6_NO_MYSTIC, estimated: true };
  }
  // L7-10 not published: hold at the best known value for this job.
  return { mult: mystic ? EFF_MULT_UNKNOWN : EFF_L6_NO_MYSTIC, estimated: true };
}

/** Base output/hr for a job — user's rate override (to match building level) wins over the sheet. */
export function baseRate(job: Job | string, plan?: PlanState): number {
  return plan?.rateOverrides?.[job as Job] ?? BASE_RATES[job] ?? 1;
}

/** Retainers sharing one station for a job at the plan's homestead level (brewing = 2 per still at L7+). */
export function workersPerStation(job: Job | string, plan?: PlanState): number {
  if (plan && plan.homesteadLevel >= 7) return WORKERS_PER_STATION_L7[job] ?? 1;
  return 1;
}

/**
 * Items produced per hour by one retainer at a job & skill level.
 * workersPerStation > 1 (e.g. brewing's 2-per-still at L7+): the station's base output is
 * shared, so each retainer contributes base × (efficiency − (1 − 1/workers)).
 */
export function outputPerHr(job: Job | string, level: number, base = BASE_RATES[job] ?? 1, workersPerStation = 1): number {
  const shared = 1 - 1 / Math.max(1, workersPerStation);
  return base * (efficiency(level, job).mult - shared);
}

/** A retainer's effective skill level for a job — user override wins over the sheet. */
export function retainerJobLevel(name: string, job: Job | undefined, levels?: RetainerLevels): number {
  if (!name || !job) return 0;
  const ov = levels?.[name]?.[job];
  if (ov != null) return ov;
  return RETAINER_BY_NAME[name]?.skills[job] ?? 0;
}

// ---- price ---------------------------------------------------------------
/** Inn Unit Sale Price — automatic passive income (+20% when best-seller). */
export function innPrice(p: Product, bestSeller: boolean, overrides: PriceOverrides = {}): number {
  const base = overrides[p.name]?.inn ?? p.restaurant ?? p.merchant ?? 0;
  return bestSeller ? round(base * (1 + BEST_SELLER_BONUS)) : base;
}
/** Is this product one of this week's selected best-sellers (+20%)? */
export function isWeeklyBest(name: string, plan?: PlanState): boolean {
  return (plan?.bestSellers ?? []).includes(name);
}
/** Trade for Profit Price — manual sale to an NPC (no best-seller bonus). */
export function tradePrice(p: Product, overrides: PriceOverrides = {}): number {
  return overrides[p.name]?.trade ?? p.merchant ?? 0;
}

// ---- per-line economics --------------------------------------------------
export interface CraftLineCalc {
  line: CraftLine;
  product?: Product;
  level: number; // derived from the assigned retainer
  outPerHr: number; // finished items / hr (one slot)
  innPrice: number; // auto sale price
  tradePrice: number; // manual sale price
  revenuePerHr: number; // potential Inn income / hr if this output is catered
  inputCostPerHr: number;
  profitPerHr: number; // potential Inn income - input cost
  estimated: boolean;
  active: boolean; // has a retainer who can make it
}

export function calcCraftLine(line: CraftLine, plan: PlanState): CraftLineCalc {
  const product = PRODUCT_BY_NAME[line.productName];
  const wps = product ? workersPerStation(product.job, plan) : 1;
  const base = product ? baseRate(product.job, plan) : 0;
  // A station may seat >1 retainer (brewing = 2 per still at L7+); each seated worker adds output.
  const seats = wps > 1 ? [line.retainer, line.retainer2 ?? ""] : [line.retainer];
  const seatLevels = product ? seats.map((r) => retainerJobLevel(r, product.job, plan.retainerLevels)).filter((l) => l > 0) : [];
  const level = seatLevels[0] ?? 0;
  const active = !!product && seatLevels.length > 0;
  const outPerHr = product ? seatLevels.reduce((s, lv) => s + outputPerHr(product.job, lv, base, wps), 0) : 0;
  const inn = product ? innPrice(product, line.bestSeller || isWeeklyBest(product.name, plan), activeOverrides(plan)) : 0;
  const trade = product ? tradePrice(product, activeOverrides(plan)) : 0;
  const revenuePerHr = outPerHr * inn;
  const inputCostPerHr = outPerHr * (product?.inputCost ?? 0);
  return {
    line,
    product,
    level,
    outPerHr,
    innPrice: inn,
    tradePrice: trade,
    revenuePerHr,
    inputCostPerHr,
    profitPerHr: revenuePerHr - inputCostPerHr,
    estimated: active ? efficiency(level, product!.job).estimated : false,
    active,
  };
}

// ---- material flow (the "sync") -----------------------------------------
export interface MaterialFlow {
  name: string;
  category: string;
  source: string;
  neededPerHr: number;
  producedPerHr: number;
  netPerHr: number;
  inStock: number;
  runwayH: number; // hours until stockout (Infinity if net >= 0)
  status: "surplus" | "ok" | "draining" | "stockout" | "idle";
}

export function computeMaterialFlows(plan: PlanState): MaterialFlow[] {
  const needed: Record<string, number> = {};
  const produced: Record<string, number> = {};
  const touch = (m: Record<string, number>, k: string, v: number) => {
    m[k] = (m[k] ?? 0) + v;
  };

  // craft lines consume ingredients (and produce their own product)
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.product || !c.active) continue;
    touch(produced, c.product.name, c.outPerHr);
    for (const ing of c.product.ingredients) touch(needed, ing.name, c.outPerHr * ing.amt);
  }
  // gather lines produce raw materials (rate from the assigned retainer's skill)
  for (const g of plan.gatherLines) {
    const mat = MATERIALS[g.materialName];
    if (!mat || !mat.job) continue;
    const level = retainerJobLevel(g.retainer, mat.job, plan.retainerLevels);
    if (level <= 0) continue;
    // Timber (logging) has its own base rate (10/hr); other gather uses the job rate (5/hr).
    const base = BASE_RATES[g.materialName] ?? baseRate(mat.job, plan);
    touch(produced, g.materialName, outputPerHr(mat.job, level, base));
  }
  // farms produce crops
  for (const f of plan.farmLines) {
    const crop = CROP_BY_NAME[f.cropName];
    if (!crop) continue;
    touch(produced, f.cropName, (crop.yieldPerHrFarm ?? 0) * Math.max(0, f.farms));
  }
  // restaurant catering consumes finished dishes/wine and is the only Inn income source.
  for (const item of computeServe(plan).items) touch(needed, item.name, item.servedPerHr);

  // include any item the user tracks stock for, even if not flowing
  const names = new Set([...Object.keys(needed), ...Object.keys(produced), ...Object.keys(plan.inventory)]);
  const flows: MaterialFlow[] = [];
  for (const name of names) {
    const n = needed[name] ?? 0;
    const p = produced[name] ?? 0;
    const net = p - n;
    const inStock = plan.inventory[name] ?? 0;
    const runwayH = net >= 0 ? Infinity : inStock / -net;
    let status: MaterialFlow["status"];
    if (n === 0 && p === 0) status = "idle";
    else if (net > 1e-6) status = "surplus";
    else if (Math.abs(net) < 1e-6) status = "ok";
    else if (runwayH < plan.runwayTargetH) status = "stockout";
    else status = "draining";
    const cat = MATERIALS[name]?.category ?? PRODUCT_BY_NAME[name]?.type ?? "Unknown";
    const src = MATERIALS[name]?.source ?? PRODUCT_BY_NAME[name]?.industry ?? "—";
    flows.push({ name, category: cat, source: src, neededPerHr: n, producedPerHr: p, netPerHr: net, inStock, runwayH, status });
  }
  return flows.sort((a, b) => a.runwayH - b.runwayH || b.neededPerHr - a.neededPerHr);
}

// ---- restaurant serving (finished goods -> Inn income) -------------------
export interface ServeLineCalc {
  line: ServeLine;
  product?: Product;
  level: number;
  servedPerHr: number;
  innPrice: number;
  incomePerHr: number;
  estimated: boolean;
  active: boolean;
}
export interface ServeItem {
  name: string;
  producedPerHr: number;
  servedPerHr: number;
  unservedPerHr: number; // piles up as stock (sell via Trade or save for later catering)
  innPrice: number;
  incomePerHr: number;
}
export interface ServeResult {
  capacityPerHr: number; // active catering throughput from explicit Restaurant rows
  sellablePerHr: number; // total dish + wine produced by production rows
  servedPerHr: number;
  innIncomePerHr: number;
  serveLimited: boolean; // trying to serve faster than current production, stock will drain
  items: ServeItem[];
  lines: ServeLineCalc[];
}

export function calcServeLine(line: ServeLine, plan: PlanState): ServeLineCalc {
  const product = PRODUCT_BY_NAME[line.productName];
  const validProduct = !!product && (product.type === "Dish" || product.type === "Wine");
  const level = validProduct ? retainerJobLevel(line.retainer, "Catering", plan.retainerLevels) : 0;
  const active = validProduct && level > 0;
  const servedPerHr = active ? outputPerHr("Catering", level, baseRate("Catering", plan)) : 0;
  const price = product ? innPrice(product, line.bestSeller || isWeeklyBest(product.name, plan), activeOverrides(plan)) : 0;
  return {
    line,
    product,
    level,
    servedPerHr,
    innPrice: price,
    incomePerHr: servedPerHr * price,
    estimated: active ? efficiency(level, "Catering").estimated : false,
    active,
  };
}

/** Dishes & wine only earn Inn income when an explicit Restaurant/Catering row sells them. */
export function computeServe(plan: PlanState): ServeResult {
  const produced: Record<string, { qty: number; bs: boolean }> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.product || !c.active) continue;
    if (c.product.type !== "Dish" && c.product.type !== "Wine") continue;
    const cur = (produced[c.product.name] ??= { qty: 0, bs: false });
    cur.qty += c.outPerHr;
    cur.bs = cur.bs || line.bestSeller || isWeeklyBest(c.product.name, plan);
  }

  const lineCalcs = (plan.serveLines ?? []).map((line) => calcServeLine(line, plan));
  const served: Record<string, { qty: number; income: number; price: number }> = {};
  for (const line of lineCalcs) {
    if (!line.product || !line.active) continue;
    const cur = (served[line.product.name] ??= { qty: 0, income: 0, price: line.innPrice });
    cur.qty += line.servedPerHr;
    cur.income += line.incomePerHr;
    cur.price = line.innPrice;
  }

  const names = new Set([...Object.keys(produced), ...Object.keys(served)]);
  const items: ServeItem[] = [];
  let sellable = 0;
  let servedTotal = 0;
  let income = 0;
  for (const name of names) {
    const p = PRODUCT_BY_NAME[name];
    const made = produced[name]?.qty ?? 0;
    const sold = served[name]?.qty ?? 0;
    const inc = served[name]?.income ?? 0;
    sellable += made;
    servedTotal += sold;
    income += inc;
    items.push({
      name,
      producedPerHr: made,
      servedPerHr: sold,
      unservedPerHr: made - sold,
      innPrice: served[name]?.price ?? innPrice(p, !!produced[name]?.bs, activeOverrides(plan)),
      incomePerHr: inc,
    });
  }

  return {
    capacityPerHr: servedTotal,
    sellablePerHr: sellable,
    servedPerHr: servedTotal,
    innIncomePerHr: income,
    serveLimited: servedTotal > sellable + 1e-6,
    items: items.sort((a, b) => b.incomePerHr - a.incomePerHr),
    lines: lineCalcs,
  };
}
// ---- skill-slot capacity (Retainer Plan) ---------------------------------
export interface SkillUsage {
  job: Job;
  used: number;
  capacity: number;
  over: boolean;
}
export function computeSkillUsage(plan: PlanState): SkillUsage[] {
  const jobs: Job[] = ["Cook", "Catering", "Kilnwork", "Brewing", "Fishing", "Hunting", "Mining", "Forestry"];
  const used: Partial<Record<Job, number>> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (c.active && c.product) used[c.product.job] = (used[c.product.job] ?? 0) + 1;
  }
  for (const s of plan.serveLines ?? []) {
    if (retainerJobLevel(s.retainer, "Catering", plan.retainerLevels) > 0) used.Catering = (used.Catering ?? 0) + 1;
  }
  for (const g of plan.gatherLines) {
    const job = MATERIALS[g.materialName]?.job as Job | undefined;
    if (job && retainerJobLevel(g.retainer, job, plan.retainerLevels) > 0) used[job] = (used[job] ?? 0) + 1;
  }
  return jobs.map((job) => {
    const u = used[job] ?? 0;
    const cap = plan.skillSlots[job] ?? 0;
    return { job, used: u, capacity: cap, over: u > cap };
  });
}

// ---- plan-wide summary ---------------------------------------------------
export interface PlanSummary {
  revenuePerHr: number; // catering Inn income + trade value of surplus
  cateringIncomePerHr: number;
  tradeValuePerHr: number; // surplus (incl. all kiln output) sold at merchant price
  inputCostPerHr: number;
  profitPerHr: number;
  revenuePerDay: number;
  profitPerDay: number;
  revenuePerWeek: number;
  profitPerWeek: number;
  activeCraftSlots: number;
  activeGatherSlots: number;
  farms: number;
  shortages: number;
}

/**
 * Trade (merchant) value per hour of everything produced that catering does NOT sell,
 * by product. Kiln items are never caterable, so their whole output lands here; surplus
 * dishes/wine beyond catering capacity land here too. This is the "sell the leftovers"
 * income the guide describes (lower margin than catering).
 */
export function surplusTradeByProduct(plan: PlanState): Record<string, number> {
  const produced: Record<string, number> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.active || !c.product) continue;
    produced[c.product.name] = (produced[c.product.name] ?? 0) + c.outPerHr;
  }
  const served: Record<string, number> = {};
  for (const it of computeServe(plan).items) served[it.name] = it.servedPerHr;
  const ov = activeOverrides(plan);
  const out: Record<string, number> = {};
  for (const name of Object.keys(produced)) {
    const surplus = Math.max(0, produced[name] - (served[name] ?? 0));
    if (surplus <= 1e-9) continue;
    const value = surplus * tradePrice(PRODUCT_BY_NAME[name], ov);
    if (value > 0) out[name] = value;
  }
  return out;
}

export function computeSummary(plan: PlanState, flows: MaterialFlow[]): PlanSummary {
  let cost = 0;
  let craftSlots = 0;
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.active) continue;
    cost += c.inputCostPerHr;
    craftSlots += 1;
  }
  // Catering Inn income + trade value of everything catering doesn't sell (kiln, surplus).
  const cateringIncome = computeServe(plan).innIncomePerHr;
  const tradeValue = Object.values(surplusTradeByProduct(plan)).reduce((s, v) => s + v, 0);
  const rev = cateringIncome + tradeValue;
  const gatherSlots = plan.gatherLines.filter(
    (g) => retainerJobLevel(g.retainer, MATERIALS[g.materialName]?.job as Job, plan.retainerLevels) > 0
  ).length;
  const farms = plan.farmLines.reduce((s, f) => s + Math.max(0, f.farms), 0);
  const profit = rev - cost;
  const shortages = flows.filter((f) => f.status === "stockout").length;
  return {
    revenuePerHr: rev,
    cateringIncomePerHr: cateringIncome,
    tradeValuePerHr: tradeValue,
    inputCostPerHr: cost,
    profitPerHr: profit,
    revenuePerDay: rev * 24,
    profitPerDay: profit * 24,
    revenuePerWeek: rev * 24 * 7,
    profitPerWeek: profit * 24 * 7,
    activeCraftSlots: craftSlots,
    activeGatherSlots: gatherSlots,
    farms,
    shortages,
  };
}

// ---- labor suggestions ---------------------------------------------------
export interface RetainerPick {
  name: string;
  level: number;
  confidant: boolean;
}

export interface RosterEntry {
  name: string;
  confidant: boolean;
}

/** Full roster from the source sheet only. */
export function rosterEntries(_plan?: PlanState): RosterEntry[] {
  return RETAINERS.map((r) => ({ name: r.name, confidant: r.confidant }));
}

/**
 * Build the recruited set + skill levels from per-job level pools (e.g. Fishing: [6,6,2,1,1]).
 * Each level is mapped to a DISTINCT sheet retainer that has that skill — single-skill
 * retainers first — and that retainer's other skills are zeroed so it stays a single-job
 * worker (matches a renamed one-function NPC). Names won't match your renamed game NPCs;
 * only the skill+level pool matters to the planner.
 */
export function workforceFromPools(pools: Partial<Record<Job, number[]>>): {
  recruitedOverride: Record<string, boolean>;
  retainerLevels: Record<string, Partial<Record<Job, number>>>;
  unfilled: Partial<Record<Job, number>>; // levels that had no free retainer with that skill
} {
  const recruitedOverride: Record<string, boolean> = {};
  const retainerLevels: Record<string, Partial<Record<Job, number>>> = {};
  const unfilled: Partial<Record<Job, number>> = {};
  const used = new Set<string>();
  // assign the scarcest skills first so shared multi-skill retainers aren't grabbed early
  const jobs = (Object.keys(pools) as Job[]).filter((j) => (pools[j] ?? []).some((l) => l > 0));
  for (const job of jobs) {
    const levels = (pools[job] ?? []).filter((l) => l > 0).sort((a, b) => b - a);
    // any retainer can be a worker; prefer ones who have this skill innately, then single-skill ones
    const cands = RETAINERS.filter((r) => !used.has(r.name)).sort((a, b) => {
      const ai = (a.skills[job] ?? 0) > 0 ? 0 : 1;
      const bi = (b.skills[job] ?? 0) > 0 ? 0 : 1;
      return ai - bi || Object.keys(a.skills).length - Object.keys(b.skills).length || a.name.localeCompare(b.name);
    });
    levels.forEach((lvl, i) => {
      const r = cands[i];
      if (!r) {
        unfilled[job] = (unfilled[job] ?? 0) + 1;
        return;
      }
      used.add(r.name);
      recruitedOverride[r.name] = true;
      const skills: Partial<Record<Job, number>> = {};
      for (const sk of Object.keys(r.skills) as Job[]) skills[sk] = 0; // neutralise other skills
      skills[job] = lvl;
      retainerLevels[r.name] = skills;
    });
  }
  return { recruitedOverride, retainerLevels, unfilled };
}

/** Best retainers for a job by effective skill (ignores recruited status). */
export function bestRetainersFor(job: Job, levels?: RetainerLevels): RetainerPick[] {
  return RETAINERS.filter((r) => retainerJobLevel(r.name, job, levels) > 0)
    .map((r) => ({ name: r.name, level: retainerJobLevel(r.name, job, levels), confidant: r.confidant }))
    .sort((a, b) => b.level - a.level || (b.confidant ? 1 : 0) - (a.confidant ? 1 : 0));
}

/** Whether a sheet retainer counts as recruited (user override wins). */
export function isRecruited(name: string, plan: PlanState): boolean {
  if (!RETAINER_BY_NAME[name]) return false;
  const ov = plan.recruitedOverride?.[name];
  if (ov != null) return ov;
  return RETAINER_BY_NAME[name]?.recruited ?? false;
}

/** Retainers already assigned to a production/catering/gather line (excluding one line id). */
export function busyRetainers(plan: PlanState, exceptId?: string): Set<string> {
  const busy = new Set<string>();
  const add = (id: string, name: string) => {
    if (name && id !== exceptId) busy.add(name);
  };
  for (const l of plan.craftLines) {
    add(l.id, l.retainer);
    add(l.id, l.retainer2 ?? "");
  }
  for (const l of plan.serveLines ?? []) add(l.id, l.retainer);
  for (const l of plan.gatherLines) add(l.id, l.retainer);
  return busy;
}

/** Recruited sheet retainers who can do a job, highest skill first. */
export function recruitedRetainersFor(job: Job, plan: PlanState): RetainerPick[] {
  return rosterEntries(plan)
    .filter((r) => isRecruited(r.name, plan) && retainerJobLevel(r.name, job, plan.retainerLevels) > 0)
    .map((r) => ({ name: r.name, level: retainerJobLevel(r.name, job, plan.retainerLevels), confidant: r.confidant }))
    .sort((a, b) => b.level - a.level || (b.confidant ? 1 : 0) - (a.confidant ? 1 : 0));
}

// ---- orders (touchstone) -------------------------------------------------
export interface OrderItemReq {
  item: string;
  needed: number;
  inStock: number;
  shortfall: number;
  netPerHr: number;
  hoursToFill: number;
  canMake: boolean;
  source: string;
}

export function computeOrderRequirements(plan: PlanState): OrderItemReq[] {
  const flows = computeMaterialFlows(plan);
  const netByName: Record<string, number> = {};
  for (const f of flows) netByName[f.name] = f.netPerHr;

  const needed: Record<string, number> = {};
  for (const o of plan.orders) {
    if (o.done) continue;
    for (const r of o.reqs) {
      if (!r.item) continue;
      needed[r.item] = (needed[r.item] ?? 0) + Math.max(0, r.qty || 0);
    }
  }

  const reqs: OrderItemReq[] = [];
  for (const item of Object.keys(needed)) {
    const inStock = plan.inventory[item] ?? 0;
    const shortfall = Math.max(0, needed[item] - inStock);
    const net = netByName[item] ?? 0;
    const hoursToFill = shortfall <= 0 ? 0 : net > 1e-6 ? shortfall / net : Infinity;
    const product = PRODUCT_BY_NAME[item];
    const mat = MATERIALS[item];
    reqs.push({
      item,
      needed: needed[item],
      inStock,
      shortfall,
      netPerHr: net,
      hoursToFill,
      canMake: (!!product && isUnlocked(product, plan.homesteadLevel)) || !!mat?.job,
      source: product?.industry ?? mat?.source ?? "—",
    });
  }
  return reqs.sort((a, b) => b.shortfall - a.shortfall || b.needed - a.needed);
}

/** Every item that can appear in an order (products + materials). */
export function orderableItems(): string[] {
  const names = new Set<string>();
  for (const p of PRODUCTS) names.add(p.name);
  for (const m of Object.keys(MATERIALS)) names.add(m);
  return [...names].sort((a, b) => a.localeCompare(b));
}

// ---- recommendations (profit ranking) ------------------------------------
export interface ProductRanking {
  product: Product;
  price: number;
  outPerHr: number;
  revenuePerHr: number;
  inputCostPerHr: number;
  profitPerHr: number;
  profitPerUnit: number;
  estimated: boolean;
}

/** Rank every priced product by Inn profit/hr at an assumed skill level. */
export function rankProducts(level: number, bestSeller: boolean, overrides: PriceOverrides = {}): ProductRanking[] {
  const est = efficiency(level).estimated;
  return PRODUCTS.map((p) => {
    const outPerHr = outputPerHr(p.job, level);
    const price = innPrice(p, bestSeller, overrides);
    const revenuePerHr = outPerHr * price;
    const inputCostPerHr = outPerHr * (p.inputCost ?? 0);
    return {
      product: p,
      price,
      outPerHr,
      revenuePerHr,
      inputCostPerHr,
      profitPerHr: revenuePerHr - inputCostPerHr,
      profitPerUnit: price - (p.inputCost ?? 0),
      estimated: est,
    };
  })
    .filter((r) => r.price > 0)
    .sort((a, b) => b.profitPerHr - a.profitPerHr);
}

export interface RosterRanking extends ProductRanking {
  level: number; // best recruited retainer level for this product's job (0 = none)
  hasRetainer: boolean;
}

/**
 * Rank priced products for the player's actual roster: profit-per-unit is the
 * headline (fixed per item), profit/hr uses your best recruited retainer's level
 * for that job (falls back to level 4 as a reference when you have nobody yet).
 */
export function rankProductsForRoster(plan: PlanState, bestSeller: boolean): RosterRanking[] {
  const ov = activeOverrides(plan);
  return PRODUCTS.filter((p) => isUnlocked(p, plan.homesteadLevel)).map((p) => {
    const best = recruitedRetainersFor(p.job, plan)[0];
    const level = best?.level ?? 0;
    const useLevel = level > 0 ? level : 4;
    const outPerHr = outputPerHr(p.job, useLevel, baseRate(p.job, plan));
    const price = innPrice(p, bestSeller || isWeeklyBest(p.name, plan), ov);
    const revenuePerHr = outPerHr * price;
    const inputCostPerHr = outPerHr * (p.inputCost ?? 0);
    return {
      product: p,
      price,
      outPerHr,
      revenuePerHr,
      inputCostPerHr,
      profitPerHr: revenuePerHr - inputCostPerHr,
      profitPerUnit: price - (p.inputCost ?? 0),
      estimated: efficiency(useLevel, p.job).estimated,
      level,
      hasRetainer: level > 0,
    };
  })
    .filter((r) => r.price > 0)
    .sort((a, b) => b.profitPerUnit - a.profitPerUnit || b.profitPerHr - a.profitPerHr);
}

/** Products with no recorded price in any source sheet (candidates for a manual price). */
export const PRODUCTS_MISSING_PRICE: Product[] = PRODUCTS.filter(
  (p) => p.merchant == null && p.restaurant == null
);

// ---- dashboard: per-industry breakdown -----------------------------------
export interface IndustryStat {
  industry: string;
  slotsUsed: number;
  slotsCapacity: number;
  revenuePerHr: number;
  profitPerHr: number;
}

const PRODUCTION_INDUSTRIES = ["Inn", "Kiln", "Brewery"];
const DASHBOARD_INDUSTRIES = ["Inn", "Restaurant", "Kiln", "Brewery"];

export function computeIndustryBreakdown(plan: PlanState): IndustryStat[] {
  const used: Record<string, number> = {};
  const rev: Record<string, number> = {};
  const prof: Record<string, number> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.product) continue;
    const ind = c.product.industry;
    if (c.active) used[ind] = (used[ind] ?? 0) + 1;
    prof[ind] = (prof[ind] ?? 0) - c.inputCostPerHr;
  }
  for (const line of plan.serveLines ?? []) {
    const s = calcServeLine(line, plan);
    if (!s.product) continue;
    if (s.active) used.Restaurant = (used.Restaurant ?? 0) + 1;
    rev.Restaurant = (rev.Restaurant ?? 0) + s.incomePerHr;
    prof.Restaurant = (prof.Restaurant ?? 0) + s.incomePerHr;
  }
  // credit each production industry with the trade value of the surplus it sells
  for (const [name, value] of Object.entries(surplusTradeByProduct(plan))) {
    const ind = PRODUCT_BY_NAME[name]?.industry;
    if (!ind) continue;
    rev[ind] = (rev[ind] ?? 0) + value;
    prof[ind] = (prof[ind] ?? 0) + value;
  }
  return DASHBOARD_INDUSTRIES.map((ind) => ({
    industry: ind,
    slotsUsed: used[ind] ?? 0,
    slotsCapacity: plan.industrySlots[ind] ?? 0,
    revenuePerHr: rev[ind] ?? 0,
    profitPerHr: prof[ind] ?? 0,
  }));
}
// ---- optimizer -----------------------------------------------------------
export interface OptimizeOptions {
  bestSeller: boolean;
  ordersFirst: boolean; // reserve a slot per short, craftable order item
  materialSafe?: boolean; // avoid picks that push ingredients below the runway target
  cropBudget?: number; // max distinct farm crops the plan may rely on (= farm fields)
}

/** Farm fields available at a homestead level (L6 = 3, L7+ = 4; lower levels are best-guess). */
export function farmFieldsForLevel(level: number): number {
  if (level >= 7) return 4;
  if (level >= 6) return 3;
  if (level >= 5) return 2;
  return 1;
}

/** The farm crops a recipe consumes (ingredients that are growable crops). */
function cropsOf(p: Product): string[] {
  return p.ingredients.filter((i) => CROP_BY_NAME[i.name]).map((i) => i.name);
}
export interface OptimizeResult {
  lines: CraftLine[];
  serveLines: ServeLine[];
  revenuePerHr: number;
  profitPerHr: number;
  notes: string[];
}

interface OptimizeCandidate {
  product: Product;
  retainer: string;
  profitPerHr: number;
  revenuePerHr: number;
  badIngredients: string[];
  score: number;
}

function nextRetainer(job: Job, used: Set<string>, plan: PlanState): string {
  return recruitedRetainersFor(job, plan).find((r) => !used.has(r.name))?.name ?? "";
}

function badIngredientsFor(p: Product, flows: MaterialFlow[]): string[] {
  const byName = Object.fromEntries(flows.map((f) => [f.name, f]));
  return p.ingredients
    .map((ing) => byName[ing.name])
    .filter((f): f is MaterialFlow => !!f && f.status === "stockout")
    .map((f) => f.name);
}

function bestProductForIndustry(
  ind: string,
  plan: PlanState,
  opts: OptimizeOptions,
  lines: CraftLine[],
  used: Set<string>
): OptimizeCandidate | undefined {
  const basePlan: PlanState = { ...plan, craftLines: lines };
  const base = computeSummary(basePlan, computeMaterialFlows(basePlan));
  const materialSafe = opts.materialSafe !== false;
  const cropBudget = opts.cropBudget ?? Infinity;
  // crops the already-chosen lines commit us to (a field each)
  const usedCrops = new Set(lines.flatMap((l) => (PRODUCT_BY_NAME[l.productName] ? cropsOf(PRODUCT_BY_NAME[l.productName]) : [])));
  const candidates: OptimizeCandidate[] = [];

  for (const p of PRODUCTS) {
    if (p.industry !== ind) continue;
    if (!isUnlocked(p, plan.homesteadLevel)) continue;
    if (innPrice(p, opts.bestSeller || isWeeklyBest(p.name, plan), activeOverrides(plan)) <= 0) continue;
    const retainer = nextRetainer(p.job, used, plan);
    if (!retainer) continue;
    const line: CraftLine = { id: "probe", productName: p.name, retainer, bestSeller: opts.bestSeller };
    const probe: PlanState = { ...plan, craftLines: [...lines, line] };
    const flows = computeMaterialFlows(probe);
    const summary = computeSummary(probe, flows);
    const badIngredients = materialSafe ? badIngredientsFor(p, flows) : [];
    const gain = summary.profitPerHr - base.profitPerHr;
    // how many NEW farm crops (fields) this pick would add beyond the budget
    const totalCrops = new Set([...usedCrops, ...cropsOf(p)]).size;
    const overBudget = Math.max(0, totalCrops - cropBudget);
    candidates.push({
      product: p,
      retainer,
      profitPerHr: summary.profitPerHr,
      revenuePerHr: summary.revenuePerHr,
      badIngredients,
      // ponytail: greedy score; replace with linear programming if slot/material constraints get complex.
      // stockout is a hard no; exceeding the field budget is a soft penalty (prefers crop-sharing recipes).
      score: gain - badIngredients.length * 1_000_000 - overBudget * 100_000,
    });
  }

  return candidates.sort(
    (a, b) => b.score - a.score || b.profitPerHr - a.profitPerHr || b.revenuePerHr - a.revenuePerHr
  )[0];
}

function buildServeLines(
  plan: PlanState,
  craftLines: CraftLine[],
  caterers: string[],
  bestSeller: boolean,
  notes: string[]
): ServeLine[] {
  const produced = new Set(
    craftLines
      .map((line) => PRODUCT_BY_NAME[line.productName])
      .filter((p): p is Product => !!p && (p.type === "Dish" || p.type === "Wine"))
      .map((p) => p.name)
  );
  const candidates = [...produced]
    .map((name) => PRODUCT_BY_NAME[name])
    .sort(
      (a, b) =>
        innPrice(b, bestSeller || isWeeklyBest(b.name, plan), activeOverrides(plan)) -
        innPrice(a, bestSeller || isWeeklyBest(a.name, plan), activeOverrides(plan))
    );
  if (candidates.length === 0) return [];
  if (caterers.length === 0) {
    notes.push("No recruited Catering retainer — dishes/wine can't earn Inn income (catering is the only revenue).");
    return [];
  }
  const serveLines: ServeLine[] = [];
  for (let i = 0; i < caterers.length && candidates.length > 0; i++) {
    serveLines.push({ id: uidLocal(), productName: candidates[i % candidates.length].name, retainer: caterers[i], bestSeller });
  }
  return serveLines;
}
/**
 * Greedy planner: catering is the only revenue, so reserve caterers first; then
 * orders, then each industry's best remaining material-safe earner, staffed by
 * the player's recruited retainers once each.
 */
export function optimizePlan(plan: PlanState, opts: OptimizeOptions): OptimizeResult {
  const used = new Set<string>();
  const claim = (name: string): string => {
    if (name) used.add(name);
    return name;
  };

  // Reserve caterers up front — a dish/wine only earns money when a caterer sells it,
  // so production must not poach the retainers catering needs. Cap by how many
  // caterable goods can actually be produced (Inn cooks dishes, Brewery brews wine).
  const caterCap = Math.min(
    plan.industrySlots.Restaurant ?? 0,
    plan.skillSlots.Catering ?? plan.industrySlots.Restaurant ?? 0,
    (plan.industrySlots.Inn ?? 0) + (plan.industrySlots.Brewery ?? 0)
  );
  // ponytail: greedy reservation with one guard — never reserve the last retainer who
  // could produce a caterable good, or you'd cater nothing. A real solver would co-assign.
  const needsProducers = (plan.industrySlots.Inn ?? 0) + (plan.industrySlots.Brewery ?? 0) > 0;
  const producerPool = new Set(
    rosterEntries(plan)
      .filter((r) => isRecruited(r.name, plan))
      .filter((r) => retainerJobLevel(r.name, "Cook", plan.retainerLevels) > 0 || retainerJobLevel(r.name, "Brewing", plan.retainerLevels) > 0)
      .map((r) => r.name)
  );
  const reservedCaterers: string[] = [];
  for (const r of recruitedRetainersFor("Catering", plan)) {
    if (reservedCaterers.length >= caterCap) break;
    const wouldStrandProduction =
      needsProducers && producerPool.has(r.name) && [...producerPool].every((n) => n === r.name || used.has(n) || reservedCaterers.includes(n));
    if (wouldStrandProduction) continue; // keep this one free to produce
    reservedCaterers.push(claim(r.name));
  }

  const shortByIndustry: Record<string, string[]> = {};
  if (opts.ordersFirst) {
    for (const req of computeOrderRequirements(plan)) {
      if (req.shortfall <= 0) continue;
      const p = PRODUCT_BY_NAME[req.item];
      if (!p) continue;
      (shortByIndustry[p.industry] ??= []).push(p.name);
    }
  }

  const INDUSTRY_JOB: Record<string, Job> = { Inn: "Cook", Kiln: "Kilnwork", Brewery: "Brewing" };
  const lines: CraftLine[] = [];
  const notes: string[] = [];
  for (const ind of PRODUCTION_INDUSTRIES) {
    const queues = plan.industrySlots[ind] ?? 0;
    const skillCap = plan.skillSlots[INDUSTRY_JOB[ind]] ?? queues;
    let cap = Math.min(queues, skillCap);
    if (cap <= 0) continue;
    if (skillCap < queues) notes.push(`${ind}: limited to ${skillCap} by ${INDUSTRY_JOB[ind]} skill slots (${queues} queues open).`);

    for (const name of shortByIndustry[ind] ?? []) {
      if (cap <= 0) break;
      const retainer = nextRetainer(PRODUCT_BY_NAME[name].job, used, plan);
      if (!retainer) {
        notes.push(`Not enough ${ind} retainers to staff the order for ${name}.`);
        continue;
      }
      claim(retainer);
      lines.push({ id: uidLocal(), productName: name, retainer, bestSeller: opts.bestSeller });
      cap -= 1;
    }

    for (let i = 0; i < cap; i++) {
      const best = bestProductForIndustry(ind, plan, opts, lines, used);
      if (!best) {
        notes.push(`${ind} slot left empty - no recruited ${INDUSTRY_JOB[ind]} retainer or priced product.`);
        break;
      }
      claim(best.retainer);
      lines.push({ id: uidLocal(), productName: best.product.name, retainer: best.retainer, bestSeller: opts.bestSeller });
      if (best.badIngredients.length > 0) {
        notes.push(`${best.product.name}: below runway for ${best.badIngredients.join(", ")}.`);
      }
    }
  }

  const serveLines = buildServeLines(plan, lines, reservedCaterers, opts.bestSeller, notes);
  const probe: PlanState = { ...plan, craftLines: lines, serveLines };
  const summary = computeSummary(probe, computeMaterialFlows(probe));
  return { lines, serveLines, revenuePerHr: summary.revenuePerHr, profitPerHr: summary.profitPerHr, notes };
}
// ---- weekly plan (the capital-circulation loop) --------------------------
export interface WeeklyProductionRow {
  industry: string;
  productName: string;
  retainer: string;
  outPerHr: number;
  isOrderFiller: boolean; // reserved to clear a touchstone order
}
export interface WeeklyCateringRow {
  productName: string;
  retainer: string;
  servedPerHr: number;
  innPrice: number;
  incomePerHr: number;
}
export interface WeeklyGrowRow {
  crop: string;
  netPerHr: number;
  runwayH: number;
  fieldsToAdd: number; // full fields (16 plots) needed to break even
}
export interface WeeklyGatherRow {
  job: Job;
  material: string;
  netPerHr: number;
  runwayH: number;
  retainer: string; // best recruited gatherer for the job ("" = none)
}
export interface WeeklyPlan {
  production: WeeklyProductionRow[];
  catering: WeeklyCateringRow[];
  farming: WeeklyGrowRow[];
  gathering: WeeklyGatherRow[];
  orders: OrderItemReq[]; // still-short items
  profitPerHr: number;
  profitPerWeek: number;
  cateringIncomePerHr: number;
  tradeValuePerHr: number;
  lines: CraftLine[]; // for Apply
  serveLines: ServeLine[];
  notes: string[];
}

const GATHER_JOBS: Job[] = ["Fishing", "Hunting", "Mining", "Forestry"];

/**
 * Assemble the whole weekly loop: let the optimizer staff production + catering,
 * then read the resulting material flows to say what to farm and gather to feed it.
 * Everything respects homestead level, the player's slots, and their recruited roster.
 */
export function buildWeeklyPlan(plan: PlanState, opts: OptimizeOptions): WeeklyPlan {
  const opt = optimizePlan(plan, opts);
  const probe: PlanState = { ...plan, craftLines: opt.lines, serveLines: opt.serveLines };
  const flows = computeMaterialFlows(probe);

  // order items that got a reserved production slot (so we can label kiln fillers etc.)
  const orderShortNames = new Set(
    computeOrderRequirements(plan).filter((r) => r.shortfall > 0).map((r) => r.item)
  );

  const production: WeeklyProductionRow[] = opt.lines.map((l) => {
    const c = calcCraftLine(l, probe);
    return {
      industry: c.product?.industry ?? "—",
      productName: l.productName,
      retainer: l.retainer,
      outPerHr: c.outPerHr,
      isOrderFiller: orderShortNames.has(l.productName),
    };
  });

  const catering: WeeklyCateringRow[] = opt.serveLines.map((l) => {
    const s = calcServeLine(l, probe);
    return {
      productName: l.productName,
      retainer: l.retainer,
      servedPerHr: s.servedPerHr,
      innPrice: s.innPrice,
      incomePerHr: s.incomePerHr,
    };
  });

  // Farming: crops the plan drains that you are not growing enough of.
  const farming: WeeklyGrowRow[] = flows
    .filter((f) => CROP_BY_NAME[f.name] && f.netPerHr < -1e-6)
    .map((f) => {
      const crop = CROP_BY_NAME[f.name];
      const perField = crop.yieldPerHrFarm || 0;
      return {
        crop: f.name,
        netPerHr: f.netPerHr,
        runwayH: f.runwayH,
        fieldsToAdd: perField > 0 ? Math.ceil(-f.netPerHr / perField) : 0,
      };
    })
    .sort((a, b) => a.runwayH - b.runwayH);

  // Gathering: raw specialties the plan drains, with the best gatherer you own.
  const gathering: WeeklyGatherRow[] = flows
    .filter((f) => {
      const job = MATERIALS[f.name]?.job as Job | undefined;
      return !!job && GATHER_JOBS.includes(job) && f.netPerHr < -1e-6;
    })
    .map((f) => {
      const job = MATERIALS[f.name]!.job as Job;
      return {
        job,
        material: f.name,
        netPerHr: f.netPerHr,
        runwayH: f.runwayH,
        retainer: recruitedRetainersFor(job, plan)[0]?.name ?? "",
      };
    })
    .sort((a, b) => a.runwayH - b.runwayH);

  const orders = computeOrderRequirements(probe).filter((r) => r.shortfall > 0);
  const summary = computeSummary(probe, flows);

  return {
    production,
    catering,
    farming,
    gathering,
    orders,
    profitPerHr: summary.profitPerHr,
    profitPerWeek: summary.profitPerWeek,
    cateringIncomePerHr: summary.cateringIncomePerHr,
    tradeValuePerHr: summary.tradeValuePerHr,
    lines: opt.lines,
    serveLines: opt.serveLines,
    notes: opt.notes,
  };
}

// ---- trade tracker -------------------------------------------------------
export interface ProducedItem {
  name: string;
  ratePerHr: number; // combined output across all active lines making it
  hours: number; // time accumulated since last "sold" reset
  units: number; // ratePerHr * hours
  innValue: number; // units * inn price
  tradeValue: number; // units * trade price
  bestSeller: boolean;
}

/**
 * How much of each finished product has piled up since it was last marked sold,
 * plus the money it is worth via the Inn (auto) and Trade for Profit (manual).
 */
export function computeProduced(plan: PlanState, now: number): ProducedItem[] {
  const rate: Record<string, number> = {};
  const bs: Record<string, boolean> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.product || !c.active) continue;
    rate[c.product.name] = (rate[c.product.name] ?? 0) + c.outPerHr;
    if (line.bestSeller || isWeeklyBest(c.product.name, plan)) bs[c.product.name] = true;
  }
  const out: ProducedItem[] = [];
  for (const name of Object.keys(rate)) {
    const p = PRODUCT_BY_NAME[name];
    const anchor = plan.soldAt[name] ?? plan.trackingSince ?? now;
    const hours = Math.max(0, (now - anchor) / 3_600_000);
    const units = rate[name] * hours;
    out.push({
      name,
      ratePerHr: rate[name],
      hours,
      units,
      innValue: units * innPrice(p, !!bs[name], activeOverrides(plan)),
      tradeValue: units * tradePrice(p, activeOverrides(plan)),
      bestSeller: !!bs[name],
    });
  }
  return out.sort((a, b) => b.tradeValue - a.tradeValue);
}

// ---- paste helpers -------------------------------------------------------
export function parseItemQtyLines(text: string, validItems: string[]): { item: string; qty: number }[] {
  const byLower = Object.fromEntries(validItems.map((n) => [n.toLowerCase(), n]));
  const out: { item: string; qty: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tail = line.match(/^(.+?)[,;:\t ]+(\d+(?:\.\d+)?)$/);
    const head = line.match(/^(\d+(?:\.\d+)?)[,;:\t ]+(.+)$/);
    const name = (tail?.[1] ?? head?.[2] ?? "").trim();
    const qty = Number(tail?.[2] ?? head?.[1] ?? 0);
    const item = byLower[name.toLowerCase()];
    if (item && qty > 0) out.push({ item, qty });
  }
  return out;
}
// ---- helpers -------------------------------------------------------------
let _uid = 0;
function uidLocal(): string {
  _uid += 1;
  return `opt${Date.now().toString(36)}${_uid}`;
}
export function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
export function fmt(n: number, dp = 1): string {
  if (!isFinite(n)) return "∞";
  return round(n, dp).toLocaleString(undefined, { maximumFractionDigits: dp });
}
export function fmtMoney(n: number): string {
  return round(n, 0).toLocaleString();
}
