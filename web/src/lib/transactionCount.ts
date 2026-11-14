// "1 transaction", "3 transactions"; a qualifier goes before the noun: "3 untagged transactions".
export const transactionCount = (count: number, qualifier?: string) =>
  [String(count), qualifier, count === 1 ? 'transaction' : 'transactions']
    .filter(Boolean)
    .join(' ')
