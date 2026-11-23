import React, { useState } from 'react';
import { formatCurrency } from '../../lib/formatters';

export interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
}

export const BarComparisonChart: React.FC<{ data: MonthlyPoint[]; height?: number }> = ({
  data,
  height = 210,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(100, ...data.flatMap((d) => [d.income, d.expense]));
  const width = 620;
  const padLeft = 56;
  const padBottom = 28;
  const padTop = 14;
  const chartW = width - padLeft - 16;
  const chartH = height - padBottom - padTop;
  const groupW = chartW / Math.max(1, data.length);
  const barW = Math.min(18, Math.max(6, groupW * 0.28));

  return (
    <div className="w-full relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padTop + chartH * (1 - ratio);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                x2={width - 12}
                y1={y}
                y2={y}
                stroke="#ECEEEB"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[#252B28]/55 text-[10px] font-mono-tabular"
              >
                {Math.round((maxVal * ratio) / 1000) >= 1
                  ? `${(maxVal * ratio / 1000).toFixed(1)}k`
                  : Math.round(maxVal * ratio)}
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          const cx = padLeft + idx * groupW + groupW / 2;
          const incH = (d.income / maxVal) * chartH;
          const expH = (d.expense / maxVal) * chartH;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <rect
                x={cx - barW - 2}
                y={padTop + chartH - incH}
                width={barW}
                height={Math.max(1, incH)}
                rx="2"
                fill="#203C35"
              />
              <rect
                x={cx + 2}
                y={padTop + chartH - expH}
                width={barW}
                height={Math.max(1, expH)}
                rx="2"
                fill="#C6A879"
              />
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                className="fill-[#252B28]/65 text-[10px]"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between text-xs text-[#252B28]/70 mt-2">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#203C35] inline-block rounded-xs" />
            Ingresos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#C6A879] inline-block rounded-xs" />
            Gastos
          </span>
        </div>
        {hovered !== null && data[hovered] && (
          <div className="font-mono-tabular text-xs text-[#203C35]">
            {data[hovered].label}: {formatCurrency(data[hovered].income)} / {formatCurrency(data[hovered].expense)}
          </div>
        )}
      </div>
    </div>
  );
};

export const AreaEvolutionChart: React.FC<{
  points: { label: string; value: number }[];
  height?: number;
}> = ({ points, height = 190 }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 620;
  const padLeft = 56;
  const padBottom = 26;
  const padTop = 14;
  const chartW = width - padLeft - 16;
  const chartH = height - padBottom - padTop;
  const maxVal = Math.max(100, ...points.map((p) => p.value));

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? padLeft + chartW / 2
        : padLeft + (i / (points.length - 1)) * chartW;
    const y = padTop + chartH - (p.value / maxVal) * chartH;
    return { x, y, ...p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${padTop + chartH} L ${coords[0].x} ${padTop + chartH} Z`
      : '';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {[0, 0.5, 1].map((ratio, idx) => {
          const y = padTop + chartH * (1 - ratio);
          return (
            <g key={idx}>
              <line x1={padLeft} x2={width - 12} y1={y} y2={y} stroke="#ECEEEB" strokeWidth="1" />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[#252B28]/55 text-[10px] font-mono-tabular"
              >
                {Math.round(maxVal * ratio)}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="#315348" fillOpacity="0.12" />}
        {linePath && (
          <path d={linePath} fill="none" stroke="#203C35" strokeWidth="2.2" strokeLinejoin="round" />
        )}

        {coords.map((c, idx) => (
          <g
            key={c.label}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer"
          >
            <circle cx={c.x} cy={c.y} r={hovered === idx ? 5 : 3.5} fill="#203C35" stroke="#F8F8F5" strokeWidth="1.5" />
            <text x={c.x} y={height - 6} textAnchor="middle" className="fill-[#252B28]/65 text-[10px]">
              {c.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="h-5 flex items-center justify-end text-xs font-mono-tabular text-[#203C35]">
        {hovered !== null && coords[hovered]
          ? `${coords[hovered].label}: ${formatCurrency(coords[hovered].value)}`
          : 'Pasa el cursor sobre un mes para ver el importe'}
      </div>
    </div>
  );
};

export const HorizontalBarList: React.FC<{
  items: { label: string; value: number; subLabel?: string }[];
  formatValue?: (val: number) => string;
  emptyText?: string;
}> = ({ items, formatValue = formatCurrency, emptyText = 'Sin datos suficientes en el periodo.' }) => {
  if (items.length === 0) {
    return <p className="text-xs text-[#252B28]/60 py-6 text-center">{emptyText}</p>;
  }
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.min(100, Math.max(3, (item.value / maxVal) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-[#252B28] truncate">
                {item.label}
                {item.subLabel ? (
                  <span className="text-[#252B28]/55 font-normal"> · {item.subLabel}</span>
                ) : null}
              </span>
              <span className="font-mono-tabular text-[#203C35] font-medium shrink-0">
                {formatValue(item.value)}
              </span>
            </div>
            <div className="h-2 w-full bg-[#ECEEEB] rounded-xs overflow-hidden">
              <div className="h-full bg-[#315348] transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const PALETTE = ['#203C35', '#C6A879', '#315348', '#6B7C74', '#94A39B', '#D8C39E'];

export const DonutBreakdownChart: React.FC<{
  items: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  emptyText?: string;
}> = ({ items, formatValue = formatCurrency, emptyText = 'Sin datos registrados.' }) => {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  if (items.length === 0 || total === 0) {
    return <p className="text-xs text-[#252B28]/60 py-6 text-center">{emptyText}</p>;
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
        {items.slice(0, 6).map((item, idx) => {
          const slicePct = item.value / total;
          const dashLen = slicePct * circumference;
          const offset = -cumulative * circumference;
          cumulative += slicePct;
          return (
            <circle
              key={item.label}
              cx="70"
              cy="70"
              r={radius}
              fill="transparent"
              stroke={PALETTE[idx % PALETTE.length]}
              strokeWidth="20"
              strokeDasharray={`${dashLen} ${circumference}`}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
            />
          );
        })}
        <text
          x="70"
          y="67"
          textAnchor="middle"
          className="fill-[#252B28]/60 text-[10px]"
        >
          Total
        </text>
        <text
          x="70"
          y="82"
          textAnchor="middle"
          className="fill-[#203C35] text-[11px] font-semibold font-mono-tabular"
        >
          {formatValue(total)}
        </text>
      </svg>

      <div className="flex-1 w-full space-y-2">
        {items.slice(0, 6).map((item, idx) => (
          <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 truncate text-[#252B28]">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
              />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-mono-tabular text-[#252B28]/80 shrink-0">
              {formatValue(item.value)} ({((item.value / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
