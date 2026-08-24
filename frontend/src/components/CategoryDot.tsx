/** The small colored circle marking a category's effective color. */
export function CategoryDot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}
