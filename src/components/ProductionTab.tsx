import type { ReactNode } from "react";
import { PRODUCTS, type Product } from "../data/gameData";
import type { PlanState, CraftLine } from "../types";
import { uid } from "../utils/storage";
import {
  calcCraftLine,
  calcServeLine,
  computeMaterialFlows,
  computeServe,
  recruitedRetainersFor,
  busyRetainers,
  workersPerStation,
  fmt,
  PRODUCT_BY_NAME,
} from "../utils/calc";
import { Combobox, Money, SectionTitle } from "./Ui";

const SERVE_OPTIONS = PRODUCTS.filter((p) => p.type === "Dish" || p.type === "Wine")
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
  .map((p) => ({ value: p.name, label: `${p.name} - ${p.type}` }));

// craft industries shown as their own grouped card
const CRAFT_GROUPS: { industry: string; label: string; job: string }[] = [
  { industry: "Inn", label: "Inn (cooking)", job: "Cook" },
  { industry: "Kiln", label: "Porcelain Kiln", job: "Kilnwork" },
  { industry: "Brewery", label: "Aromas Brewery", job: "Brewing" },
];

const optionsForIndustry = (industry: string) =>
  PRODUCTS.filter((p) => p.industry === industry)
    .sort((a, b) => (a.lvl ?? 0) - (b.lvl ?? 0) || a.name.localeCompare(b.name))
    .map((p) => ({ value: p.name, label: `${p.name} (Lv ${p.lvl ?? "?"})` }));

const runwayText = (h: number) => (h === Infinity ? "OK" : `${fmt(h, 1)}h`);

function productRunway(product: Product | undefined, flows: ReturnType<typeof computeMaterialFlows>) {
  if (!product || product.ingredients.length === 0) return { hours: Infinity, names: [] as string[] };
  const byName = Object.fromEntries(flows.map((f) => [f.name, f]));
  const draining = product.ingredients
    .map((ing) => byName[ing.name])
    .filter((f): f is NonNullable<typeof f> => !!f && f.netPerHr < 0);
  if (draining.length === 0) return { hours: Infinity, names: [] as string[] };
  const min = Math.min(...draining.map((f) => f.runwayH));
  return { hours: min, names: draining.filter((f) => f.runwayH === min).map((f) => f.name) };
}
function itemRunway(name: string, flows: ReturnType<typeof computeMaterialFlows>) {
  const flow = flows.find((f) => f.name === name);
  if (!flow || flow.netPerHr >= 0) return { hours: Infinity, names: [] as string[] };
  return { hours: flow.runwayH, names: [name] };
}

