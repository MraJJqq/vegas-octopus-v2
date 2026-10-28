/* Vegas 章鱼｜第四层：纯数据流渲染模块
 * 只负责绘制连接线与发光粒子，不计算行情波动，也不判断正式信号。
 * 接入方式：
 * 1. 将正式信号对应的卡片传给 VegasSignalDataStreams.setTargets(elements)；或
 * 2. 给正式信号卡片添加 data-formal-signal="true" 属性。
 */
(function () {
  'use strict';

  const STREAM_HUES = [0, 28, 52, 150, 190, 245, 320];
  const IONS_PER_CONNECTION = 1500;
  const AUTO_TARGET_SELECTOR = '.mc-card[data-formal-signal="true"], .pos[data-formal-signal="true"]';

  function start() {
    const stage = document.querySelector('.center-stage');
    const grid = document.getElementById('octopusMarketCardGrid') || document.getElementById('mc-left') || document.getElementById('market-cards-layer');
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
      zIndex: '2'
    });
    (document.querySelector('.app') || stage).appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width = 1, height = 1, dpr = 1;
    let explicitTargets = null;
    const particles = Array.from({ length: IONS_PER_CONNECTION }, (_, i) => ({
      strand: i % STREAM_HUES.length,
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

    function getTargets() {
      const source = explicitTargets === null
        ? [...grid.querySelectorAll(AUTO_TARGET_SELECTOR)]
        : explicitTargets;
      const stageRect = stage.getBoundingClientRect();
      return [...new Set(source)].filter(card => {
        if (!card || !card.isConnected) return false;
        const rect = card.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          rect.right > stageRect.left && rect.left < stageRect.right &&
          rect.bottom > stageRect.top && rect.top < stageRect.bottom;
      });
    }

    function drawStream(card, ox, oy, stageRect, time) {
      const rect = card.getBoundingClientRect();
      const ax = rect.right - stageRect.left;
      const ay = rect.top - stageRect.top + rect.height / 2;
      const dx = ox - ax, dy = oy - ay;
      const baseCx = (ax + ox) / 2 - dy * 0.025;
      const baseCy = (ay + oy) / 2 + dx * 0.025;

      // 每条连接由七根独立彩色纤维组成，沿用素材库的七色数据流风格。
      STREAM_HUES.forEach((hue, strand) => {
        const color = 'hsl(' + hue + ',100%,62%)';
        const spread = strand - (STREAM_HUES.length - 1) / 2;
        const sx = ax;
        const sy = ay + spread * 2.2;
        const ex = ox;
        const ey = oy + spread * 1.2;
        const cx = baseCx - spread * 2.0;
        const cy = baseCy + spread * 2.4;

        ctx.save();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.26;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.stroke();

        particles.forEach(particle => {
          if (particle.strand !== strand) return;
          const u = (time * particle.speed + particle.offset) % 1;
          const v = 1 - u;
          const px = v * v * sx + 2 * v * u * cx + u * u * ex;
          const py = v * v * sy + 2 * v * u * cy + u * u * ey;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(px, py, particle.size, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      });
    }

    function frame(ms) {
      const time = ms / 1000;
      ctx.clearRect(0, 0, width, height);
      const stageRect = stage.getBoundingClientRect();
      const orbRect = orb.getBoundingClientRect();
      const isFullStageCanvas = orb && orb.id === 'orb-core-canvas';
      const ox = isFullStageCanvas ? stageRect.width * 0.66 : orbRect.left - stageRect.left + orbRect.width / 2;
      const oy = isFullStageCanvas ? stageRect.height * 0.5 : orbRect.top - stageRect.top + orbRect.height / 2;

      getTargets().forEach(card => drawStream(card, ox, oy, stageRect, time));
      requestAnimationFrame(frame);
    }

    window.VegasSignalDataStreams = Object.freeze({
      setTargets(elements) {
        explicitTargets = Array.from(elements || []);
      },
      useMarkedCards() {
        explicitTargets = null;
      },
      refresh: resize
    });

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
