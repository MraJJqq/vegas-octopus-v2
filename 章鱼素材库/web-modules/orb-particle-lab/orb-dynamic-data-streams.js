/* Vegas 章鱼｜动态单根数据流
 * 视觉源：orb-seven-data-streams.js
 * 从原始七色数据流素材提取单根曲线与发光粒子表现，
 * 动态连接当前波动幅度最大的可见品种卡片与中央发光球。
 */
(function () {
  'use strict';

  const HUE = 190;
  const PARTICLE_COUNT = 220;

  function start() {
    const stage = document.querySelector('.center-stage');
    const grid = document.getElementById('octopusMarketCardGrid');
    const orb = stage && (stage.querySelector('.core-orb') || stage.querySelector('#orb-core-canvas'));
    if (!stage || !grid || !orb || document.getElementById('octopusDynamicDataStreams')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'octopusDynamicDataStreams';
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '3'
    });
    stage.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width = 1;
    let height = 1;
    let dpr = 1;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      offset: Math.random(),
      speed: 0.18 + Math.random() * 0.25,
      size: 1.1 + Math.random() * 0.5
    }));

    function resize() {
      const rect = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function volatility(card) {
      const value = card.querySelector('.pct');
      if (!value) return -1;
      const number = parseFloat(value.textContent.replace(/[^0-9.+-]/g, ''));
      return Number.isFinite(number) ? Math.abs(number) : -1;
    }

    function frame(ms) {
      const time = ms / 1000;
      ctx.clearRect(0, 0, width, height);

      const stageRect = stage.getBoundingClientRect();
      const orbRect = orb.getBoundingClientRect();
      const ox = orbRect.left - stageRect.left + orbRect.width / 2;
      const oy = orbRect.top - stageRect.top + orbRect.height / 2;

      const card = [...grid.querySelectorAll('.pos')]
        .filter(item => {
          const rect = item.getBoundingClientRect();
          return volatility(item) >= 0 &&
            rect.width > 0 && rect.height > 0 &&
            rect.right > stageRect.left && rect.left < stageRect.right &&
            rect.bottom > stageRect.top && rect.top < stageRect.bottom;
        })
        .sort((a, b) => volatility(b) - volatility(a))[0];

      if (card) {
        const rect = card.getBoundingClientRect();
        const ax = rect.left - stageRect.left + rect.width / 2;
        const ay = rect.top - stageRect.top + rect.height / 2;
        const dx = ox - ax;
        const dy = oy - ay;
        const bend = 0.025;
        const cx = (ax + ox) / 2 - dy * bend;
        const cy = (ay + oy) / 2 + dx * bend;
        const fade = Math.max(0.2, Math.min(1, volatility(card) / 5));
        const color = 'hsl(' + HUE + ',100%,62%)';

        // 原始素材的细弯曲光纤轨迹。
        ctx.save();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.26 * fade;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, ox, oy);
        ctx.stroke();

        // 沿同一根数据流运行的发光离子。
        particles.forEach(particle => {
          const u = (time * particle.speed + particle.offset) % 1;
          const v = 1 - u;
          const px = v * v * ax + 2 * v * u * cx + u * u * ox;
          const py = v * v * ay + 2 * v * u * cy + u * u * oy;

          ctx.globalAlpha = 0.95 * fade;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(px, py, particle.size, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      requestAnimationFrame(frame);
    }

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize, { passive: true });
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
