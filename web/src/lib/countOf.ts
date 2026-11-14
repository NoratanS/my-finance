// "1 tag", "3 groups"; a qualifier goes before the noun: "3 untagged transactions". Nouns here all add an s.
export const countOf = (count: number, noun: string, qualifier?: string) =>
  [String(count), qualifier, count === 1 ? noun : `${noun}s`]
    .filter(Boolean)
    .join(' ')
