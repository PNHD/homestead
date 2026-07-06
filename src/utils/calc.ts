// Revenue / income / material-flow / labor engine.
// All formulas are ported from the official WWM Homestead Planner v2.0 spreadsheet:
//   output/hr   = base_rate(job) * efficiency(level)            (Rates & Efficiency sheet)
//   draw/hr     = output/hr * recipe_amount                     (Queues sheet)
//   revenue/hr  = output/hr * sale_price                        (Weekly Plan / Recipes sheet)
//   profit/hr   = revenue/hr - input_cost * output/hr           (Recipes: Profit/Unit * Produce/hr)
// Nothing here invents numbers; it only combines the sheet's constants.

import {
  BASE_RATES,
  EFF_MULT_VERIFIED,
  EFF_MULT_VERIFIED_MAX,
  EFF_MULT_ESTIMATED,
  BEST_SELLER_BONUS,
  PRODUCTS,
  MATERIALS,
  CROPS,
  RETAINERS,
  type Product,
  type Job,
} from "../data/gameData";
import type { CraftLine, PlanState, SellChannel } from "../types";

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

// ---- efficiency ----------------------------------------------------------
export interface Eff {
  mult: number;
  estimated: boolean;
}
export function efficiency(level: number): Eff {
  const lv = Math.max(1, Math.round(level));
  if (lv <= EFF_MULT_VERIFIED_MAX) {
    return { mult: EFF_MULT_VERIFIED[lv] ?? 1.02, estimated: false };
  }
  return { mult: EFF_MULT_ESTIMATED[lv] ?? EFF_MULT_ESTIMATED[10], estimated: true };
}

/** Items produced per hour for one slot of a job at a given skill level. */
export function outputPerHr(job: Job | string, level: number): number {
  const base = BASE_RATES[job] ?? 1;
  return base * efficiency(level).mult;
}

// ---- price ---------------------------------------------------------------
export function salePrice(p: Product, channel: SellChannel, bestSeller: boolean): number {
  const base = channel === "restaurant" ? p.restaurant ?? p.merchant ?? 0 : p.merchant ?? 0;
  return bestSeller ? round(base * (1 + BEST_SELLER_BONUS)) : base;
}

// ---- per-line economics --------------------------------------------------
export interface CraftLineCalc {
  line: CraftLine;
  product?: Product;
  outPerHr: number; // finished items / hr across all slots
  price: number;
  revenuePerHr: number;
  inputCostPerHr: number;
  profitPerHr: number;
  estimated: boolean;
  retainerOk: boolean; // assigned retainer actually has this job at >= level
}

export function calcCraftLine(line: CraftLine): CraftLineCalc {
  const product = PRODUCT_BY_NAME[line.productName];
  const eff = efficiency(line.level);
  const perSlot = product ? outputPerHr(product.job, line.level) : 0;
  const outPerHr = perSlot * Math.max(0, line.slots);
  const price = product ? salePrice(product, line.channel, line.bestSeller) : 0;
  const revenuePerHr = outPerHr * price;
  const inputCostPerHr = outPerHr * (product?.inputCost ?? 0);
  return {
    line,
    product,
    outPerHr,
    price,
    revenuePerHr,
    inputCostPerHr,
    profitPerHr: revenuePerHr - inputCostPerHr,
    estimated: eff.estimated,
    retainerOk: retainerSkillOk(line.retainer, product?.job, line.level),
  };
}

export function retainerSkillOk(name: string, job: Job | undefined, level: number): boolean {
  if (!name || !job) return true; // no retainer chosen / no job → not a violation
  const r = RETAINER_BY_NAME[name];
  if (!r) return true;
  const lv = r.skills[job];
  return lv != null && lv >= level;
}

