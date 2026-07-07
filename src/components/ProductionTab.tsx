import { PRODUCTS, type Product } from "../data/gameData";
import type { PlanState, CraftLine, ServeLine } from "../types";
import { uid } from "../utils/storage";
import {
  calcCraftLine,
  calcServeLine,
  computeMaterialFlows,
  computeServe,
  recruitedRetainersFor,
  busyRetainers,
  fmt,
  PRODUCT_BY_NAME,
} from "../utils/calc";
import { Combobox, Money, SectionTitle } from "./Ui";

const PRODUCT_OPTIONS = [...PRODUCTS]
  .sort((a, b) => a.industry.localeCompare(b.industry) || a.name.localeCompare(b.name))
  .map((p) => ({ value: p.name, label: `${p.name} - ${p.industry}` }));

const SERVE_OPTIONS = PRODUCTS.filter((p) => p.type === "Dish" || p.type === "Wine")
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
  .map((p) => ({ value: p.name, label: `${p.name} - ${p.type}` }));

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

function runwayText(hours: number) {
  return hours === Infinity ? "OK" : `${fmt(hours, 1)}h`;
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
  const duplicateCraft = (id: string) =>
    setPlan((p) => {
      const src = p.craftLines.find((l) => l.id === id);
      if (!src) return p;
      const i = p.craftLines.findIndex((l) => l.id === id);
      const next = [...p.craftLines];
      next.splice(i + 1, 0, { ...src, id: uid() });
      return { ...p, craftLines: next };
    });
  const addCraft = () =>
    setPlan((p) => ({
      ...p,
      craftLines: [...p.craftLines, { id: uid(), productName: PRODUCTS[0].name, retainer: "", bestSeller: false }],
    }));

  const updateServe = (id: string, patch: Partial<ServeLine>) =>
    setPlan((p) => ({ ...p, serveLines: (p.serveLines ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const removeServe = (id: string) =>
    setPlan((p) => ({ ...p, serveLines: (p.serveLines ?? []).filter((l) => l.id !== id) }));
  const duplicateServe = (id: string) =>
    setPlan((p) => {
      const lines = p.serveLines ?? [];
      const src = lines.find((l) => l.id === id);
      if (!src) return p;
      const i = lines.findIndex((l) => l.id === id);
      const next = [...lines];
      next.splice(i + 1, 0, { ...src, id: uid() });
      return { ...p, serveLines: next };
    });
  const addServe = () =>
    setPlan((p) => ({
      ...p,
      serveLines: [...(p.serveLines ?? []), { id: uid(), productName: SERVE_OPTIONS[0]?.value ?? "", retainer: "", bestSeller: false }],
    }));

  return (
    <div className="space-y-6">
      <SectionTitle hint="Production makes stock. Restaurant catering consumes dish/wine stock and creates Inn income.">
        Production &amp; Catering
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Produced items/hr" value={fmt(craftCalcs.reduce((s, c) => s + c.outPerHr, 0), 1)} />
        <Mini label="Catered items/hr" value={fmt(serve.servedPerHr, 1)} />
        <Mini label="Inn income/hr" value={<Money n={innIncome} className="text-gold" />} />
        <Mini label="Net profit/hr" value={<Money n={innIncome - productionCost} className="text-jade" />} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Production queues</h2>
            <p className="text-xs text-gray-500">Cook/Kiln/Brew rows only produce inventory and consume recipe materials.</p>
          </div>
          <button className="btn btn-gold whitespace-nowrap" onClick={addCraft}>+ Production line</button>
        </div>
        {plan.craftLines.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">Add production lines to make dishes, wine or kiln items.</div>
        ) : (
          <div className="card max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[1080px]">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line">
                  <th className="th">Product</th>
                  <th className="th">Retainer</th>
                  <th className="th text-right">Out/hr</th>
                  <th className="th text-right">Input cost/hr</th>
                  <th className="th text-right">Material runway</th>
                  <th className="th">Bottleneck</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {plan.craftLines.map((line) => {
                  const c = calcCraftLine(line, plan);
                  const p = PRODUCT_BY_NAME[line.productName];
                  const runway = productRunway(p, flows);
                  const busy = busyRetainers(plan, line.id);
                  const retOptions = p
                    ? [
                        { value: "", label: "- assign retainer -" },
                        ...recruitedRetainersFor(p.job, plan)
                          .filter((r) => !busy.has(r.name))
                          .map((r) => ({
                            value: r.name,
                            label: `${r.name} - ${p.job} L${r.level}${r.confidant ? " *" : ""}`,
                          })),
                      ]
                    : [{ value: "", label: "-" }];
                  return (
                    <tr key={line.id} className="border-b border-line/50 last:border-0">
                      <td className="td min-w-[260px]">
                        <Combobox value={line.productName} onChange={(v) => updateCraft(line.id, { productName: v })} options={PRODUCT_OPTIONS} placeholder="Search product..." />
                        {p && <div className="mt-1 text-xs text-gray-500">Req Lv {p.lvl ?? "?"} - {p.ingredients.map((i) => `${i.amt}x ${i.name}`).join(", ")}</div>}
                      </td>
                      <td className="td min-w-[220px]">
                        <Combobox value={line.retainer} onChange={(v) => updateCraft(line.id, { retainer: v })} options={retOptions} placeholder="Search retainer..." />
                        {!c.active && <div className="mt-1 text-xs text-amber-400">{retOptions.length <= 1 ? "No recruited retainer with this skill" : "Assign a retainer"}</div>}
                        {c.active && <div className="mt-1 text-xs text-gray-500">{p?.job} L{c.level}{c.estimated && <span className="text-amber-400"> - est</span>}</div>}
                      </td>
                      <td className="td text-right tabular-nums">{c.active ? fmt(c.outPerHr, 2) : "-"}</td>
                      <td className="td text-right"><Money n={c.inputCostPerHr} /></td>
                      <td className={`td text-right tabular-nums ${runway.hours < plan.runwayTargetH ? "text-amber-400" : "text-gray-200"}`}>{runwayText(runway.hours)}</td>
                      <td className="td text-gray-400">{runway.names.join(", ") || "-"}</td>
                      <td className="td">
                        <div className="flex gap-1">
                          <button className="btn px-2 py-1" onClick={() => duplicateCraft(line.id)} title="Duplicate">Copy</button>
                          <button className="btn px-2 py-1" onClick={() => removeCraft(line.id)} title="Remove">X</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Restaurant catering</h2>
            <p className="text-xs text-gray-500">Restaurant rows consume finished dishes/wine. Income is zero until you add Catering lines.</p>
          </div>
          <button className="btn whitespace-nowrap" onClick={addServe}>+ Catering line</button>
        </div>
        {(plan.serveLines ?? []).length === 0 ? (
          <div className="card p-8 text-center text-gray-500">No catering lines yet. Add one to sell cooked dishes or brewed wine for Inn income.</div>
        ) : (
          <div className="card max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[980px]">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line">
                  <th className="th">Item to serve</th>
                  <th className="th">Catering retainer</th>
                  <th className="th text-center">Best-seller</th>
                  <th className="th text-right">Consume/hr</th>
                  <th className="th text-right">Inn $</th>
                  <th className="th text-right">Income/hr</th>
                  <th className="th text-right">Stock runway</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {(plan.serveLines ?? []).map((line) => {
                  const s = calcServeLine(line, plan);
                  const runway = itemRunway(line.productName, flows);
                  const busy = busyRetainers(plan, line.id);
                  const retOptions = [
                    { value: "", label: "- assign caterer -" },
                    ...recruitedRetainersFor("Catering", plan)
                      .filter((r) => !busy.has(r.name))
                      .map((r) => ({ value: r.name, label: `${r.name} - Catering L${r.level}${r.confidant ? " *" : ""}` })),
                  ];
                  return (
                    <tr key={line.id} className="border-b border-line/50 last:border-0">
                      <td className="td min-w-[260px]"><Combobox value={line.productName} onChange={(v) => updateServe(line.id, { productName: v })} options={SERVE_OPTIONS} placeholder="Search dish or wine..." /></td>
                      <td className="td min-w-[220px]">
                        <Combobox value={line.retainer} onChange={(v) => updateServe(line.id, { retainer: v })} options={retOptions} placeholder="Search caterer..." />
                        {!s.active && <div className="mt-1 text-xs text-amber-400">Assign a recruited Catering retainer</div>}
                        {s.active && <div className="mt-1 text-xs text-gray-500">Catering L{s.level}{s.estimated && <span className="text-amber-400"> - est</span>}</div>}
                      </td>
                      <td className="td text-center"><input type="checkbox" className="h-4 w-4 accent-[#d9b25b]" checked={line.bestSeller} onChange={(e) => updateServe(line.id, { bestSeller: e.target.checked })} /></td>
                      <td className="td text-right tabular-nums">{s.active ? fmt(s.servedPerHr, 2) : "-"}</td>
                      <td className="td text-right tabular-nums">{s.innPrice || "-"}</td>
                      <td className="td text-right font-semibold"><Money n={s.incomePerHr} className="text-gold" /></td>
                      <td className={`td text-right tabular-nums ${runway.hours < plan.runwayTargetH ? "text-amber-400" : "text-gray-200"}`}>{runwayText(runway.hours)}</td>
                      <td className="td"><div className="flex gap-1"><button className="btn px-2 py-1" onClick={() => duplicateServe(line.id)}>Copy</button><button className="btn px-2 py-1" onClick={() => removeServe(line.id)}>X</button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Cook/Brew/Kiln rows create stock and draw ingredients. Restaurant rows consume dish/wine stock and create Inn income. Kiln items and surplus stock can still be tracked for manual Trade on the Sell tab.
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-gray-100">{value}</div>
    </div>
  );
}