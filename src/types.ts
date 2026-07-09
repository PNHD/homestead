// App-level state types (the user's plan). Game data lives in ./data/gameData.ts.
import type { Job } from "./data/gameData";

/**
 * A crafting queue slot: one product made by one assigned retainer.
 * The output rate is fixed by that retainer's skill level for the product's
 * job (Cook/Kilnwork/Brewing) — there is no manual level or slot count.
 * To run the same product in several slots, add (or duplicate) more lines.
 */
export interface CraftLine {
  id: string;
  productName: string;
  retainer: string; // "" = unassigned (line is inactive until staffed)
  retainer2?: string; // brewing stills take 2 retainers at homestead L7+; "" = second seat empty
  bestSeller: boolean; // this week's best-seller (+20%)
}

/** A restaurant slot: one finished dish/wine sold by one catering retainer. */
export interface ServeLine {
  id: string;
  productName: string;
  retainer: string; // "" = unassigned
  bestSeller: boolean;
}

/** A gathering slot: one raw material collected by one assigned retainer. */
export interface GatherLine {
  id: string;
  materialName: string;
  retainer: string; // "" = unassigned
}

/** A farm field growing a crop. */
export interface FarmLine {
  id: string;
  cropName: string;
  farms: number; // number of full farms/fields
}

/** A single requirement inside a touchstone order. */
export interface OrderReq {
  item: string;
  qty: number;
}

/** A weekly touchstone order: a set of item quantities to deliver. */
export interface Order {
  id: string;
  name: string;
  reqs: OrderReq[];
  done: boolean;
}

/**
 * Per-product manual price override (for items missing data in the sheets).
 * inn   = Inn Unit Sale Price (automatic passive income)
 * trade = Trade for Profit Price (manual — you sell to an NPC yourself)
 */
export interface PriceOverride {
  inn?: number;
  trade?: number;
}

export interface PlanState {
  homesteadLevel: number;
  craftLines: CraftLine[];
  serveLines: ServeLine[];
  gatherLines: GatherLine[];
  farmLines: FarmLine[];
  orders: Order[];
  inventory: Record<string, number>;
  /** hours you want each material's stock to last (runway target) */
  runwayTargetH: number;
  /** crafting slot capacity per industry (used by the optimizer & dashboard) */
  industrySlots: Record<string, number>;
  /** manual price overrides keyed by product name */
  priceOverrides: Record<string, PriceOverride>;
  /** when false, manual price overrides are ignored (use sheet data only) */
  manualPricesEnabled: boolean;
  /** user's real retainer skill levels, overriding the spreadsheet snapshot */
  retainerLevels: Record<string, Partial<Record<Job, number>>>;
  /** user's recruited/not overrides keyed by retainer name */
  recruitedOverride: Record<string, boolean>;
  /** how many retainers you can staff per skill (Retainer Plan) */
  skillSlots: Partial<Record<Job, number>>;
  /** per-job base output/hr override (level-1 rate) to match your building level; empty = sheet defaults */
  rateOverrides: Partial<Record<Job, number>>;
  /** this week's best-seller product names (+20% Inn price) — the planner prioritises these */
  bestSellers: string[];
  /** epoch ms since which production has been accumulating (Trade tracker) */
  trackingSince: number;
  /** per-product epoch ms of the last "sold" reset (Trade tracker) */
  soldAt: Record<string, number>;
}

export interface LevelSlots {
  industry: Record<string, number>;
  skill: Partial<Record<Job, number>>;
}

/**
 * Slot CAPACITIES by homestead level (how many retainers each facility can staff).
 * L6 and L7 are anchored to real in-game values (player-confirmed):
 *   L6: 3 stoves, 6 tables, 4 kiln, 3 brewery, 3 per gather node.
 *   L7: 4 stoves, 6 tables, 4 kiln, 8 brewery (2 per still), 4 per gather node.
 * Other levels are a best-effort estimate — edit in the Data tab.
 * NOTE: these are physical capacities, not the game's weekly "slots to fill" hint.
 */
export function slotsForLevel(level: number): LevelSlots {
  const cook = level >= 7 ? 4 : level >= 6 ? 3 : level >= 4 ? 2 : 1;
  const cater = level >= 7 ? 7 : level >= 6 ? 6 : level >= 4 ? 4 : 2;
  const kiln = level >= 6 ? 4 : level >= 4 ? 3 : level >= 3 ? 2 : 1;
  const brew = level >= 7 ? 8 : level >= 5 ? 3 : level >= 3 ? 2 : 1;
  const gather = level >= 7 ? 4 : level >= 6 ? 3 : level >= 4 ? 2 : 1;
  return {
    industry: { Inn: cook, Restaurant: cater, Kiln: kiln, Brewery: brew, "Local Specialties": gather * 4 },
    skill: { Cook: cook, Catering: cater, Kilnwork: kiln, Brewing: brew, Fishing: gather, Hunting: gather, Mining: gather, Forestry: gather },
  };
}

export const DEFAULT_INDUSTRY_SLOTS: Record<string, number> = slotsForLevel(6).industry;
export const DEFAULT_SKILL_SLOTS: Partial<Record<Job, number>> = slotsForLevel(6).skill;

export const emptyPlan = (): PlanState => ({
  homesteadLevel: 6,
  craftLines: [],
  serveLines: [],
  gatherLines: [],
  farmLines: [],
  orders: [],
  inventory: {},
  runwayTargetH: 24,
  industrySlots: { ...DEFAULT_INDUSTRY_SLOTS },
  priceOverrides: {},
  manualPricesEnabled: true,
  retainerLevels: {},
  recruitedOverride: {},
  skillSlots: { ...DEFAULT_SKILL_SLOTS },
  rateOverrides: {},
  bestSellers: [],
  trackingSince: Date.now(),
  soldAt: {},
});
