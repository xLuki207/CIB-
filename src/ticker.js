// A mechanical ticker. Every digit is a reel; only the reels that change turn,
// right to left, like a split flap board without the flap.

const DIGITS = '0123456789'
const shape = (tokens) => tokens.map((t) => (typeof t === 'object' ? `_${t.sub}` : DIGITS.includes(t) ? 'd' : t)).join('')

function reel() {
  const slot = document.createElement('span')
  slot.className = 'reel'
  slot.setAttribute('aria-hidden', 'true')
  const strip = document.createElement('span')
  strip.className = 'strip'
  strip.innerHTML = [...DIGITS].map((d) => `<span>${d}</span>`).join('')
  slot.append(strip)
  return slot
}

export function ticker(el, { calm = false } = {}) {
  let skeleton = ''
  let reels = []

  const turn = (tokens, first) => {
    const digits = tokens.filter((t) => typeof t === 'string' && DIGITS.includes(t))
    reels.forEach((r, i) => {
      const d = Number(digits[i])
      if (r.value === d) return
      const fromRight = reels.length - 1 - i
      r.strip.style.transitionDelay = calm ? '0ms' : `${(first ? i : fromRight) * (first ? 45 : 30)}ms`
      r.strip.style.transform = `translate3d(0, ${-d}em, 0)`
      r.value = d
    })
  }

  return function set(tokens) {
    if (!tokens) return
    tokens = typeof tokens === 'string' ? [...tokens] : tokens
    const next = shape(tokens)
    const first = skeleton === ''
    el.setAttribute('aria-label', tokens.map((t) => (typeof t === 'object' ? '0'.repeat(Number(t.sub) - 1) : t)).join(''))

    if (next !== skeleton) {
      skeleton = next
      el.textContent = ''
      reels = []
      for (const t of tokens) {
        if (typeof t === 'object') {
          const s = document.createElement('sub')
          s.textContent = t.sub
          el.append(s)
        } else if (DIGITS.includes(t)) {
          const r = reel()
          el.append(r)
          reels.push({ strip: r.firstChild, value: 0 })
        } else {
          const s = document.createElement('span')
          s.className = 'glyph'
          s.textContent = t
          el.append(s)
        }
      }
      // Reels are built at zero; the next frame turns them into place.
      el.getBoundingClientRect()
      requestAnimationFrame(() => turn(tokens, first))
      return
    }
    turn(tokens, false)
  }
}
