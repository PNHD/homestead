import React from "react";

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "gold" | "jade" | "red" | "default";
}) {
  const color =
    accent === "gold"
      ? "text-gold"
      : accent === "jade"
      ? "text-jade"
      : accent === "red"
      ? "text-red-400"
      : "text-gray-100";
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      className={`input ${className}`}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(Number.isNaN(n) ? 0 : n);
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = "",
  placeholder,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <select
      className={`input ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Money({ n, className = "" }: { n: number; className?: string }) {
  const neg = n < 0;
  return (
    <span className={`tabular-nums ${neg ? "text-red-400" : ""} ${className}`}>
      {neg ? "−" : ""}
      {Math.round(Math.abs(n)).toLocaleString()}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    surplus: "bg-jade/15 text-jade",
    ok: "bg-sky-500/15 text-sky-300",
    draining: "bg-amber-500/15 text-amber-300",
    stockout: "bg-red-500/20 text-red-300",
    idle: "bg-gray-500/15 text-gray-400",
  };
  const label: Record<string, string> = {
    surplus: "Surplus",
    ok: "Balanced",
    draining: "Draining",
    stockout: "Stockout risk",
    idle: "Idle",
  };
  return <span className={`chip ${map[status] ?? "bg-gray-500/15 text-gray-400"}`}>{label[status] ?? status}</span>;
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold text-gray-100">{children}</h2>
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </div>
  );
}
