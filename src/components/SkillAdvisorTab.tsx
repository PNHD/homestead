import { useMemo } from "react";
import type { PlanState } from "../types";
import { skillUpgrades, respecAdvice, fmt } from "../utils/calc";
import { SectionTitle } from "./Ui";

export default function SkillAdvisorTab({ plan }: { plan: PlanState; setPlan: (u: (p: PlanState) => PlanState) => void }) {
  const upgrades = useMemo(() => skillUpgrades(plan), [plan]);
  const respec = useMemo(() => respecAdvice(plan), [plan]);

  const worth = upgrades.filter((u) => !u.atCap && u.gainToCapPerHr > 0.01);
  const capped = upgrades.filter((u) => u.atCap);
  const dead = upgrades.filter((u) => !u.atCap && u.gainToCapPerHr <= 0.01); // room to level but no profit
  const totalToCap = worth.reduce((s, u) => s + u.gainToCapPerHr, 0);

  return (
    <div className="space-y-5">
      <SectionTitle hint="Which retainer skill to level next for the most profit. Δ is the exact profit/hr change (it already accounts for whether catering can sell the extra output). Mystic jobs peak at L6; Brewing & Catering flatline at L5.">
        Skill Advisor — level &amp; respec for max profit
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Profit if you level all to cap</div>
          <div className="mt-1 text-xl font-bold text-jade tabular-nums">+{fmt(totalToCap, 1)} / hr</div>
          <div className="mt-0.5 text-xs text-gray-500">{fmt(totalToCap * 24, 0)} / day</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Worth upgrading</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{worth.length}</div>
          <div className="mt-0.5 text-xs text-gray-500">{upgrades.filter((u) => u.jackpot).length} at the L5→L6 jackpot</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">Don't invest</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{capped.length + dead.length}</div>
          <div className="mt-0.5 text-xs text-gray-500">capped or zero-gain</div>
        </div>
      </div>

      {/* Upgrade priority */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">⬆️ Upgrade priority</h3>
        {worth.length === 0 ? (
          <div className="card p-4 text-sm text-gray-500">Every staffed retainer is already at its useful cap — nothing left to level for profit.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Retainer</th>
                  <th className="th">Job</th>
                  <th className="th text-right">Level</th>
                  <th className="th text-right">Next +1 (Δ/hr)</th>
                  <th className="th text-right">To cap (Δ/hr)</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {worth.map((u) => (
                  <tr key={`${u.retainer}|${u.job}`} className={`border-b border-line/50 last:border-0 ${u.jackpot ? "bg-gold/5" : ""}`}>
                    <td className="td font-medium">{u.retainer}</td>
                    <td className="td text-gray-400">{u.job}</td>
                    <td className="td text-right tabular-nums">
                      L{u.level} <span className="text-gray-600">→ {u.toLevel}</span>
                    </td>
                    <td className="td text-right font-semibold tabular-nums text-gold">+{fmt(u.gainPerHr, 1)}</td>
                    <td className="td text-right font-semibold tabular-nums text-jade">+{fmt(u.gainToCapPerHr, 1)}</td>
                    <td className="td">
                      {u.jackpot && <span className="chip bg-gold/15 text-gold">🎯 L5→L6 jackpot</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Don't invest */}
      {(capped.length > 0 || dead.length > 0) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-200">🛑 Don't invest (no profit from more levels)</h3>
          <div className="card p-3 text-sm text-gray-400">
            {capped.length > 0 && (
              <p>
                <span className="text-gray-200">At cap:</span>{" "}
                {capped.map((u) => `${u.retainer} (${u.job} L${u.level})`).join(", ")}.{" "}
                <span className="text-gray-500">Brewing/Catering peak at L5, mystic jobs at L6.</span>
              </p>
            )}
            {dead.length > 0 && (
              <p className="mt-2">
                <span className="text-gray-200">Zero gain:</span>{" "}
                {dead.map((u) => `${u.retainer} (${u.job} L${u.level})`).join(", ")}.{" "}
                <span className="text-gray-500">Leveling adds output but catering can't sell more of it — fix the bottleneck first.</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Assign idle (no respec needed) */}
      {respec.assignable.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-200">🎯 Staff these first (no respec needed)</h3>
          <div className="card p-3 text-sm text-gray-400">
            Idle but their skill's job still has an open slot — just assign them, don't waste a respec:{" "}
            <span className="text-gray-200">{respec.assignable.map((r) => `${r.name} (${r.job} L${r.level})`).join(", ")}</span>.
          </div>
        </div>
      )}

      {/* Respec */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-200">♻️ Respec (reset skill points)</h3>
        <div className="card p-3 text-sm text-gray-400">
          {respec.respec.length === 0 ? (
            <p>No idle retainer is stuck in a full job — nothing to respec right now.</p>
          ) : respec.freeSlots.length === 0 ? (
            <p>
              These have strong idle skill but every job is full:{" "}
              <span className="text-gray-200">{respec.respec.map((r) => `${r.name} (${r.job} L${r.level})`).join(", ")}</span>.
              Respec only pays once you free a slot or a job becomes your bottleneck.
            </p>
          ) : (
            <>
              <p>
                <span className="text-gray-200">Idle skill stuck in a full job</span> — respec candidates:{" "}
                {respec.respec.map((r) => `${r.name} (${r.job} L${r.level})`).join(", ")}.
              </p>
              <p className="mt-2">
                <span className="text-gray-200">Move their points to a job with openings:</span>{" "}
                {respec.freeSlots.map((s) => `${s.job} ×${s.open}`).join(", ")}.
              </p>
            </>
          )}
          <p className="mt-2 text-xs text-gray-600">
            Respec keeps the retainer but reallocates their points. The post-respec level depends on the game's
            conversion, so this names who &amp; where, not the final number.
          </p>
        </div>
      </div>
    </div>
  );
}
