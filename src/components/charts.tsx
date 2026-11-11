"use client";
import { formatMoney } from "@/lib/money";

type Point = { label: string; a: number; b: number };

/** Grafik batang ganda (pemasukan vs pengeluaran) dengan ringkasan aksesibel & tabel alternatif. */
export function DualBarChart({ data, aLabel, bLabel, currency, summary }: { data: Point[]; aLabel: string; bLabel: string; currency: string; summary: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const W = 640, H = 220, pad = 28;
  const bw = Math.max(3, Math.min(18, (W - pad * 2) / data.length / 2.6));
  const step = (W - pad * 2) / data.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
        {[0, 0.5, 1].map((t) => <line key={t} x1={pad} x2={W - pad} y1={H - pad - t * (H - pad * 2)} y2={H - pad - t * (H - pad * 2)} stroke="#E6EFED" />)}
        {data.map((d, i) => {
          const x = pad + i * step + step / 2;
          const ha = (d.a / max) * (H - pad * 2), hb = (d.b / max) * (H - pad * 2);
          return (
            <g key={d.label}>
              <title>{`${d.label}: ${aLabel} ${formatMoney(d.a, currency)}, ${bLabel} ${formatMoney(d.b, currency)}`}</title>
              <rect x={x - bw - 1} y={H - pad - ha} width={bw} height={ha} rx={2} fill="#2BA8A2" />
              <rect x={x + 1} y={H - pad - hb} width={bw} height={hb} rx={2} fill="#EF6C4A" />
              {(data.length <= 12 || i % Math.ceil(data.length / 8) === 0) && <text x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="#687A78">{d.label.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-primary" />{aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-coral" />{bLabel}</span>
        <span>Sumber: jurnal akuntansi (posted)</span>
      </figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-primary-deep">Lihat sebagai tabel</summary>
        <div className="table-wrap mt-2 max-h-64 overflow-y-auto">
          <table><thead><tr><th>Tanggal</th><th className="r">{aLabel}</th><th className="r">{bLabel}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="r">{formatMoney(d.a, currency)}</td><td className="r">{formatMoney(d.b, currency)}</td></tr>)}</tbody></table>
        </div>
      </details>
    </figure>
  );
}
