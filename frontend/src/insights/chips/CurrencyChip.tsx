export function CurrencyChip({
  defaultCurrency,
  value,
  onChange,
}: {
  defaultCurrency: string;
  value: string | undefined;
  onChange: (currency: string | undefined) => void;
}) {
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">currency</span>
      <select
        className="ins-chip-input"
        value={value ?? 'all'}
        onChange={(e) => onChange(e.target.value === 'all' ? undefined : e.target.value)}
        aria-label="Currency"
      >
        <option value={defaultCurrency}>{defaultCurrency}</option>
        {value !== undefined && value !== defaultCurrency && <option value={value}>{value}</option>}
        {/* Clearing the filter shows one chart per currency present, rather
            than a meaningless mixed total (ARCHITECTURE.md §3). */}
        <option value="all">every currency</option>
      </select>
    </div>
  );
}
