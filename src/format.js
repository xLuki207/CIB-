const group = (n, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

// Exact dollars below a million ($21,651), two decimals above ($1.24M).
export function money(n) {
  if (n == null || !Number.isFinite(n)) return null
  if (n >= 1e9) return `$${group(n / 1e9, 2)}B`
  if (n >= 1e6) return `$${group(n / 1e6, 2)}M`
  return `$${group(Math.round(n))}`
}

// Four significant digits. Leading zeros collapse into a subscript: $0.0{4}2165.
// Returns tokens for the ticker: plain characters, and { sub } for the zero count.
export function price(n) {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  if (n >= 1) return [...`$${group(n, 2)}`]
  if (n >= 0.001) return [...`$${group(n, 5)}`]
  const [, zeros, digits] = n.toFixed(20).match(/^0\.(0*)(\d{4})/)
  return ['$', '0', '.', '0', { sub: String(zeros.length) }, ...digits]
}
