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
  bestSeller: boolean; // this week's best-seller (+20%)
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
  /** model the Restaurant serving stage (Inn income capped by catering capacity) */
  serveModelEnabled: boolean;
  /** epoch ms since which production has been accumulating (Trade tracker) */
  trackingSince: number;
  /** per-product epoch ms of the last "sold" reset (Trade tracker) */
  soldAt: Record<string, number>;
}

// Slot capacities at homestead Lv 6 (from the planner's Dashboard/Retainer Plan).
// Kitchen cooks, Restaurant serves, Kiln/Brewery craft, Local Specialties gather.
export const DEFAULT_INDUSTRY_SLOTS: Record<string, number> = {
  Inn: 3,
  Restaurant: 6,
  Kiln: 3,
  Brewery: 3,
  "Local Specialties": 12,
};

// Retainer skill slots at homestead Lv 6 (from the planner's Retainer Plan).
export const DEFAULT_SKILL_SLOTS: Partial<Record<Job, number>> = {
  Cook: 2,
  Catering: 6,
  Kilnwork: 2,
  Brewing: 3,
  Fishing: 2,
  Mining: 3,
  Forestry: 1,
  Hunting: 0,
};

export const emptyPlan = (): PlanState => ({
  homesteadLevel: 6,
  craftLines: [],
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
  serveModelEnabled: true,
  trackingSince: Date.now(),
  soldAt: {},
});
