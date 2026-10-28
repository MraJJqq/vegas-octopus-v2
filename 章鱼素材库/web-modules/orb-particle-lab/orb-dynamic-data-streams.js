/* Vegas 章鱼｜第四层：七色曲线数据流
 * 仅绘制正式信号卡片与中央发光球之间的连线。
 * 不计算行情、不判断信号、不修改卡片或前三层逻辑。
 */
(function () {
  'use strict';

  const HUES = [0, 28, 52, 150, 190, 245, 320];
  const IONS_PER_CONNECTION = 1500;
  const TARGET_SELECTOR = '#market-cards-layer .mc-card[data-formal-signal="true"]';

  function start() {
    const app = document.querySelector('.app');
    const stage = document.querySelector('.center-stage');
    const orb = stage && stage.querySelector('#orb-core-canvas, .core-orb');
    if (!app || !stage || !orb || document.getElementById('octopusDynamicDataStreams')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'octopusDynamicDataStreams';
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2'
    });
    const cardLayer = document.getElementById('market-cards-layer');
    if (cardLayer && cardLayer.parentElement === app) app.insertBefore(canvas, cardLayer);
    else app.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let width = 1, height = 1, dpr = 1;

    // 每条正式信号连接共 1500 个流动离子，分布在七种颜色的独立曲线上。
    const particles = Array.from({ length: IONS_PER_CONNECTION }, (_, i) => ({
      strand: i % HUES.length,
      offset: Math.random(),
      speed: 0.18 + Math.random() * 0.25,
      size: 1.1 + Math.random() * 0.5
    }));

    function resize() {
      const r = app.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, r.width);
      height = Math.max(1, r.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function curvePoint(a, b, c, t) {
      const q = 1 - t;
      return [
        q * q * a[0] + 2 * q * t * b[0] + t * t * c[0],
        q * q * a[1] + 2 * q * t * b[1] + t * t * c[1]
      ];
    }

    function drawConnection(card, orbRect, canvasRect, time) {
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // 从卡片朝向发光球的一侧出发，所有坐标统一相对全屏画布。
      const cardCenterX = r.left + r.width / 2;
      const orbCenterX = orbRect.left + orbRect.width / 2;
      const startX = (orbCenterX < cardCenterX ? r.left : r.right) - canvasRect.left;
      const startY = r.top + r.height / 2 - canvasRect.top;
      const endX = orbCenterX - canvasRect.left;
      const endY = orbRect.top + orbRect.height / 2 - canvasRect.top;
      const dx = endX - startX, dy = endY - startY;
      const baseControlX = (startX + endX) / 2 - dy * 0.12;
      const baseControlY = (startY + endY) / 2 + dx * 0.12;

      HUES.forEach((hue, strand) => {
        const spread = strand - (HUES.length - 1) / 2;
        const a = [startX, startY + spread * 2.1];
        const c = [endX, endY + spread * 1.4];
        const b = [baseControlX - spread * 2.0, baseControlY + spread * 2.4];
        const color = 'hsl(' + hue + ',100%,62%)';

        ctx.save();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.26;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]);
        ctx.stroke();

        // 与素材参考一致：沿二次曲线移动的高亮离子。
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        for (const p of particles) {
          if (p.strand !== strand) continue;
          const u = (time * p.speed + p.offset) % 1;
          const [px, py] = curvePoint(a, b, c, u);
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }

    function frame(ms) {
      ctx.clearRect(0, 0, width, height);
      const canvasRect = canvas.getBoundingClientRect();
      const orbRect = orb.getBoundingClientRect();
      document.querySelectorAll(TARGET_SELECTOR).forEach(card => {
        const r = card.getBoundingClientRect();
        if (r.right <= canvasRect.left || r.left >= canvasRect.right ||
            r.bottom <= canvasRect.top || r.top >= canvasRect.bottom) return;
        drawConnection(card, orbRect, canvasRect, ms / 1000);
      });
      requestAnimationFrame(frame);
    }

    window.VegasSignalDataStreams = Object.freeze({ refresh: resize });
    resize();
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(resize);
      observer.observe(app);
    }
    window.addEventListener('resize', resize, { passive: true });
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
