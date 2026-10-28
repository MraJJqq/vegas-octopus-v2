/* Vegas 章鱼｜第四层：严格移植 orb-particle-lab v3 的数据流段
 * 数据流绘制公式、150 个流、七色分组、曲线起点/控制点、透明度、
 * 速度、粒子半径和辉光参数均按素材库原代码保留。
 * 球体投影直接复用主页面第二层的 P / pj / V / rot / pitB 参数，
 * 只绘制正式信号卡片对应的流；不改变信号判断和行情逻辑。
 */
(function () {
  'use strict';

  const SH = [0, 28, 52, 150, 190, 245, 320];
  const F = [];
  for (let i = 0; i < 150; i++) {
    F.push({ s: i % 7, t: Math.floor(Math.random() * 900), o: Math.random(), v: 0.18 + Math.random() * 0.25 });
  }

  function start() {
    const app = document.querySelector('.app');
    const orbCanvas = document.getElementById('orb-core-canvas');
    if (!app || !orbCanvas || document.getElementById('octopusDynamicDataStreams')) return;

    const cv = document.createElement('canvas');
    cv.id = 'octopusDynamicDataStreams';
    Object.assign(cv.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2'
    });
    const cardLayer = document.getElementById('market-cards-layer');
    if (cardLayer && cardLayer.parentElement === app) app.insertBefore(cv, cardLayer);
    else app.appendChild(cv);

    const x = cv.getContext('2d');
    let W = 1, H = 1, dpr = 1, raf = 0;

    function rs() {
      const r = app.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = r.width;
      H = r.height;
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // 与素材库原版 bz(a,b,c,s) 完全一致。
    function bz(a, b, c, s) {
      const q = 1 - s;
      return [
        q * q * a[0] + 2 * q * s * b[0] + s * s * c[0],
        q * q * a[1] + 2 * q * s * b[1] + s * s * c[1]
      ];
    }

    function getProjectedOrb(t) {
      // 复用主页面第二层相同的球体投影公式和实时旋转参数。
      if (!Array.isArray(window.P) || typeof window.pj !== 'function' ||
          !window.V || typeof window.rot !== 'number' || typeof window.pitB !== 'number') return null;
      const P = window.P, V = window.V;
      const cx = W * 0.66, cy = H * 0.5;
      const roomX = Math.min(cx - 8, W - cx - 8);
      const roomY = Math.max(1, H * 0.46);
      const Rr = Math.max(1, Math.min(roomX, roomY) * V.zm);
      const pit = window.pitB + 0.1 * Math.sin(t * 0.17);
      const cp = Math.cos(pit), spp = Math.sin(pit);
      return P.map(function (p) {
        const yw = window.rot * (0.8 + 0.4 * p.k);
        const q = window.pj([p.x, p.y, p.z], Math.cos(yw), Math.sin(yw), cp, spp, cx, cy, Rr);
        const u = (q[0] - (cx - Rr)) / (2 * Rr);
        q.push(Math.max(0, Math.min(1, (0.6 - u) / 0.22)), (q[2] + 1) / 2);
        return q;
      });
    }

    function frame(ms) {
      const t = ms / 1000;
      x.clearRect(0, 0, W, H);
      const pr = getProjectedOrb(t);
      const formalCards = document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]');

      if (pr && formalCards.length) {
        // 严格保留素材库原版随机球面落点 f.t；不把 150 条流强行压到少数信号卡片附近。
        // 正式信号只负责启用/关闭数据流层，不改写原版粒子的目标点和运动轨迹。
        x.globalCompositeOperation = 'lighter';
        x.lineWidth = 0.8;
        F.forEach(function (f) {
          const q = pr[f.t], fa = q[3];
          if (fa < 0.05) return;
          const y0 = H * (0.12 + f.s * 0.12);
          const col = 'hsl(' + SH[f.s] + ',100%,62%)';
          const c1x = (W * 0.66) * 0.5;

          x.strokeStyle = col;
          x.globalAlpha = 0.26 * fa;
          x.beginPath();
          x.moveTo(0, y0);
          x.quadraticCurveTo(c1x, y0, q[0], q[1]);
          x.stroke();

          const u = (t * f.v + f.o) % 1, v = 1 - u;
          const px = 2 * v * u * c1x + u * u * q[0];
          const py = v * v * y0 + 2 * v * u * y0 + u * u * q[1];
          x.globalAlpha = 0.95 * fa;
          x.fillStyle = col;
          x.shadowColor = col;
          x.shadowBlur = 8;
          x.beginPath();
          x.arc(px, py, 1.6, 0, Math.PI * 2);
          x.fill();
          x.shadowBlur = 0;
        });
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }

    window.VegasSignalDataStreams = Object.freeze({ refresh: rs });
    rs();
    if (window.ResizeObserver) new ResizeObserver(rs).observe(app);
    window.addEventListener('resize', rs, { passive: true });
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
      else if (!document.hidden && !raf) raf = requestAnimationFrame(frame);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
