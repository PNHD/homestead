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
  BEST_SELLER_BONUS,
  PRODUCTS,
  MATERIALS,
  CROPS,
  RETAINERS,
  type Product,
  type Job,
} from "../data/gameData";
import type { CraftLine, PlanState } from "../types";

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
export function efficiency(level: number): Eff {
  const lv = Math.max(1, Math.round(level));
  if (lv <= EFF_MULT_VERIFIED_MAX) {
    return { mult: EFF_MULT_VERIFIED[lv] ?? 1.02, estimated: false };
  }
  // Lv5+ multipliers are unknown in the sheet — fall back to the base rate (no bonus).
  return { mult: EFF_MULT_UNKNOWN, estimated: true };
}

/** Items produced per hour by one retainer at a job & skill level. */
export function outputPerHr(job: Job | string, level: number): number {
  const base = BASE_RATES[job] ?? 1;
  return base * efficiency(level).mult;
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
  revenuePerHr: number; // Inn auto income / hr
  inputCostPerHr: number;
  profitPerHr: number; // Inn income - input cost
  estimated: boolean;
  active: boolean; // has a retainer who can make it
}

export function calcCraftLine(line: CraftLine, plan: PlanState): CraftLineCalc {
  const product = PRODUCT_BY_NAME[line.productName];
  const level = product ? retainerJobLevel(line.retainer, product.job, plan.retainerLevels) : 0;
  const active = !!product && level > 0;
  const outPerHr = active ? outputPerHr(product!.job, level) : 0;
  const inn = product ? innPrice(product, line.bestSeller, activeOverrides(plan)) : 0;
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
    estimated: level > EFF_MULT_VERIFIED_MAX,
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
    touch(produced, g.materialName, outputPerHr(mat.job, level));
  }
  // farms produce crops
  for (const f of plan.farmLines) {
    const crop = CROP_BY_NAME[f.cropName];
    if (!crop) continue;
    touch(produced, f.cropName, (crop.yieldPerHrFarm ?? 0) * Math.max(0, f.farms));
  }

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

// ---- restaurant serving (the cook -> serve pipeline) ---------------------
export interface ServeItem {
  name: string;
  producedPerHr: number;
  servedPerHr: number;
  unservedPerHr: number; // piles up as stock (sell via Trade)
  innPrice: number;
  incomePerHr: number;
}
export interface ServeResult {
  capacityPerHr: number; // catering throughput from your best Restaurant retainers
  sellablePerHr: number; // total dish + wine produced
  servedPerHr: number;
  innIncomePerHr: number;
  serveLimited: boolean;
  items: ServeItem[];
}

/** Catering throughput: your top Restaurant-slot catering retainers, summed. */
export function serveCapacityPerHr(plan: PlanState): number {
  const slots = plan.industrySlots["Restaurant"] ?? 6;
  const caterers = recruitedRetainersFor("Catering", plan).slice(0, Math.max(0, slots));
  return caterers.reduce((s, r) => s + outputPerHr("Catering", r.level), 0);
}

/**
 * Dishes & wine must be served at the Restaurant to earn Inn income. Serving
 * capacity (catering) is shared, so it is allocated to the highest-price items
 * first; anything not served piles up as stock to sell via Trade.
 */
