import { useMemo, useState } from "react";
import { RETAINERS, MATERIALS, type Job } from "../data/gameData";
import type { PlanState } from "../types";
import { bestRetainersFor, outputPerHr, PRODUCT_BY_NAME } from "../utils/calc";
import { SectionTitle } from "./Ui";

// dish→Cook, wine→Brewing, kiln→Kilnwork. (Catering is a separate serving slot.)
function jobForProduct(name: string): Job | undefined {
  return PRODUCT_BY_NAME[name]?.job as Job | undefined;
}
const GATHER_JOB: Record<string, Job> = Object.fromEntries(
  Object.values(MATERIALS)
    .filter((m) => m.job)
    .map((m) => [m.name, m.job as Job])
);

const JOBS: Job[] = ["Cook", "Catering", "Kilnwork", "Brewing", "Fishing", "Hunting", "Mining", "Forestry"];

export default function LaborTab({ plan }: { plan: PlanState }) {
  const [recruitedOnly, setRecruitedOnly] = useState(true);

  // how many slots each job is being asked to run in the current plan
  const demand = useMemo(() => {
    const d: Partial<Record<Job, number>> = {};
    for (const l of plan.craftLines) {
      const job = jobForProduct(l.productName);
      if (job) d[job] = (d[job] ?? 0) + Math.max(0, l.slots);
    }
    for (const g of plan.gatherLines) {
      const mat = g.materialName;
      const job = GATHER_JOB[mat];
      if (job) d[job] = (d[job] ?? 0) + Math.max(0, g.slots);
    }
    return d;
  }, [plan]);

  const roster = RETAINERS.filter((r) => (recruitedOnly ? r.recruited : true));

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle hint="Best retainer per job, ranked by skill level. ★ = confidant.">
          Labor &amp; retainer assignment
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {JOBS.map((job) => {
            const list = bestRetainersFor(job, recruitedOnly);
            const dem = demand[job] ?? 0;
            return (
              <div key={job} className="card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-100">{job}</h3>
                  {dem > 0 && (
                    <span className="chip bg-gold/15 text-gold">{dem} slot{dem > 1 ? "s" : ""} planned</span>
                  )}
                </div>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No {recruitedOnly ? "recruited " : ""}retainer has this skill.</p>
                ) : (
                  <ol className="mt-2 space-y-1">
                    {list.slice(0, 5).map((r, i) => (
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Retainer roster</h2>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#d9b25b]"
              checked={recruitedOnly}
              onChange={(e) => setRecruitedOnly(e.target.checked)}
            />
            Recruited only
          </label>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Retainer</th>
                {JOBS.map((j) => (
                  <th key={j} className="th text-center">
                    {j.slice(0, 4)}
                  </th>
                ))}
                <th className="th">Best</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.name} className="border-b border-line/50 last:border-0">
                  <td className="td font-medium">
                    {r.name}
                    {r.confidant && <span className="text-gold" title="Confidant"> ★</span>}
                  </td>
                  {JOBS.map((j) => (
                    <td key={j} className="td text-center tabular-nums">
                      {r.skills[j] ? (
                        <span className="text-gray-200">{r.skills[j]}</span>
                      ) : (
                        <span className="text-gray-700">·</span>
                      )}
                    </td>
                  ))}
                  <td className="td text-gray-400">
                    {r.bestSkill} {r.bestLvl ? `L${r.bestLvl}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
