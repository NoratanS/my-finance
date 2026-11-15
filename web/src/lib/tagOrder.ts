// The API sorts by code point, which puts Łódź after Zakupy; Polish order puts it after Lidl.
const polish = new Intl.Collator('pl')

// Tags as every list shows them: A–Z the Polish way.
export const aToZ = <T extends { name: string }>(tags: readonly T[]) =>
  tags.toSorted((a, b) => polish.compare(a.name, b.name))

// Used tags first, last used first, then the rest A–Z, so a new ledger still has something to offer.
export const byRecentUse = <
  T extends { name: string; last_used_at: string | null },
>(
  tags: readonly T[],
) => [
  ...tags
    .filter((tag) => tag.last_used_at !== null)
    .toSorted((a, b) =>
      (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''),
    ),
  ...aToZ(tags.filter((tag) => tag.last_used_at === null)),
]
