import { PRODUCTS } from "../data/gameData";
import type { PlanState, CraftLine, SellChannel } from "../types";
import { uid } from "../utils/storage";
import { calcCraftLine, bestRetainersFor, fmt, PRODUCT_BY_NAME } from "../utils/calc";
import { NumberInput, Select, Money, SectionTitle } from "./Ui";

const PRODUCT_OPTIONS = [...PRODUCTS]
  .sort((a, b) => a.industry.localeCompare(b.industry) || a.name.localeCompare(b.name))
  .map((p) => ({ value: p.name, label: `${p.name}  (${p.industry})` }));

export default function ProductionTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const update = (id: string, patch: Partial<CraftLine>) =>
    setPlan((p) => ({
      ...p,
      craftLines: p.craftLines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  const remove = (id: string) =>
    setPlan((p) => ({ ...p, craftLines: p.craftLines.filter((l) => l.id !== id) }));
  const add = () =>
    setPlan((p) => ({
      ...p,
      craftLines: [
        ...p.craftLines,
        {
          id: uid(),
          productName: PRODUCTS[0].name,
          retainer: "",
          level: 1,
          slots: 1,
          channel: "restaurant" as SellChannel,
          bestSeller: false,
        },
      ],
    }));

  const calcs = plan.craftLines.map((l) => calcCraftLine(l, plan.priceOverrides));
  const totRev = calcs.reduce((s, c) => s + c.revenuePerHr, 0);
  const totProfit = calcs.reduce((s, c) => s + c.profitPerHr, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle hint="Each row is a production queue slot. Revenue & material draw auto-compute.">
          Production &amp; Revenue
        </SectionTitle>
        <button className="btn btn-gold" onClick={add}>
          + Add production line
        </button>
      </div>

      {plan.craftLines.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No production lines yet. Click <span className="text-gold">Add production line</span> to start —
          pick a dish, wine or kiln item and the app computes revenue, input cost, profit/hr and the
          ingredients it will drain.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Product</th>
                <th className="th">Retainer</th>
                <th className="th w-20">Lvl</th>
                <th className="th w-20">Slots</th>
                <th className="th">Sell at</th>
                <th className="th">Best-seller</th>
                <th className="th text-right">Out/hr</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Revenue/hr</th>
                <th className="th text-right">Profit/hr</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {plan.craftLines.map((line) => {
                const c = calcCraftLine(line, plan.priceOverrides);
                const p = PRODUCT_BY_NAME[line.productName];
                const retOptions = p
                  ? [
                      { value: "", label: "— unassigned —" },
                      ...bestRetainersFor(p.job).map((r) => ({
                        value: r.name,
                        label: `${r.name} · ${p.job} L${r.level}${r.confidant ? " ★" : ""}`,
                      })),
                    ]
                  : [{ value: "", label: "—" }];
                return (
                  <tr key={line.id} className="border-b border-line/50 last:border-0">
                    <td className="td min-w-[220px]">
                      <Select
                        value={line.productName}
                        onChange={(v) => update(line.id, { productName: v })}
                        options={PRODUCT_OPTIONS}
                      />
                      {p && (
                        <div className="mt-1 text-xs text-gray-500">
                          Req Lv {p.lvl ?? "?"} · {p.ingredients.map((i) => `${i.amt}× ${i.name}`).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="td min-w-[190px]">
                      <Select
                        value={line.retainer}
                        onChange={(v) => update(line.id, { retainer: v })}
                        options={retOptions}
                      />
                      {!c.retainerOk && (
                        <div className="mt-1 text-xs text-amber-400">
                          Retainer skill below level {line.level}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      <NumberInput
                        value={line.level}
                        min={1}
                        max={10}
                        onChange={(n) => update(line.id, { level: Math.min(10, Math.max(1, n)) })}
                        className="w-16"
                      />
                      {c.estimated && <div className="mt-1 text-[10px] text-amber-400">est.</div>}
                    </td>
                    <td className="td">
                      <NumberInput
                        value={line.slots}
                        min={0}
                        onChange={(n) => update(line.id, { slots: n })}
                        className="w-16"
                      />
                    </td>
                    <td className="td">
                      <Select<SellChannel>
                        value={line.channel}
                        onChange={(v) => update(line.id, { channel: v })}
                        options={[
                          { value: "restaurant", label: "Restaurant" },
                          { value: "merchant", label: "Merchant" },
                        ]}
                        className="w-32"
                      />
                    </td>
                    <td className="td text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#d9b25b]"
                        checked={line.bestSeller}
                        onChange={(e) => update(line.id, { bestSeller: e.target.checked })}
                      />
                    </td>
                    <td className="td text-right tabular-nums">{fmt(c.outPerHr, 2)}</td>
                    <td className="td text-right tabular-nums">{c.price}</td>
                    <td className="td text-right font-semibold">
                      <Money n={c.revenuePerHr} />
                    </td>
                    <td className="td text-right font-semibold">
                      <Money n={c.profitPerHr} />
                    </td>
                    <td className="td text-right">
                      <button className="btn px-2 py-1" onClick={() => remove(line.id)} title="Remove">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-panel2/40">
                <td className="td font-semibold" colSpan={8}>
                  Total ({plan.craftLines.length} lines)
                </td>
                <td className="td text-right font-bold">
                  <Money n={totRev} className="text-gold" />
                </td>
                <td className="td text-right font-bold">
                  <Money n={totProfit} className="text-jade" />
                </td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Output/hr = base rate × efficiency(level). Revenue = output × price (Merchant or Restaurant,
        +20% when best-seller). Profit = revenue − input cost. Ingredients feed the Materials tab.
      </p>
    </div>
  );
}
