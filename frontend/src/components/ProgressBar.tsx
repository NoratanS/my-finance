/** The horizontal bar used by the breakdown, budgets snapshot and budget cards. */
export function ProgressBar({
  percent,
  color,
  large,
}: {
  /** 0–100+; the fill clamps at 100. */
  percent: number;
  color: string;
  large?: boolean;
}) {
  return (
    <div className={`bar-track${large ? ' lg' : ''}`}>
      <div
        className="bar-fill"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: color }}
      />
    </div>
  );
}
