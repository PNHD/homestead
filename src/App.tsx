import { useEffect, useMemo, useState } from "react";
import type { PlanState } from "./types";
import { loadPlan, savePlan } from "./utils/storage";
import { computeMaterialFlows, computeSummary, fmtMoney } from "./utils/calc";
import { StatCard } from "./components/Ui";
import DashboardTab from "./components/DashboardTab";
import WeeklyPlanTab from "./components/WeeklyPlanTab";
import ProductionTab from "./components/ProductionTab";
import SellTab from "./components/SellTab";
import MaterialsTab from "./components/MaterialsTab";
import LaborTab from "./components/LaborTab";
import OrdersTab from "./components/OrdersTab";
import RecommendTab from "./components/RecommendTab";
import OptimizerTab from "./components/OptimizerTab";
import DataTab from "./components/DataTab";

type TabId =
  | "dashboard"
  | "weekly"
  | "production"
  | "sell"
  | "recommend"
  | "optimizer"
  | "materials"
  | "orders"
  | "labor"
  | "data";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "weekly", label: "Weekly Plan", icon: "🗓️" },
  { id: "production", label: "Production & Revenue", icon: "🍜" },
  { id: "sell", label: "Sell & Trade", icon: "💰" },
  { id: "recommend", label: "Best Sellers", icon: "⭐" },
  { id: "optimizer", label: "Optimizer", icon: "🎯" },
  { id: "materials", label: "Materials", icon: "🌾" },
  { id: "orders", label: "Orders", icon: "📜" },
  { id: "labor", label: "Roster", icon: "🧑‍🌾" },
  { id: "data", label: "Data", icon: "💾" },
];

export default function App() {
  const [plan, setPlanState] = useState<PlanState>(() => loadPlan());
  const [tab, setTab] = useState<TabId>("dashboard");

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
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <label className="flex items-center gap-1.5 text-gray-400">
                Homestead Lv
                <select
                  className="input w-16 py-1"
                  value={plan.homesteadLevel}
                  onChange={(e) => setPlan((p) => ({ ...p, homesteadLevel: Number(e.target.value) }))}
                  title="Gates which recipes the recommendations offer"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => (
                    <option key={lv} value={lv}>
                      {lv}
                    </option>
                  ))}
                </select>
              </label>
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
        {tab === "dashboard" && <DashboardTab plan={plan} goto={(t) => setTab(t as TabId)} />}
        {tab === "weekly" && <WeeklyPlanTab plan={plan} setPlan={setPlan} />}
        {tab === "production" && <ProductionTab plan={plan} setPlan={setPlan} />}
        {tab === "sell" && <SellTab plan={plan} setPlan={setPlan} />}
        {tab === "recommend" && <RecommendTab plan={plan} setPlan={setPlan} />}
        {tab === "optimizer" && <OptimizerTab plan={plan} setPlan={setPlan} />}
        {tab === "materials" && <MaterialsTab plan={plan} setPlan={setPlan} />}
        {tab === "orders" && <OrdersTab plan={plan} setPlan={setPlan} />}
        {tab === "labor" && <LaborTab plan={plan} setPlan={setPlan} />}
        {tab === "data" && <DataTab plan={plan} setPlan={setPlan} />}
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-gray-600">
        Fan-made calculator for Where Winds Meet homestead. Formulas ported from the community
        Homestead Planner v2.0 &amp; Arbiter spreadsheets. Not affiliated with the game.
      </footer>
    </div>
  );
}