export function computeServe(plan: PlanState): ServeResult {
  const ov = activeOverrides(plan);
  const produced: Record<string, { qty: number; price: number; bs: boolean }> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.product || !c.active) continue;
    if (c.product.type !== "Dish" && c.product.type !== "Wine") continue; // kiln = trade only
    const cur = (produced[c.product.name] ??= { qty: 0, price: 0, bs: false });
    cur.qty += c.outPerHr;
    cur.bs = cur.bs || line.bestSeller;
  }
  for (const name of Object.keys(produced)) {
    produced[name].price = innPrice(PRODUCT_BY_NAME[name], produced[name].bs, ov);
  }

  let capacity = serveCapacityPerHr(plan);
  const sellable = Object.values(produced).reduce((s, p) => s + p.qty, 0);
  const order = Object.entries(produced).sort((a, b) => b[1].price - a[1].price);
  const items: ServeItem[] = [];
  let served = 0;
  let income = 0;
  for (const [name, p] of order) {
    const serve = Math.min(p.qty, capacity);
    capacity -= serve;
    served += serve;
    income += serve * p.price;
    items.push({
      name,
      producedPerHr: p.qty,
      servedPerHr: serve,
      unservedPerHr: p.qty - serve,
      innPrice: p.price,
      incomePerHr: serve * p.price,
    });
  }
  return {
    capacityPerHr: serveCapacityPerHr(plan),
    sellablePerHr: sellable,
    servedPerHr: served,
    innIncomePerHr: income,
    serveLimited: sellable > served + 1e-6,
    items: items.sort((a, b) => b.incomePerHr - a.incomePerHr),
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
  shortages: number;
}

export function computeSummary(plan: PlanState, flows: MaterialFlow[]): PlanSummary {
  let potentialInnRev = 0;
  let cost = 0;
  let craftSlots = 0;
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.active) continue;
    potentialInnRev += c.revenuePerHr;
    cost += c.inputCostPerHr;
    craftSlots += 1;
  }
  // When the serve model is on, only dishes/wine actually served at the
  // Restaurant earn Inn income (kiln items earn via Trade, tracked separately).
  const rev = plan.serveModelEnabled === false ? potentialInnRev : computeServe(plan).innIncomePerHr;
  const gatherSlots = plan.gatherLines.filter(
    (g) => retainerJobLevel(g.retainer, MATERIALS[g.materialName]?.job as Job, plan.retainerLevels) > 0
  ).length;
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
export interface RetainerPick {
  name: string;
  level: number;
  confidant: boolean;
}

export interface RosterEntry {
  name: string;
  confidant: boolean;
  custom: boolean;
}

/** Full roster: sheet retainers plus any the user added (custom win by name). */
export function rosterEntries(plan: PlanState): RosterEntry[] {
  const customNames = new Set(plan.customRetainers.map((c) => c.name));
  const customs: RosterEntry[] = plan.customRetainers.map((c) => ({
    name: c.name,
    confidant: !!c.confidant,
    custom: true,
  }));
  const sheet: RosterEntry[] = RETAINERS.filter((r) => !customNames.has(r.name)).map((r) => ({
    name: r.name,
    confidant: r.confidant,
    custom: false,
  }));
  return [...customs, ...sheet];
}

export function isCustomRetainer(name: string, plan: PlanState): boolean {
  return plan.customRetainers.some((c) => c.name === name);
}

/** Best retainers for a job by effective skill (ignores recruited status). */
export function bestRetainersFor(job: Job, levels?: RetainerLevels): RetainerPick[] {
  return RETAINERS.filter((r) => retainerJobLevel(r.name, job, levels) > 0)
    .map((r) => ({ name: r.name, level: retainerJobLevel(r.name, job, levels), confidant: r.confidant }))
    .sort((a, b) => b.level - a.level || (b.confidant ? 1 : 0) - (a.confidant ? 1 : 0));
}

/** Whether a retainer counts as recruited (user override wins; custom = recruited). */
export function isRecruited(name: string, plan: PlanState): boolean {
  const ov = plan.recruitedOverride?.[name];
  if (ov != null) return ov;
  if (isCustomRetainer(name, plan)) return true;
  return RETAINER_BY_NAME[name]?.recruited ?? false;
}

