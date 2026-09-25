// The hero breathes: pointer parallax plus a slow float, one rAF loop, paused when hidden.
export function liveHero(hero, drift) {
  const fine = matchMedia('(pointer: fine)').matches
  let tx = 0, ty = 0, x = 0, y = 0
  let running = false

  if (fine) {
    addEventListener('pointermove', (e) => {
      tx = (e.clientX / innerWidth - 0.5) * -18
      ty = (e.clientY / innerHeight - 0.5) * -14
    }, { passive: true })
    document.addEventListener('pointerleave', () => (tx = ty = 0))
  }

  const loop = (now) => {
    if (!running) return
    x += (tx - x) * 0.06
    y += (ty - y) * 0.06
    const float = Math.sin(now / 1900) * 5
    drift.style.transform = `translate3d(${x.toFixed(2)}px, ${(y + float).toFixed(2)}px, 0)`
    requestAnimationFrame(loop)
  }
  const start = () => { if (!running) { running = true; requestAnimationFrame(loop) } }
  const stop = () => (running = false)

  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(hero)
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()))
}

// Film grain, drawn once, moved by the compositor.
export function grain(layer) {
  const size = 180
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 11
  }
  ctx.putImageData(img, 0, 0)
  layer.style.backgroundImage = `url(${c.toDataURL('image/png')})`
}
