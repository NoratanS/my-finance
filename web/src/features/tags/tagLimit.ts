// GLOSSARY: a transaction carries 0–5 tags; the API holds the same limit, for a save and for a filter.
export const tagLimit = 5

export const tagLimitReached = `That’s the limit of ${String(tagLimit)} tags. Remove one to add another.`