// ---- material flow (the "sync") -----------------------------------------
export interface MaterialFlow {
  name: string;
  category: string;
  source: string;
  neededPerHr: number; // drawn by craft lines
  producedPerHr: number; // farmed + gathered + crafted here
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
    const c = calcCraftLine(line);
    if (!c.product) continue;
    touch(produced, c.product.name, c.outPerHr);
    for (const ing of c.product.ingredients) {
      touch(needed, ing.name, c.outPerHr * ing.amt);
    }
  }
  // gather lines produce raw materials
  for (const g of plan.gatherLines) {
    const mat = MATERIALS[g.materialName];
    if (!mat || !mat.job) continue;
    touch(produced, g.materialName, outputPerHr(mat.job, g.level) * Math.max(0, g.slots));
  }
  // farms produce crops
  for (const f of plan.farmLines) {
    const crop = CROP_BY_NAME[f.cropName];
    if (!crop) continue;
    touch(produced, f.cropName, (crop.yieldPerHrFarm ?? 0) * Math.max(0, f.farms));
  }

  const names = new Set([...Object.keys(needed), ...Object.keys(produced)]);
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
    else if (net === 0 || Math.abs(net) < 1e-6) status = "ok";
    else if (runwayH < plan.runwayTargetH) status = "stockout";
    else status = "draining";
    const cat = MATERIALS[name]?.category ?? PRODUCT_BY_NAME[name]?.type ?? "Unknown";
    const src = MATERIALS[name]?.source ?? PRODUCT_BY_NAME[name]?.industry ?? "—";
    flows.push({ name, category: cat, source: src, neededPerHr: n, producedPerHr: p, netPerHr: net, inStock, runwayH, status });
  }
  return flows.sort((a, b) => a.runwayH - b.runwayH || b.neededPerHr - a.neededPerHr);
}

// ---- plan-wide summary ---------------------------------------------------
export interface PlanSummary {
  revenuePerHr: number;
  inputCostPerHr: number;
  profitPerHr: number;
  revenuePerDay: number;
  profitPerDay: number;
  revenuePerWeek: number;
  profitPerWeek: number;
  activeCraftSlots: number;
  activeGatherSlots: number;
  farms: number;
  shortages: number; // materials draining below runway target
}

export function computeSummary(plan: PlanState, flows: MaterialFlow[]): PlanSummary {
  let rev = 0;
  let cost = 0;
  let craftSlots = 0;
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line);
    rev += c.revenuePerHr;
    cost += c.inputCostPerHr;
    craftSlots += Math.max(0, line.slots);
  }
  const gatherSlots = plan.gatherLines.reduce((s, g) => s + Math.max(0, g.slots), 0);
  const farms = plan.farmLines.reduce((s, f) => s + Math.max(0, f.farms), 0);
  const profit = rev - cost;
  const shortages = flows.filter((f) => f.status === "stockout").length;
  return {
    revenuePerHr: rev,
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
export interface RetainerSuggestion {
  job: Job;
  retainers: { name: string; level: number; confidant: boolean }[];
}

/** Best available retainers for a given job, highest skill first. */
export function bestRetainersFor(job: Job, recruitedOnly = true): { name: string; level: number; confidant: boolean }[] {
  return RETAINERS.filter((r) => (recruitedOnly ? r.recruited : true) && r.skills[job] != null)
    .map((r) => ({ name: r.name, level: r.skills[job] as number, confidant: r.confidant }))
    .sort((a, b) => b.level - a.level || (b.confidant ? 1 : 0) - (a.confidant ? 1 : 0));
}

// ---- orders (touchstone) -------------------------------------------------
export interface OrderItemReq {
  item: string;
  needed: number;
  inStock: number;
  shortfall: number;
  netPerHr: number; // net production toward this item under the current plan
  hoursToFill: number; // shortfall / netPerHr (Infinity if not accumulating)
  soloHours: number; // shortfall made solo by one L4 worker (rough estimate)
  canMake: boolean;
  source: string;
}

/** Roll every un-done order up into per-item requirements vs stock & production. */
export function computeOrderRequirements(plan: PlanState): OrderItemReq[] {
  const flows = computeMaterialFlows(plan);
  const flowByName: Record<string, { net: number }> = {};
  for (const f of flows) flowByName[f.name] = { net: f.netPerHr };

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
    const net = flowByName[item]?.net ?? 0;
    const hoursToFill = shortfall <= 0 ? 0 : net > 1e-6 ? shortfall / net : Infinity;
    const product = PRODUCT_BY_NAME[item];
    const mat = MATERIALS[item];
    const soloRate = product
      ? outputPerHr(product.job, 4)
      : mat?.job
      ? outputPerHr(mat.job, 4)
      : 0;
    const soloHours = shortfall <= 0 ? 0 : soloRate > 0 ? shortfall / soloRate : Infinity;
    reqs.push({
      item,
      needed: needed[item],
      inStock,
      shortfall,
      netPerHr: net,
      hoursToFill,
      soloHours,
      canMake: !!product || !!mat?.job,
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

/** Rank every priced product by profit/hr at the given level, channel and best-seller flag. */
export function rankProducts(level: number, channel: SellChannel, bestSeller: boolean): ProductRanking[] {
  const est = efficiency(level).estimated;
  return PRODUCTS.map((p) => {
    const outPerHr = outputPerHr(p.job, level);
    const price = salePrice(p, channel, bestSeller);
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

// ---- helpers -------------------------------------------------------------
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
