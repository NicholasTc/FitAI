interface MetricCardProps {
  title: string;
  value?: string;
  subtitle?: string;
  status: "ok" | "error";
  error?: string;
  details?: Record<string, string | number | undefined>;
  raw?: unknown;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  status,
  error,
  details,
  raw,
}: MetricCardProps) {
  return (
    <article className="rounded-[17px] border border-[rgba(148,162,218,0.16)] bg-white p-5 shadow-[0_2px_14px_rgba(80,100,180,0.07)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1b2040]">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-[#9ea8c4]">{subtitle}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            status === "ok"
              ? "bg-[#ecfaf6] text-[#009e83]"
              : "bg-[#fff3f0] text-[#d9622c]"
          }`}
        >
          {status === "ok" ? "Connected" : "Unavailable"}
        </span>
      </div>

      {status === "ok" && value ? (
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[#1b2040]">
          {value}
        </p>
      ) : null}

      {status === "error" ? (
        <p className="text-sm text-[#63708f]">
          {error ?? "No data returned for this metric."}
        </p>
      ) : null}

      {details && status === "ok" ? (
        <dl className="mt-4 grid gap-2">
          {Object.entries(details).map(([key, detailValue]) =>
            detailValue !== undefined ? (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl bg-[#f4f5fb] px-3 py-2 text-sm"
              >
                <dt className="text-[#63708f]">{key}</dt>
                <dd className="font-medium text-[#1b2040]">{detailValue}</dd>
              </div>
            ) : null,
          )}
        </dl>
      ) : null}

      {raw ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-[#4a7df6]">
            View raw JSON
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-[#f4f5fb] p-3 text-[11px] leading-relaxed text-[#63708f]">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}
