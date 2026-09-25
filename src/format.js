const whole = (n, digits = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

// Monumental numbers stay short: $184,203 below a million, $1.84M above.
export function money(n) {
  if (n == null || !Number.isFinite(n)) return ' '
  if (n >= 1e9) return `$${whole(n / 1e9, 2)}B`
  if (n >= 1e6) return `$${whole(n / 1e6, 2)}M`
  return `$${whole(n)}`
}

// $0.00001196 → $0.0₄1196, the way traders read small prices. Returns HTML.
export function price(n) {
  if (n == null || !Number.isFinite(n) || n <= 0) return ' '
  if (n >= 1) return `$${whole(n, 2)}`
  if (n >= 0.001) return `$${whole(n, 5)}`
  const [, zeros, digits] = n.toFixed(20).match(/^0\.(0*)(\d{4})/)
  return `$0.0<sub>${zeros.length}</sub>${digits}`
}
