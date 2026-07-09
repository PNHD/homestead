import type { PlanState } from "../types";
import { computeSellables, reSync, fmt, fmtMoney } from "../utils/calc";
import { Money, SectionTitle, StatCard } from "./Ui";

export default function SellTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const items = computeSellables(plan);
  const totalInn = items.reduce((s, p) => s + p.innValue, 0);
  const totalTrade = items.reduce((s, p) => s + p.tradeValue, 0);
  const unpriced = items.filter((i) => i.onHand > 0 && !i.priced).length;

  const setTradePrice = (name: string, v: number) =>
    setPlan((p) => ({
      ...p,
      priceOverrides: { ...p.priceOverrides, [name]: { ...p.priceOverrides[name], trade: v || undefined } },
    }));
  const sold = (name: string) => setPlan((p) => reSync(p, Date.now(), { [name]: 0 }));
  const soldAll = () =>
    setPlan((p) =>
      reSync(p, Date.now(), Object.fromEntries(items.filter((i) => i.onHand > 0).map((i) => [i.name, 0])))
    );

  return (
    <div className="space-y-5">
      <SectionTitle hint="Everything in stock and what it's worth. On-hand auto-syncs from production/gathering/consumption while the app is open — no re-typing. Trade = manual NPC sale; Inn = auto-sale price.">
        Sell &amp; Trade for Profit
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Trade value (manual)" value={fmtMoney(totalTrade)} accent="gold" sub="sell all stock to NPCs now" />
        <StatCard label="Inn value (if unsold)" value={fmtMoney(totalInn)} accent="jade" sub="auto-sale equivalent" />
        <div className="card flex flex-col justify-center gap-2 p-4">
          <button className="btn btn-gold justify-center" onClick={soldAll} disabled={totalTrade + totalInn === 0}>
            Mark all sold
          </button>
          <span className="text-center text-xs text-gray-500">zeroes on-hand stock</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          Your inventory is empty. Enter what you have on the Materials tab (or import your plan), then come
          back to see what it's all worth.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Item</th>
                <th className="th text-right">On hand</th>
                <th className="th text-right">Rate/hr</th>
                <th className="th text-right">Trade $</th>
                <th className="th text-right">Trade value</th>
                <th className="th text-right">Inn $</th>
                <th className="th text-right">Inn value</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.name} className="border-b border-line/50 last:border-0">
                  <td className="td font-medium">
                    {it.name}
                    {it.bestSeller && <span className="text-gold"> ★</span>}
                  </td>
                  <td className="td text-right tabular-nums font-semibold">{fmt(it.onHand, 0)}</td>
                  <td className="td text-right tabular-nums text-gray-400">{it.ratePerHr > 0 ? fmt(it.ratePerHr, 2) : "—"}</td>
                  <td className="td text-right">
                    <input
                      type="number"
                      className="w-16 rounded bg-panel2 px-2 py-1 text-right tabular-nums outline-none focus:ring-1 focus:ring-gold/50"
                      value={it.tradePrice || ""}
                      placeholder="—"
                      onChange={(e) => setTradePrice(it.name, Number(e.target.value))}
                      title="Trade-for-Profit price per unit (editable — set it for raw materials)"
                    />
                  </td>
                  <td className="td text-right font-semibold">
                    {it.tradeValue > 0 ? <Money n={it.tradeValue} className="text-gold" /> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="td text-right tabular-nums text-gray-400">{it.innPrice > 0 ? it.innPrice : "—"}</td>
                  <td className="td text-right">
                    {it.innValue > 0 ? <Money n={it.innValue} className="text-jade" /> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="td text-right">
                    <button
                      className="btn px-2 py-1 text-xs"
                      onClick={() => sold(it.name)}
                      disabled={it.onHand <= 0}
                      title="Mark this stack sold (sets on-hand to 0)"
                    >
                      Sold
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Value = on-hand stock × price. Crops and raw materials have no price in the game sheets
        {unpriced > 0 && <span className="text-amber-400"> ({unpriced} unpriced)</span>} — type their NPC
        sell price in the <span className="text-gray-300">Trade $</span> box to value them. <span className="text-gray-300">Sold</span> zeroes
        that item's on-hand count.
      </p>
    </div>
  );
}
