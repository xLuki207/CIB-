const easeOut = (t) => 1 - Math.pow(1 - t, 4)

// Animates a number in place. Small prices tween in log space so every digit moves evenly.
export function tweenNumber(el, format, { html = false, log = false } = {}) {
  let current = null
  let frame = 0
  const write = (v) => (html ? (el.innerHTML = format(v)) : (el.textContent = format(v)))

  return function set(target, { duration = 900, from, instant = false } = {}) {
    if (target == null || !Number.isFinite(target)) return
    const start = from ?? current
    cancelAnimationFrame(frame)
    if (instant || start == null || start === target) {
      current = target
      write(target)
      return
    }
    const a = log ? Math.log(Math.max(start, target * 1e-3)) : start
    const b = log ? Math.log(target) : target
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration)
      const x = a + (b - a) * easeOut(t)
      current = log ? Math.exp(x) : x
      write(t === 1 ? target : current)
      if (t < 1) frame = requestAnimationFrame(step)
      else current = target
    }
    frame = requestAnimationFrame(step)
  }
}
