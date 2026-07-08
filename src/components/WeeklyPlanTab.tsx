import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlanState } from "../types";
import { buildWeeklyPlan, farmFieldsForLevel, fmt, PRODUCT_BY_NAME, CROP_BY_NAME } from "../utils/calc";
import { NumberInput, Money, SectionTitle } from "./Ui";

const CRAFT_INDUSTRIES = ["Inn", "Kiln", "Brewery"];
const runway = (h: number) => (h === Infinity ? "OK" : `${fmt(h, 1)}h`);

export default function WeeklyPlanTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const [cropBudget, setCropBudget] = useState<number>(farmFieldsForLevel(plan.homesteadLevel));

  // Changing the homestead level snaps the crop budget to that level's field count (L7 -> 4).
  useEffect(() => setCropBudget(farmFieldsForLevel(plan.homesteadLevel)), [plan.homesteadLevel]);

  const wp = useMemo(
    () => buildWeeklyPlan(plan, { bestSeller: false, ordersFirst: true, materialSafe: true, cropBudget }),
    [plan, cropBudget]
  );

  const setSlots = (ind: string, n: number) =>
    setPlan((p) => ({ ...p, industrySlots: { ...p.industrySlots, [ind]: n } }));

  const apply = () =>
    setPlan((p) => ({
      ...p,
      craftLines: wp.lines.map((l) => ({ ...l })),
      serveLines: wp.serveLines.map((l) => ({ ...l })),
    }));

  const staffed = wp.production.filter((r) => r.retainer).length + wp.catering.filter((r) => r.retainer).length;

  const cropsUsed = useMemo(() => {
    const s = new Set<string>();
    for (const r of wp.production) {
      PRODUCT_BY_NAME[r.productName]?.ingredients.forEach((i) => {
        if (CROP_BY_NAME[i.name]) s.add(i.name);
      });
    }
    return [...s];
  }, [wp.production]);
  const overCropBudget = cropsUsed.length > cropBudget;

  return (
    <div className="space-y-5">
      <SectionTitle hint={`The full capital-loop for Homestead Lv ${plan.homesteadLevel}: grow → gather → make → cater → clear orders.`}>
        Weekly plan
      </SectionTitle>

      {/* controls */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        {CRAFT_INDUSTRIES.map((ind) => (
          <label key={ind} className="text-xs text-gray-400">
            {ind} slots
            <NumberInput value={plan.industrySlots[ind] ?? 0} min={0} onChange={(n) => setSlots(ind, n)} className="mt-1 w-20" />
          </label>
        ))}
        <label className="text-xs text-gray-400">
          Restaurant slots
          <NumberInput value={plan.industrySlots.Restaurant ?? 0} min={0} onChange={(n) => setSlots("Restaurant", n)} className="mt-1 w-20" />
        </label>
        <label className="text-xs text-gray-400" title="How many different farm crops your fields can grow. L6 = 3 fields, L7+ = 4.">
          Farm crops (fields)
          <NumberInput value={cropBudget} min={1} max={4} onChange={setCropBudget} className="mt-1 w-20" />
        </label>
        <span className="pb-2 text-xs text-gray-500">
          Best-sellers:{" "}
          {(plan.bestSellers ?? []).length === 0 ? (
            <span className="text-amber-400">none — pick them on the Best Sellers tab</span>
          ) : (
            <span className="text-gold">{(plan.bestSellers ?? []).join(", ")}</span>
          )}
        </span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Projected profit / week" value={<Money n={wp.profitPerWeek} className="text-jade" />} />
        <Kpi label="Profit / hr" value={<Money n={wp.profitPerHr} className="text-gold" />} />
        <Kpi
          label="Revenue split / hr"
          value={<Money n={wp.cateringIncomePerHr} className="text-gold" />}
          sub={`catering + ${fmt(wp.tradeValuePerHr, 0)} trade (surplus & kiln)`}
        />
        <Kpi label="Slots staffed" value={`${staffed}`} sub={`${wp.production.length} production · ${wp.catering.length} catering`} />
      </div>

      {wp.notes.length > 0 && (
        <ul className="card space-y-1 p-3 text-xs text-amber-400">
          {wp.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}

      {/* crop-budget summary */}
      <div className={`card p-3 text-sm ${overCropBudget ? "text-amber-300" : "text-gray-400"}`}>
        Plan uses <span className="font-semibold">{cropsUsed.length}</span> of {cropBudget} farm{" "}
        {cropBudget === 1 ? "field" : "fields"}
        {cropsUsed.length > 0 && <>: {cropsUsed.join(", ")}</>}
        {overCropBudget && " — over your field budget, you'll have to buy or hand-juggle the extra crop."}
      </div>

      {/* 1. Farming */}
      <Stage n={1} icon="🌾" title="Grow (farm fields)" empty={wp.farming.length === 0} emptyText="Crops are keeping up — nothing extra to plant.">
        <Table head={["Crop", "Net/hr", "Runway", "Fields to add"]}>
          {wp.farming.map((f) => (
            <tr key={f.crop} className="row">
              <td className="td font-medium">{f.crop}</td>
              <td className="td text-right"><Money n={f.netPerHr} /></td>
              <td className="td text-right tabular-nums text-amber-400">{runway(f.runwayH)}</td>
              <td className="td text-right tabular-nums">+{f.fieldsToAdd}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 2. Gathering */}
      <Stage n={2} icon="🎣" title="Gather (local specialties)" empty={wp.gathering.length === 0} emptyText="Raw materials are covered — no gathering needed this week.">
        <Table head={["Material", "Job", "Net/hr", "Runway", "Best gatherer"]}>
          {wp.gathering.map((g) => (
            <tr key={g.material} className="row">
              <td className="td font-medium">{g.material}</td>
              <td className="td text-gray-400">{g.job}</td>
              <td className="td text-right"><Money n={g.netPerHr} /></td>
              <td className="td text-right tabular-nums text-amber-400">{runway(g.runwayH)}</td>
              <td className={`td ${g.retainer ? "text-gray-300" : "text-amber-400"}`}>{g.retainer || "no recruited " + g.job}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 3. Production */}
      <Stage n={3} icon="🍜" title="Make (kitchen · kiln · brewery)" empty={wp.production.length === 0} emptyText="Set slot counts above to get a production plan.">
        <Table head={["Industry", "Product", "Retainer", "Out/hr", ""]}>
          {wp.production.map((r, i) => (
            <tr key={i} className="row">
              <td className="td text-gray-400">{r.industry}</td>
              <td className="td font-medium">{r.productName}</td>
              <td className={`td ${r.retainer ? "text-gray-300" : "text-amber-400"}`}>{r.retainer || "unstaffed"}</td>
              <td className="td text-right tabular-nums">{fmt(r.outPerHr, 2)}</td>
              <td className="td">{r.isOrderFiller && <span className="chip bg-sky-500/15 text-sky-300">order</span>}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 4. Catering */}
      <Stage n={4} icon="🍽️" title="Cater (restaurant — this is the income)" empty={wp.catering.length === 0} emptyText="No dishes/wine to sell yet — add production, then catering slots.">
        <Table head={["Dish / wine", "Caterer", "Serve/hr", "Inn $", "Income/hr"]}>
          {wp.catering.map((r, i) => (
            <tr key={i} className="row">
              <td className="td font-medium">{r.productName}</td>
              <td className={`td ${r.retainer ? "text-gray-300" : "text-amber-400"}`}>{r.retainer || "unstaffed"}</td>
              <td className="td text-right tabular-nums">{fmt(r.servedPerHr, 2)}</td>
              <td className="td text-right tabular-nums">{r.innPrice || "-"}</td>
              <td className="td text-right font-semibold"><Money n={r.incomePerHr} className="text-gold" /></td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 5. Orders */}
      <Stage n={5} icon="📜" title="Clear touchstone orders" empty={wp.orders.length === 0} emptyText="No outstanding order shortfalls. Add this week's orders on the Orders tab.">
        <Table head={["Item", "Needed", "In stock", "Short", "Fill ETA"]}>
          {wp.orders.map((o) => (
            <tr key={o.item} className="row">
              <td className="td font-medium">{o.item}</td>
              <td className="td text-right tabular-nums">{fmt(o.needed, 0)}</td>
              <td className="td text-right tabular-nums">{fmt(o.inStock, 0)}</td>
              <td className="td text-right tabular-nums text-amber-400">{fmt(o.shortfall, 0)}</td>
              <td className="td text-right tabular-nums">{o.hoursToFill === Infinity ? "not producing" : `${fmt(o.hoursToFill, 1)}h`}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      <div className="flex items-center gap-3">
        <button className="btn btn-gold" onClick={apply} disabled={wp.lines.length === 0 && wp.serveLines.length === 0}>
          Apply production + catering to plan
        </button>
        <span className="text-xs text-gray-500">
          Overwrites your current lines. Farming & gathering are guidance — set those on the Materials tab.
        </span>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Stage({
  n,
  icon,
  title,
  empty,
  emptyText,
  children,
}: {
  n: number;
  icon: string;
  title: string;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-200">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel2 text-xs text-gold">{n}</span>
        <span>{icon}</span>
        {title}
      </h3>
      {empty ? (
        <div className="card p-4 text-sm text-gray-500">{emptyText}</div>
      ) : (
        <div className="card overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full min-w-[560px]">
      <thead>
        <tr className="border-b border-line">
          {head.map((h, i) => (
            <th key={i} className="th">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
