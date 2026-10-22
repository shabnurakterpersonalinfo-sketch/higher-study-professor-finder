/** Lightweight SVG donut — matches the "Application Overview" card. */
export function Donut({ data, total, size = 180 }: { data: { value: number; color: string; label: string }[]; total: number; size?: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const sum = data.reduce((n, d) => n + d.value, 0) || 1;
  let offset = 0;
  return (
    <svg viewBox="0 0 180 180" width={size} height={size} role="img" aria-label={`${total} applications`}>
      <circle cx="90" cy="90" r={r} fill="none" stroke="#EEF0F4" strokeWidth="22" />
      {data
        .filter((d) => d.value > 0)
        .map((d) => {
          const len = (d.value / sum) * c;
          const el = (
            <circle
              key={d.label}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="22"
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 90 90)"
            >
              <title>
                {d.label}: {d.value}
              </title>
            </circle>
          );
          offset += len;
          return el;
        })}
      <text x="90" y="88" textAnchor="middle" className="fill-ink text-[30px] font-semibold">
        {total}
      </text>
      <text x="90" y="110" textAnchor="middle" className="fill-ink-mute text-[12px]">
        Total
      </text>
    </svg>
  );
}