/** Recruited retainers (sheet + custom) who can do a job, highest skill first. */
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
  return PRODUCTS.map((p) => {
    const best = recruitedRetainersFor(p.job, plan)[0];
    const level = best?.level ?? 0;
    const useLevel = level > 0 ? level : 4;
    const outPerHr = outputPerHr(p.job, useLevel);
    const price = innPrice(p, bestSeller, ov);
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
      estimated: useLevel > EFF_MULT_VERIFIED_MAX,
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

const CRAFT_INDUSTRIES = ["Inn", "Kiln", "Brewery"];

export function computeIndustryBreakdown(plan: PlanState): IndustryStat[] {
  const used: Record<string, number> = {};
  const rev: Record<string, number> = {};
  const prof: Record<string, number> = {};
  for (const line of plan.craftLines) {
    const c = calcCraftLine(line, plan);
    if (!c.product) continue;
    const ind = c.product.industry;
    if (c.active) used[ind] = (used[ind] ?? 0) + 1;
    rev[ind] = (rev[ind] ?? 0) + c.revenuePerHr;
    prof[ind] = (prof[ind] ?? 0) + c.profitPerHr;
  }
  return CRAFT_INDUSTRIES.map((ind) => ({
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
}
export interface OptimizeResult {
  lines: CraftLine[];
  revenuePerHr: number;
  profitPerHr: number;
  notes: string[];
}

/** Highest profit-per-unit priced product in an industry (output rate is equal within a job). */
function bestProductForIndustry(ind: string, bestSeller: boolean, overrides: PriceOverrides): Product | undefined {
  let best: Product | undefined;
  let bestMargin = -Infinity;
  for (const p of PRODUCTS) {
    if (p.industry !== ind) continue;
    const price = innPrice(p, bestSeller, overrides);
    if (price <= 0) continue;
    const margin = price - (p.inputCost ?? 0);
    if (margin > bestMargin) {
      bestMargin = margin;
      best = p;
    }
  }
  return best;
}

/**
 * Assign each industry's slots to its best product, staffed by your highest-level
 * available retainers (each retainer used once). Optionally reserve a slot for
 * every short, craftable order item first.
 */
export function optimizePlan(plan: PlanState, opts: OptimizeOptions): OptimizeResult {
  const used = new Set<string>();
  const claim = (job: Job): string => {
    for (const r of recruitedRetainersFor(job, plan)) {
      if (!used.has(r.name)) {
        used.add(r.name);
        return r.name;
      }
    }
    return "";
  };

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
  for (const ind of CRAFT_INDUSTRIES) {
    const queues = plan.industrySlots[ind] ?? 0;
    const skillCap = plan.skillSlots[INDUSTRY_JOB[ind]] ?? queues;
    let cap = Math.min(queues, skillCap);
    if (cap <= 0) continue;
    if (skillCap < queues) notes.push(`${ind}: limited to ${skillCap} by ${INDUSTRY_JOB[ind]} skill slots (${queues} queues open).`);

    for (const name of shortByIndustry[ind] ?? []) {
      if (cap <= 0) break;
      const ret = claim(PRODUCT_BY_NAME[name].job);
      if (!ret) {
        notes.push(`Not enough ${ind} retainers to staff the order for ${name}.`);
        continue;
      }
      lines.push({ id: uidLocal(), productName: name, retainer: ret, bestSeller: opts.bestSeller });
      cap -= 1;
    }

    const best = bestProductForIndustry(ind, opts.bestSeller, activeOverrides(plan));
    if (!best) {
      notes.push(`No priced product for ${ind} — left empty.`);
      continue;
    }
    for (let i = 0; i < cap; i++) {
      const ret = claim(best.job);
      lines.push({ id: uidLocal(), productName: best.name, retainer: ret, bestSeller: opts.bestSeller });
      if (!ret) notes.push(`${ind} slot left unstaffed — no more retainers with ${best.job}.`);
    }
  }

  let revenuePerHr = 0;
  let profitPerHr = 0;
  const probe: PlanState = { ...plan, craftLines: lines };
  for (const line of lines) {
    const c = calcCraftLine(line, probe);
    revenuePerHr += c.revenuePerHr;
    profitPerHr += c.profitPerHr;
  }
  return { lines, revenuePerHr, profitPerHr, notes };
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
    if (line.bestSeller) bs[c.product.name] = true;
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
