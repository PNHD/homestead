import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Type-to-filter combobox. Dropdown renders in a portal so it is never clipped by a scroll frame. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Type to search…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 2, left: r.left, width: r.width });
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 60);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 60);
  }, [query, options]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        className="input"
        value={open ? query : current?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHi(0);
          place();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(filtered.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = filtered[hi];
            if (pick) {
              onChange(pick.value);
              setOpen(false);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && pos &&
        createPortal(
          <ul
            ref={listRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }}
            className="max-h-64 overflow-auto rounded-lg border border-line bg-panel2 py-1 shadow-xl"
          >
            {filtered.map((o, i) => (
              <li
                key={o.value}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  i === hi ? "bg-gold/20 text-white" : "text-gray-200 hover:bg-panel"
                }`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}

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