export default function ProductionTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const flows = computeMaterialFlows(plan);
  const serve = computeServe(plan);
  const craftCalcs = plan.craftLines.map((l) => calcCraftLine(l, plan));
  const productionCost = craftCalcs.reduce((s, c) => s + c.inputCostPerHr, 0);
  const innIncome = serve.innIncomePerHr;

  const updateCraft = (id: string, patch: Partial<CraftLine>) =>
    setPlan((p) => ({ ...p, craftLines: p.craftLines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const removeCraft = (id: string) =>
    setPlan((p) => ({ ...p, craftLines: p.craftLines.filter((l) => l.id !== id) }));
  const addCraftTo = (industry: string) => {
    const first = PRODUCTS.filter((p) => p.industry === industry).sort((a, b) => (a.lvl ?? 0) - (b.lvl ?? 0))[0];
    if (!first) return;
    setPlan((p) => ({ ...p, craftLines: [...p.craftLines, { id: uid(), productName: first.name, retainer: "", bestSeller: false }] }));
  };

  const updateServe = (id: string, patch: Partial<{ productName: string; retainer: string }>) =>
    setPlan((p) => ({ ...p, serveLines: (p.serveLines ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const removeServe = (id: string) =>
    setPlan((p) => ({ ...p, serveLines: (p.serveLines ?? []).filter((l) => l.id !== id) }));
  const addServe = () =>
    setPlan((p) => ({
      ...p,
      serveLines: [...(p.serveLines ?? []), { id: uid(), productName: SERVE_OPTIONS[0]?.value ?? "", retainer: "", bestSeller: false }],
    }));

  // retainer dropdown options for a job, excluding anyone already working elsewhere (and the other seat)
  const retOptions = (job: string, lineId: string, exclude?: string) => {
    const busy = busyRetainers(plan, lineId);
    return [
      { value: "", label: "— none —" },
      ...recruitedRetainersFor(job as any, plan)
        .filter((r) => !busy.has(r.name) && r.name !== exclude)
        .map((r) => ({ value: r.name, label: `${r.name} · L${r.level}${r.confidant ? " ★" : ""}` })),
    ];
  };

  return (
    <div className="space-y-5">
      <SectionTitle hint="Cook/Kiln/Brew make stock; catering sells dish/wine for Inn income. Grouped by facility.">
        Production &amp; Catering
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Produced items/hr" value={fmt(craftCalcs.reduce((s, c) => s + c.outPerHr, 0), 2)} />
        <Mini label="Catered items/hr" value={fmt(serve.servedPerHr, 2)} />
        <Mini label="Inn income/hr" value={<Money n={innIncome} className="text-gold" />} />
        <Mini label="Net profit/hr" value={<Money n={innIncome - productionCost} className="text-jade" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {CRAFT_GROUPS.map(({ industry, label, job }) => {
          const lines = plan.craftLines.filter((l) => PRODUCT_BY_NAME[l.productName]?.industry === industry);
          const opts = optionsForIndustry(industry);
          const twoSeats = workersPerStation(job, plan) > 1;
          return (
            <Group key={industry} title={label} onAdd={() => addCraftTo(industry)} addLabel={twoSeats ? "+ Still" : "+ Line"}>
              {lines.length === 0 ? (
                <Empty>No {label} lines yet.</Empty>
              ) : (
                lines.map((line) => {
                  const c = calcCraftLine(line, plan);
                  const p = PRODUCT_BY_NAME[line.productName];
                  const runway = productRunway(p, flows);
                  return (
                    <LineCard key={line.id} onRemove={() => removeCraft(line.id)}>
                      <Combobox value={line.productName} onChange={(v) => updateCraft(line.id, { productName: v })} options={opts} placeholder="Search product…" />
                      {p && <div className="text-[11px] text-gray-500">{p.ingredients.map((i) => `${i.amt}× ${i.name}`).join(", ")}</div>}
                      <div className={twoSeats ? "grid grid-cols-2 gap-2" : ""}>
                        <Combobox value={line.retainer} onChange={(v) => updateCraft(line.id, { retainer: v })} options={retOptions(job, line.id, line.retainer2)} placeholder={twoSeats ? "Seat 1…" : "Search retainer…"} />
                        {twoSeats && (
                          <Combobox value={line.retainer2 ?? ""} onChange={(v) => updateCraft(line.id, { retainer2: v })} options={retOptions(job, line.id, line.retainer)} placeholder="Seat 2…" />
                        )}
                      </div>
                      <Stats
                        active={c.active}
                        out={c.outPerHr}
                        cost={c.inputCostPerHr}
                        runwayH={runway.hours}
                        target={plan.runwayTargetH}
                        bottleneck={runway.names.join(", ")}
                        note={!c.active ? "Assign a retainer" : undefined}
                      />
                    </LineCard>
                  );
                })
              )}
            </Group>
          );
        })}

        {/* Restaurant / catering */}
        <Group title="Restaurant (catering → Inn income)" onAdd={addServe} addLabel="+ Catering">
          {(plan.serveLines ?? []).length === 0 ? (
            <Empty>No catering lines — add one to sell dish/wine for Inn income.</Empty>
          ) : (
            (plan.serveLines ?? []).map((line) => {
              const s = calcServeLine(line, plan);
              const runway = itemRunway(line.productName, flows);
              return (
                <LineCard key={line.id} onRemove={() => removeServe(line.id)}>
                  <Combobox value={line.productName} onChange={(v) => updateServe(line.id, { productName: v })} options={SERVE_OPTIONS} placeholder="Search dish or wine…" />
                  <Combobox value={line.retainer} onChange={(v) => updateServe(line.id, { retainer: v })} options={retOptions("Catering", line.id)} placeholder="Search caterer…" />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="text-gray-400">Serve/hr <span className="tabular-nums text-gray-200">{s.active ? fmt(s.servedPerHr, 2) : "-"}</span></span>
                    <span className="text-gray-400">Inn $ <span className="tabular-nums text-gray-200">{s.innPrice || "-"}</span></span>
                    <span className="text-gray-400">Income/hr <Money n={s.incomePerHr} className="text-gold" /></span>
                    <span className="text-gray-400">Stock <span className={`tabular-nums ${runway.hours < plan.runwayTargetH ? "text-amber-400" : "text-gray-200"}`}>{runwayText(runway.hours)}</span></span>
                    {!s.active && <span className="text-amber-400">Assign a caterer</span>}
                  </div>
                </LineCard>
              );
            })
          )}
        </Group>
      </div>

      <p className="text-xs text-gray-500">
        Brewery stills seat 2 retainers each at Homestead L7+ (both add output). Cook/Kiln/Brew create stock &amp; draw
        ingredients; catering consumes dish/wine stock for Inn income. Kiln items &amp; surplus go to manual Trade on the Sell tab.
      </p>
    </div>
  );
}

function Group({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: ReactNode }) {
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-100">{title}</h3>
        <button className="btn px-2 py-1 text-xs" onClick={onAdd}>{addLabel}</button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-gray-500">{children}</div>;
}

function LineCard({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  return (
    <div className="relative rounded-lg border border-line bg-panel2/40 p-2 pr-8">
      <button className="absolute right-1.5 top-1.5 text-gray-500 hover:text-red-300" onClick={onRemove} title="Remove">✕</button>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Stats({
  active,
  out,
  cost,
  runwayH,
  target,
  bottleneck,
  note,
}: {
  active: boolean;
  out: number;
  cost: number;
  runwayH: number;
  target: number;
  bottleneck: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="text-gray-400">Out/hr <span className="tabular-nums text-gray-200">{active ? fmt(out, 2) : "-"}</span></span>
      <span className="text-gray-400">Cost/hr <Money n={cost} /></span>
      <span className="text-gray-400">Runway <span className={`tabular-nums ${runwayH < target ? "text-amber-400" : "text-gray-200"}`}>{runwayText(runwayH)}</span></span>
      {bottleneck && <span className="text-gray-500">⚠ {bottleneck}</span>}
      {note && <span className="text-amber-400">{note}</span>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-gray-100">{value}</div>
    </div>
  );
}
