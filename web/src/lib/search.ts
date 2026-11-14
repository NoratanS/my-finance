// NFD splits accents off (ż → z + ˙), but ł is a letter of its own, so it gets its own map.
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()

// A search typed into a list's box: case and Polish letters ignored, surrounding spaces too.
export const matchesSearch = (text: string, search: string) =>
  fold(text).includes(fold(search.trim()))
