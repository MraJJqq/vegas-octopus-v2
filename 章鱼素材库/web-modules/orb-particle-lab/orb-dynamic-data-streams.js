/* Vegas 章鱼｜第四层：正式信号卡片至发光球的数据流 */
(function () {
  'use strict';

  const COLORS = [0, 28, 52, 150, 190, 245, 320];
  const STREAMS_PER_CARD = 14;
  const FADE_SECONDS = 0.14;
  const particles = Array.from({ length: 300 }, (_, i) => ({
    color: i % COLORS.length,
    point: Math.floor(Math.random() * 900),
    phase: Math.random(),
    speed: 0.18 + Math.random() * 0.25
  }));

  function start() {
    const app = document.querySelector('.app');
    const orbCanvas = document.getElementById('orb-core-canvas');
    if (!app || !orbCanvas || document.getElementById('octopusDynamicDataStreams')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'octopusDynamicDataStreams';
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2'
    });
    const cardLayer = document.getElementById('market-cards-layer');
    app.insertBefore(canvas, cardLayer?.parentElement === app ? cardLayer : null);

    const ctx = canvas.getContext('2d');
    const states = new WeakMap();
    const groups = new WeakMap();
    let width = 1, height = 1, dpr = 1, raf = 0, nextGroup = 0, lastTime = 0;

    function resize() {
      const rect = app.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(ms) {
      const time = ms / 1000;
      const dt = lastTime ? Math.min(0.1, (ms - lastTime) / 1000) : 1 / 60;
      lastTime = ms;
      ctx.clearRect(0, 0, width, height);

      const points = window.VegasOrbProjectedPoints;
      if (Array.isArray(points) && points.length) {
        const appRect = app.getBoundingClientRect();
        const cards = document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]');
        const targets = [];

        cards.forEach(card => {
          const rect = card.getBoundingClientRect();
          const scroller = card.closest('.mc-side');
          const clip = scroller ? scroller.getBoundingClientRect() : appRect;
          const visibleWidth = Math.max(0, Math.min(rect.right, clip.right, appRect.right) - Math.max(rect.left, clip.left, appRect.left));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, clip.bottom, appRect.bottom) - Math.max(rect.top, clip.top, appRect.top));
          const visibleRatio = rect.width > 0 && rect.height > 0
            ? Math.min(1, visibleWidth * visibleHeight / (rect.width * rect.height)) : 0;
          const slot = card.closest('.mc-slot');
          const slotOpacity = slot ? Number.parseFloat(getComputedStyle(slot).opacity) : 1;
          let state = states.get(card);
          if (!state) {
            state = { opacity: 0 };
            states.set(card, state);
            groups.set(card, nextGroup++);
          }

          const target = visibleRatio * (Number.isFinite(slotOpacity) ? Math.max(0, Math.min(1, slotOpacity)) : 1);
          // 指数缓动不依赖帧率，滚动进入/离开时更自然。
          state.opacity += (target - state.opacity) * (1 - Math.exp(-dt / FADE_SECONDS));
          if (state.opacity > 0.003 && rect.width > 0 && rect.height > 0) {
            targets.push({ rect, opacity: state.opacity, group: groups.get(card) });
          }
        });

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.4;

        targets.forEach(({ rect, opacity, group }) => {
          const centerX = rect.left + rect.width / 2 - appRect.left;
          const centerY = rect.top + rect.height / 2 - appRect.top;
          const leftX = rect.left - appRect.left;
          const rightX = rect.right - appRect.left;
          const base = (group * STREAMS_PER_CARD) % particles.length;

          for (let j = 0; j < STREAMS_PER_CARD; j++) {
            const p = particles[(base + j) % particles.length];
            let point = points[p.point % points.length];
            if (!point || point.length < 4) continue;

            if (point[3] < 0.08) {
              let nearest = null, nearestDistance = Infinity;
              for (let k = 0; k < points.length; k++) {
                const candidate = points[k];
                if (!candidate || candidate.length < 4 || candidate[3] < 0.08) continue;
                const distance = Math.abs(candidate[0] - centerX) + Math.abs(candidate[1] - centerY);
                if (distance < nearestDistance) {
                  nearest = candidate;
                  nearestDistance = distance;
                }
              }
              if (nearest) point = nearest;
            }

            const visibility = Math.max(0.22, Math.min(1, point[3] || 0));
            const endX = point[0], endY = point[1];
            const startX = endX >= centerX ? rightX : leftX;
            const startY = centerY + (j - (STREAMS_PER_CARD - 1) / 2) * 3.5;
            const controlX = (startX + endX) / 2;
            const color = 'hsl(' + COLORS[p.color] + ',100%,66%)';

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(controlX, startY, endX, endY);
            ctx.strokeStyle = color;
            ctx.globalAlpha = Math.min(1, 0.92 * visibility * opacity);
            ctx.shadowColor = color;
            ctx.shadowBlur = 22;
            ctx.stroke();
            ctx.globalAlpha = Math.min(1, 0.95 * visibility * opacity);
            ctx.shadowBlur = 5;
            ctx.stroke();
            ctx.shadowBlur = 0;

            const phase = (time * p.speed + p.phase) % 1;
            const inverse = 1 - phase;
            const particleX = inverse * inverse * startX + 2 * inverse * phase * controlX + phase * phase * endX;
            const particleY = inverse * inverse * startY + 2 * inverse * phase * startY + phase * phase * endY;
            ctx.globalAlpha = Math.min(1, 1.35 * visibility * opacity);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(particleX, particleY, 2.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }

    window.VegasSignalDataStreams = Object.freeze({ refresh: resize });
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
    window.addEventListener('resize', resize, { passive: true });
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!document.hidden && !raf) {
        lastTime = 0;
        raf = requestAnimationFrame(frame);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
