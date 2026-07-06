import { useMemo, useState } from "react";
import { RETAINERS, MATERIALS, type Job } from "../data/gameData";
import type { PlanState } from "../types";
import {
  recruitedRetainersFor,
  outputPerHr,
  retainerJobLevel,
  isRecruited,
  rosterEntries,
  PRODUCT_BY_NAME,
} from "../utils/calc";
import { NumberInput, SectionTitle } from "./Ui";

const JOBS: Job[] = ["Cook", "Catering", "Kilnwork", "Brewing", "Fishing", "Hunting", "Mining", "Forestry"];

function jobForProduct(name: string): Job | undefined {
  return PRODUCT_BY_NAME[name]?.job as Job | undefined;
}
const GATHER_JOB: Record<string, Job> = Object.fromEntries(
  Object.values(MATERIALS)
    .filter((m) => m.job)
    .map((m) => [m.name, m.job as Job])
);

export default function LaborTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [recruitQ, setRecruitQ] = useState("");
  const [rosterQ, setRosterQ] = useState("");
  const [newName, setNewName] = useState("");

  const addCustom = () => {
    const name = newName.trim();
    if (!name) return;
    setPlan((p) => {
      if (p.customRetainers.some((c) => c.name === name) || RETAINERS.some((r) => r.name === name)) return p;
      return {
        ...p,
        customRetainers: [...p.customRetainers, { name }],
        recruitedOverride: { ...p.recruitedOverride, [name]: true },
      };
    });
    setNewName("");
  };
  const removeCustom = (name: string) =>
    setPlan((p) => {
      const levels = { ...p.retainerLevels };
      delete levels[name];
      const rec = { ...p.recruitedOverride };
      delete rec[name];
      return {
        ...p,
        customRetainers: p.customRetainers.filter((c) => c.name !== name),
        retainerLevels: levels,
        recruitedOverride: rec,
      };
    });

  const setLevel = (name: string, job: Job, level: number) =>
    setPlan((p) => {
      const cur = { ...(p.retainerLevels[name] ?? {}) };
      if (level <= 0) delete cur[job];
      else cur[job] = level;
      const next = { ...p.retainerLevels };
      if (Object.keys(cur).length === 0) delete next[name];
      else next[name] = cur;
      return { ...p, retainerLevels: next };
    });
  const setRecruited = (name: string, v: boolean) =>
    setPlan((p) => ({ ...p, recruitedOverride: { ...p.recruitedOverride, [name]: v } }));

  const demand = useMemo(() => {
    const d: Partial<Record<Job, number>> = {};
    for (const l of plan.craftLines) {
      const job = jobForProduct(l.productName);
      if (job && l.retainer) d[job] = (d[job] ?? 0) + 1;
    }
    for (const g of plan.gatherLines) {
      const job = GATHER_JOB[g.materialName];
      if (job && g.retainer) d[job] = (d[job] ?? 0) + 1;
    }
    return d;
  }, [plan.craftLines, plan.gatherLines]);

  const recruitNext = useMemo(() => {
    const q = recruitQ.trim().toLowerCase();
    return RETAINERS.filter((r) => !isRecruited(r.name, plan))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.innate ?? "").toLowerCase().includes(q))
      .sort((a, b) => (b.recruitPriority ?? 0) - (a.recruitPriority ?? 0));
  }, [plan.recruitedOverride, recruitQ]);

  const recruitAll = () =>
    setPlan((p) => ({ ...p, recruitedOverride: Object.fromEntries(RETAINERS.map((r) => [r.name, true])) }));
  const clearAll = () =>
    setPlan((p) => ({ ...p, recruitedOverride: Object.fromEntries(RETAINERS.map((r) => [r.name, false])) }));
  const resetRoster = () => setPlan((p) => ({ ...p, recruitedOverride: {} }));

  const allEntries = rosterEntries(plan);
  const recruitedCount = allEntries.filter((r) => isRecruited(r.name, plan)).length;
  const roster = allEntries
    .filter((r) => showAll || isRecruited(r.name, plan))
    .filter((r) => !rosterQ.trim() || r.name.toLowerCase().includes(rosterQ.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      {recruitedCount === 0 && (
        <div className="card border-gold/40 bg-gold/5 p-4 text-sm text-gray-200">
          👋 No retainers are marked recruited yet. Tick the ones you actually have below (or use{" "}
          <span className="text-gold">Recruit all</span>) and set their skill levels — the whole app then
          plans around <em>your</em> roster. Nothing is preloaded from anyone else's game.
        </div>
      )}
      <div>
        <SectionTitle hint="Best recruited retainer per job, by your levels. ★ = confidant.">
          Best retainer per job
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {JOBS.map((job) => {
            const list = recruitedRetainersFor(job, plan);
            const dem = demand[job] ?? 0;
            return (
              <div key={job} className="card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-100">{job}</h3>
                  {(() => {
                    const cap = plan.skillSlots[job] ?? 0;
                    const over = dem > cap;
                    return (
                      <span className={`chip ${over ? "bg-red-500/20 text-red-300" : "bg-gold/15 text-gold"}`}>
                        {dem}/{cap} slots
                      </span>
                    );
                  })()}
                </div>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No recruited retainer has this skill.</p>
                ) : (
                  <ol className="mt-2 space-y-1">
                    {list.slice(0, 4).map((r, i) => (
                      <li key={r.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-200">
                          <span className="text-gray-500">{i + 1}.</span> {r.name}
                          {r.confidant && <span className="text-gold"> ★</span>}
                        </span>
                        <span className="tabular-nums text-gray-400">
                          L{r.level} · {outputPerHr(job, r.level).toFixed(2)}/hr
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Recruit priority</h2>
            <p className="text-xs text-gray-500">
              {recruitedCount}/{allEntries.length} recruited · from the Retainer Guide, highest priority first.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="input w-48"
              placeholder="Search name / skill…"
              value={recruitQ}
              onChange={(e) => setRecruitQ(e.target.value)}
            />
            <button className="btn" onClick={recruitAll}>Recruit all</button>
            <button className="btn" onClick={clearAll}>Clear all</button>
            <button className="btn" onClick={resetRoster}>Reset to sheet</button>
          </div>
        </div>
        {recruitNext.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            {recruitQ.trim() ? "No match." : "Everyone is recruited. 🎉"}
          </div>
        ) : (
          <div className="card max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Priority</th>
                  <th className="th">Retainer</th>
                  <th className="th">Innate skills</th>
                  <th className="th">Method</th>
                  <th className="th text-center">Recruited?</th>
                </tr>
              </thead>
              <tbody>
                {recruitNext.map((r) => (
                  <tr key={r.name} className="border-b border-line/50 last:border-0">
                    <td className="td whitespace-nowrap">
                      <span className="text-gold">{"★".repeat(Math.round(r.recruitPriority ?? 0))}</span>
                      <span className="text-gray-700">{"★".repeat(5 - Math.round(r.recruitPriority ?? 0))}</span>
                    </td>
                    <td className="td font-medium">
                      {r.name}
                      {r.confidant && <span className="text-gold"> ★</span>}
                    </td>
                    <td className="td text-gray-400">{r.innate ?? "—"}</td>
                    <td className="td text-gray-400">{r.recruitMethod ?? "—"}</td>
                    <td className="td text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#5bbf9a]"
                        checked={isRecruited(r.name, plan)}
                        onChange={(e) => setRecruited(r.name, e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Your roster</h2>
            <p className="text-xs text-gray-500">
              Tick recruited and edit skill levels to match your game. Missing an NPC (e.g. Zhang Hu)? Add them below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              <input
                className="input w-40"
                placeholder="Add retainer name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
              />
              <button className="btn btn-gold" onClick={addCustom}>
                + Add
              </button>
            </div>
            <input
              className="input w-44"
              placeholder="Search retainer…"
              value={rosterQ}
              onChange={(e) => setRosterQ(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" className="h-4 w-4 accent-[#d9b25b]" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show all
            </label>
          </div>
        </div>
        <div className="card max-h-[36rem] overflow-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Retainer</th>
                <th className="th text-center">Have</th>
                {JOBS.map((j) => (
                  <th key={j} className="th text-center">
                    {j.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.name} className={`border-b border-line/50 last:border-0 ${!isRecruited(r.name, plan) ? "opacity-50" : ""}`}>
                  <td className="td font-medium">
                    {r.name}
                    {r.confidant && <span className="text-gold" title="Confidant"> ★</span>}
                    {r.custom && (
                      <>
                        <span className="ml-2 chip bg-sky-500/15 text-sky-300">custom</span>
                        <button
                          className="ml-2 text-gray-500 hover:text-red-400"
                          title="Remove custom retainer"
                          onClick={() => removeCustom(r.name)}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </td>
                  <td className="td text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#5bbf9a]"
                      checked={isRecruited(r.name, plan)}
                      onChange={(e) => setRecruited(r.name, e.target.checked)}
                    />
                  </td>
                  {JOBS.map((j) => {
                    const lv = retainerJobLevel(r.name, j, plan.retainerLevels);
                    return (
                      <td key={j} className="td text-center">
                        <NumberInput
                          value={lv}
                          min={0}
                          max={10}
                          onChange={(n) => setLevel(r.name, j, Math.min(10, Math.max(0, n)))}
                          className="w-14 text-center"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
