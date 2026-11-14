import type { components } from '@/api/schema'

export type TagColour = components['schemas']['TagColour']

// The API stores the palette name; the hex is the web's, from the boards.
export const tagColours: Record<TagColour, { label: string; hex: string }> = {
  lavender: { label: 'Lavender', hex: '#c3b3ee' },
  mint: { label: 'Mint', hex: '#a4d9c6' },
  sky: { label: 'Sky', hex: '#a8cdec' },
  peach: { label: 'Peach', hex: '#f2c4a0' },
  rose: { label: 'Rose', hex: '#eeaabc' },
  butter: { label: 'Butter', hex: '#ecdca0' },
  lilac: { label: 'Lilac', hex: '#d6b0e4' },
  seafoam: { label: 'Seafoam', hex: '#b7dccb' },
}
