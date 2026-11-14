import { z } from 'zod'

const nameLimit = 40

// The tag name rule, which tag groups follow too (GLOSSARY: Tag group); the API holds the same one and alone knows which names are taken.
export const tagName = (missing: string) =>
  z
    .string()
    .trim()
    .min(1, missing)
    // Zod 4 counts code points, as the API does, so an emoji is one character.
    .max(nameLimit, `Keep it to ${String(nameLimit)} characters.`)
