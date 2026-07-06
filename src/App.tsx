import { useEffect, useMemo, useState } from "react";
import type { PlanState } from "./types";
import { loadPlan, savePlan } from "./utils/storage";
import { computeMaterialFlows, computeSummary, fmtMoney } from "./utils/calc";
import { StatCard } from "./components/Ui";
import ProductionTab from "./components/ProductionTab";
import MaterialsTab from "./components/MaterialsTab";
import LaborTab from "./components/LaborTab";
import OrdersTab from "./components/OrdersTab";
import RecommendTab from "./components/RecommendTab";
import DataTab from "./components/DataTab";

type TabId = "production" | "recommend" | "materials" | "orders" | "labor" | "data";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "production", label: "Production & Revenue", icon: "🍜" },
  { id: "recommend", label: "Best Sellers", icon: "⭐" },
  { id: "materials", label: "Materials", icon: "🌾" },
  { id: "orders", label: "Orders", icon: "📜" },
  { id: "labor", label: "Labor", icon: "🧑‍🌾" },
  { id: "data", label: "Data", icon: "💾" },
];

export default function App() {
  const [plan, setPlanState] = useState<PlanState>(() => loadPlan());
  const [tab, setTab] = useState<TabId>("production");

  const setPlan = (updater: (p: PlanState) => PlanState) => setPlanState((p) => updater(p));

  useEffect(() => {
    savePlan(plan);
  }, [plan]);

  const flows = useMemo(() => computeMaterialFlows(plan), [plan]);
  const summary = useMemo(() => computeSummary(plan, flows), [plan, flows]);

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-panel/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-100">
                WWM Homestead <span className="text-gold">Planner</span>
              </h1>
              <p className="text-xs text-gray-500">
                Auto revenue · income · material sync · retainer labor — Where Winds Meet
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>Homestead Lv {plan.homesteadLevel}</div>
              <div>Data: official Planner v2.0 + Arbiter</div>
            </div>
          </div>

          {/* KPI bar */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Revenue / hr" value={fmtMoney(summary.revenuePerHr)} accent="gold" sub={`${fmtMoney(summary.revenuePerDay)} / day`} />
            <StatCard label="Profit / hr" value={fmtMoney(summary.profitPerHr)} accent="jade" sub={`${fmtMoney(summary.profitPerWeek)} / week`} />
            <StatCard
              label="Active slots"
              value={`${summary.activeCraftSlots + summary.activeGatherSlots}`}
              sub={`${summary.activeCraftSlots} craft · ${summary.activeGatherSlots} gather · ${summary.farms} farms`}
            />
            <StatCard
              label="Material shortages"
              value={`${summary.shortages}`}
              accent={summary.shortages > 0 ? "red" : "default"}
              sub={summary.shortages > 0 ? "below runway target" : "all supplied"}
            />
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-10 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-gold text-gold"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {tab === "production" && <ProductionTab plan={plan} setPlan={setPlan} />}
        {tab === "recommend" && <RecommendTab plan={plan} setPlan={setPlan} />}
        {tab === "materials" && <MaterialsTab plan={plan} setPlan={setPlan} />}
        {tab === "orders" && <OrdersTab plan={plan} setPlan={setPlan} />}
        {tab === "labor" && <LaborTab plan={plan} />}
        {tab === "data" && <DataTab plan={plan} setPlan={setPlan} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-gray-600">
        Fan-made calculator for Where Winds Meet homestead. Formulas ported from the community
        Homestead Planner v2.0 &amp; Arbiter spreadsheets. Not affiliated with the game.
      </footer>
    </div>
  );
}
