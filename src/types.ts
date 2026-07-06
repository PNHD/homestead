// App-level state types (the user's plan). Game data lives in ./data/gameData.ts.

export type SellChannel = "merchant" | "restaurant";

/** A crafting queue slot group: a product made by a retainer at some skill level. */
export interface CraftLine {
  id: string;
  productName: string;
  retainer: string; // "" = unassigned (still runs at chosen level)
  level: number; // retainer skill level 1..10
  slots: number; // number of identical queue slots running this
  channel: SellChannel; // where the output is sold
  bestSeller: boolean; // this week's best-seller (+20%)
}

/** A gathering slot: raw material collected via Fishing/Hunting/Mining/Forestry. */
export interface GatherLine {
  id: string;
  materialName: string;
  retainer: string;
  level: number;
  slots: number;
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

/** Per-product manual price override (for items missing data in the source sheets). */
export interface PriceOverride {
  merchant?: number;
  restaurant?: number;
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
}

export const DEFAULT_INDUSTRY_SLOTS: Record<string, number> = {
  Inn: 3,
  Kiln: 3,
  Brewery: 3,
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
});
