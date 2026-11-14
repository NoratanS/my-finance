// The API sorts by code point, which puts Łódź after Zakupy; Polish order puts it after Lidl.
const polish = new Intl.Collator('pl')

// Tags as every list shows them: A–Z the Polish way.
export const aToZ = <T extends { name: string }>(tags: readonly T[]) =>
  tags.toSorted((a, b) => polish.compare(a.name, b.name))
