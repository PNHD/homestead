import { useEffect, useState } from "react";
import type { PlanState } from "../types";
import { computeProduced, fmt, fmtMoney } from "../utils/calc";
import { Money, SectionTitle, StatCard } from "./Ui";

export default function SellTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const produced = computeProduced(plan, now);
  const totalInn = produced.reduce((s, p) => s + p.innValue, 0);
  const totalTrade = produced.reduce((s, p) => s + p.tradeValue, 0);

  const sold = (name: string) =>
    setPlan((p) => ({ ...p, soldAt: { ...p.soldAt, [name]: Date.now() } }));
  const soldAll = () =>
    setPlan((p) => {
      const soldAt = { ...p.soldAt };
      for (const it of produced) soldAt[it.name] = Date.now();
      return { ...p, soldAt };
    });
  const resetAll = () => setPlan((p) => ({ ...p, trackingSince: Date.now(), soldAt: {} }));

  return (
    <div className="space-y-5">
      <SectionTitle hint="Estimated units piled up since each item was last sold, and what they're worth.">
        Sell &amp; Trade for Profit
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Trade value (manual)" value={fmtMoney(totalTrade)} accent="gold" sub="if you sell all to NPCs now" />
        <StatCard label="Inn value (if unsold)" value={fmtMoney(totalInn)} accent="jade" sub="auto-sale equivalent" />
        <div className="card flex flex-col justify-center gap-2 p-4">
          <button className="btn btn-gold justify-center" onClick={soldAll} disabled={produced.length === 0}>
            Mark all sold
          </button>
          <button className="btn justify-center text-xs" onClick={resetAll}>
            Reset all timers
          </button>
        </div>
      </div>

      {produced.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          Nothing accumulating yet. Add production lines with an assigned retainer, then come back later to
          see how much has been made and its Trade value.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Product</th>
                <th className="th text-right">Rate/hr</th>
                <th className="th text-right">Accrued</th>
                <th className="th text-right">Units made</th>
                <th className="th text-right">Trade value</th>
                <th className="th text-right">Inn value</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {produced.map((it) => (
                <tr key={it.name} className="border-b border-line/50 last:border-0">
                  <td className="td font-medium">
                    {it.name}
                    {it.bestSeller && <span className="text-gold"> ★</span>}
                  </td>
                  <td className="td text-right tabular-nums">{fmt(it.ratePerHr, 2)}</td>
                  <td className="td text-right tabular-nums text-gray-400">{fmt(it.hours, 1)}h</td>
                  <td className="td text-right tabular-nums font-semibold">{fmt(it.units, 0)}</td>
                  <td className="td text-right font-semibold">
                    <Money n={it.tradeValue} className="text-gold" />
                  </td>
                  <td className="td text-right">
                    <Money n={it.innValue} className="text-jade" />
                  </td>
                  <td className="td text-right">
                    <button className="btn px-2 py-1 text-xs" onClick={() => sold(it.name)} title="Reset this item's timer">
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
        Units made = production rate × time since the item was last marked sold (updates automatically).
        Click <span className="text-gray-300">Sold</span> after you sell it in-game to reset that item's
        timer. Trade value uses the manual Trade-for-Profit price; Inn value is the auto-sale equivalent.
      </p>
    </div>
  );
}
