import { useMemo, useState } from "react";
import type { PlanState, Order, OrderReq } from "../types";
import { uid } from "../utils/storage";
import { computeOrderRequirements, orderableItems, parseItemQtyLines, reSync, fmt } from "../utils/calc";
import { NumberInput, Combobox, SectionTitle } from "./Ui";

const ITEM_OPTIONS = orderableItems().map((n) => ({ value: n, label: n }));
const EMPTY_REQ = (): OrderReq => ({ item: ITEM_OPTIONS[0]?.value ?? "", qty: 1 });

export default function OrdersTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const reqs = useMemo(() => computeOrderRequirements(plan), [plan]);
  const [bulkOrder, setBulkOrder] = useState("");

  const addOrder = () =>
    setPlan((p) => ({
      ...p,
      orders: [
        ...p.orders,
        { id: uid(), name: `Order ${p.orders.length + 1}`, reqs: [EMPTY_REQ()], done: false },
      ],
    }));
  const importOrder = () => {
    const rows = parseItemQtyLines(bulkOrder, ITEM_OPTIONS.map((o) => o.value));
    if (rows.length === 0) return;
    setPlan((p) => ({
      ...p,
      orders: [
        ...p.orders,
        { id: uid(), name: `Order ${p.orders.length + 1}`, reqs: rows, done: false },
      ],
    }));
    setBulkOrder("");
  };
  const updOrder = (id: string, patch: Partial<Order>) =>
    setPlan((p) => ({ ...p, orders: p.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const rmOrder = (id: string) =>
    setPlan((p) => ({ ...p, orders: p.orders.filter((o) => o.id !== id) }));
  const updReq = (id: string, idx: number, patch: Partial<OrderReq>) =>
    setPlan((p) => ({
      ...p,
      orders: p.orders.map((o) =>
        o.id === id ? { ...o, reqs: o.reqs.map((r, i) => (i === idx ? { ...r, ...patch } : r)) } : o
      ),
    }));
  const addReq = (id: string) =>
    setPlan((p) => ({
      ...p,
      orders: p.orders.map((o) => (o.id === id ? { ...o, reqs: [...o.reqs, EMPTY_REQ()] } : o)),
    }));
  const rmReq = (id: string, idx: number) =>
    setPlan((p) => ({
      ...p,
      orders: p.orders.map((o) =>
        o.id === id ? { ...o, reqs: o.reqs.filter((_, i) => i !== idx) } : o
      ),
    }));

  const openShort = reqs.filter((r) => r.shortfall > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionTitle hint="Track this week's touchstone orders. Requirements roll up against stock & production.">
          Touchstone orders
        </SectionTitle>
        <button className="btn btn-gold" onClick={addOrder}>
          + Add order
        </button>
      </div>

      <div className="card flex flex-wrap items-end gap-2 p-3">
        <textarea
          className="input min-h-20 flex-1"
          value={bulkOrder}
          onChange={(e) => setBulkOrder(e.target.value)}
          placeholder={"Paste one order, one item per line: Celadon Ewer 25"}
        />
        <button className="btn btn-gold" onClick={importOrder} disabled={!bulkOrder.trim()}>
          Import order lines
        </button>
      </div>

      {plan.orders.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No orders yet. Add this week's touchstone orders and their required item quantities — the
          table below shows what you're short and how long it takes to make.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {plan.orders.map((o) => (
            <div key={o.id} className={`card p-4 ${o.done ? "opacity-60" : ""}`}>
              <div className="mb-3 flex items-center gap-2">
                <input
                  className="input flex-1 font-medium"
                  value={o.name}
                  onChange={(e) => updOrder(o.id, { name: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#5bbf9a]"
                    checked={o.done}
                    onChange={(e) => updOrder(o.id, { done: e.target.checked })}
                  />
                  Done
                </label>
                <button className="btn px-2 py-1" onClick={() => rmOrder(o.id)}>
                  ✕
                </button>
              </div>
              <div className="space-y-2">
                {o.reqs.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Combobox
                      value={r.item}
                      onChange={(v) => updReq(o.id, i, { item: v })}
                      options={ITEM_OPTIONS}
                      placeholder="Search item…"
                      className="flex-1"
                    />
                    <NumberInput
                      value={r.qty}
                      min={1}
                      onChange={(n) => updReq(o.id, i, { qty: n })}
                      className="w-20"
                    />
                    <button
                      className="btn px-2 py-1"
                      onClick={() => rmReq(o.id, i)}
                      disabled={o.reqs.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button className="btn w-full justify-center py-1 text-xs" onClick={() => addReq(o.id)}>
                  + item
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* rolled-up requirements */}
      <div>
        <SectionTitle hint={openShort > 0 ? `${openShort} item(s) short` : "everything in stock or producing"}>
          Requirements
        </SectionTitle>
        {reqs.length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            Add order items above to see the combined requirement, shortfall and time-to-fill.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Item</th>
                  <th className="th">Source</th>
                  <th className="th text-right">Needed</th>
                  <th className="th text-right w-28">In stock</th>
                  <th className="th text-right">Short</th>
                  <th className="th text-right">Net/hr</th>
                  <th className="th text-right">Fill time</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.item} className="border-b border-line/50 last:border-0">
                    <td className="td font-medium">
                      {r.item}
                      {!r.canMake && <span className="ml-2 text-xs text-gray-500">(gathered/bought)</span>}
                    </td>
                    <td className="td text-gray-400">{r.source}</td>
                    <td className="td text-right tabular-nums">{fmt(r.needed, 0)}</td>
                    <td className="td text-right">
                      <NumberInput
                        value={Math.round(r.inStock)}
                        min={0}
                        onChange={(n) => setPlan((p) => reSync(p, Date.now(), { [r.item]: n }))}
                        className="w-24 text-right"
                      />
                    </td>
                    <td className={`td text-right tabular-nums ${r.shortfall > 0 ? "text-red-400" : "text-jade"}`}>
                      {fmt(r.shortfall, 0)}
                    </td>
                    <td className="td text-right tabular-nums">{r.netPerHr > 0 ? `+${fmt(r.netPerHr, 2)}` : "—"}</td>
                    <td className="td text-right tabular-nums">
                      {r.shortfall <= 0 ? (
                        <span className="text-jade">ready</span>
                      ) : r.hoursToFill === Infinity ? (
                        <span className="text-amber-400">not producing</span>
                      ) : (
                        `${fmt(r.hoursToFill, 1)}h`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Fill time uses your current plan's net production. Set the stock you already have to shrink the shortfall.
        </p>
      </div>
    </div>
  );
}
