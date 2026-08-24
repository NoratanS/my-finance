import type { CSSProperties, ReactNode } from 'react';

/**
 * The design's "blueprint" surface: a soft rounded card. The four corner
 * markers are kept from the mockup markup (styles.css hides them for this
 * theme, but the hook stays for alternate themes).
 */
export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Card({ children, style, className }: CardProps) {
  return (
    <div className={`blueprint${className ? ` ${className}` : ''}`} style={style}>
      <Corners />
      {children}
    </div>
  );
}

/** KPI tile — kicker label, big number, muted sub line. */
export function KpiTile({
  label,
  value,
  sub,
  compact,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Card style={{ padding: compact ? '14px 18px' : '16px 18px' }}>
      <div className="kicker">{label}</div>
      <div className="kpi-value" style={compact ? { fontSize: 26, marginTop: 2 } : undefined}>
        {value}
      </div>
      {sub !== undefined && (
        <div className="text-muted" style={{ fontSize: 12 }}>
          {sub}
        </div>
      )}
    </Card>
  );
}
