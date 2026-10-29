/* 第四层：数据流（单组）。保留原版流光线效果，并同步第二层真实发光球的投影点。 */
(function () {
  'use strict';
  if (window.__VEGAS_DATA_STREAM_LAYER_READY__) return;

  const $ = id => document.getElementById(id);
  const R = Math.random, PI = Math.PI;
  const COL = '#3fc8ff';
  let Y0 = null;
  const ORB = {};
  const P = [], F = [];
  let canvas, ctx, width = 1, height = 1, dpr = 1;
  let rotA = 0, lastT = 0, frameId = 0, resizeObserver = null;

  /* 以透明独立画布叠加，不创建背景层，也不接管鼠标/触摸事件。 */
  const layer = document.createElement('div');
  layer.id = 'vegas-data-stream-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;z-index:2.5;pointer-events:none;overflow:hidden;background:transparent;';
  const app = document.querySelector('.app') || document.body;
  if (getComputedStyle(app).position === 'static') app.style.position = 'relative';
  canvas = document.createElement('canvas');
  canvas.id = 'vegas-data-stream-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;background:transparent;';
  layer.appendChild(canvas);
  app.appendChild(layer);
  ctx = canvas.getContext('2d');

  for (let n = 0; n < 560; n++) {
    const u = R() * 2 - 1, a = R() * 2 * PI, s = Math.sqrt(1 - u * u);
    P.push({ x: s * Math.cos(a), y: u, z: s * Math.sin(a), k: R() });
  }
  for (let n = 0; n < 150; n++) {
    if (n % 7 === 0) F.push({ s: n % 7, t: Math.floor(R() * 560), o: R(), v: .18 + R() * .25 });
  }

  function resize() {
    const r = layer.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = Math.max(1, r.width);
    height = Math.max(1, r.height);
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pj(v, cs, sn, cp, sp, cx, cy, rr) {
    const x1 = v[0] * cs + v[2] * sn;
    const z1 = -v[0] * sn + v[2] * cs;
    const y2 = v[1] * cp - z1 * sp;
    const z2 = v[1] * sp + z1 * cp;
    const f = 1 + z2 * .12;
    return [cx + x1 * rr * f, cy + y2 * rr * f, z2];
  }

  function getOrbPoints(t) {
    const orbCanvas = $('orb-core-canvas');
    const projected = window.VegasOrbProjectedPoints;
    if (orbCanvas && Array.isArray(projected) && projected.length) {
      const r = orbCanvas.getBoundingClientRect();
      const sx = r.width / Math.max(1, orbCanvas.clientWidth);
      const sy = r.height / Math.max(1, orbCanvas.clientHeight);
      return projected.map(q => [
        r.left + q[0] * sx,
        r.top + q[1] * sy,
        q[2],
        q[3],
        q[4]
      ]);
    }

    /* 发光球投影尚未就绪时，沿用模块原版的虚拟球面位置作为回退。 */
    const cx = ORB.cx ?? width * .56;
    const cy = ORB.cy ?? height * .5;
    const rr = ORB.R ?? Math.min(width * .36, height * .4);
    const pit = .32 + .1 * Math.sin(t * .17);
    const cp = Math.cos(pit), sp = Math.sin(pit);
    const cs = Math.cos(rotA), sn = Math.sin(rotA);
    return P.map(p => {
      const yw = rotA * (.8 + .4 * p.k);
      const q = pj([p.x, p.y, p.z], Math.cos(yw), Math.sin(yw), cp, sp, cx, cy, rr);
      const u = (q[0] - (cx - rr)) / (2 * rr);
      q.push(Math.max(0, Math.min(1, (.6 - u) / .22)), (q[2] + 1) / 2);
      return q;
    });
  }

  function flowDraw(t) {
    const dt = Math.max(0, Math.min(.05, t - lastT));
    lastT = t;
    rotA += dt * .2;
    ctx.clearRect(0, 0, width, height);

    const pr = getOrbPoints(t);
    const y0 = Y0 ?? 88 * height / 580;
    const fallbackCx = ORB.cx ?? width * .56;
    const cx = fallbackCx;
    const startControlX = cx * .5;

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = .8;
    F.forEach(f => {
      const q = pr[f.t];
      if (!q) return;
      const fa = q[3] == null ? 1 : q[3];
      if (fa < .05) return;
      const col = COL;
      ctx.strokeStyle = col;
      ctx.globalAlpha = .26 * fa;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(startControlX, y0, q[0], q[1]);
      ctx.stroke();

      const u = (t * f.v + f.o) % 1, v = 1 - u;
      const px = 2 * v * u * startControlX + u * u * q[0];
      const py = v * v * y0 + 2 * v * u * y0 + u * u * q[1];
      ctx.globalAlpha = .95 * fa;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(ms) {
    frameId = 0;
    if (document.hidden) return;
    flowDraw(ms / 1000);
    frameId = requestAnimationFrame(frame);
  }
  function start() {
    if (!frameId && !document.hidden) {
      lastT = 0;
      frameId = requestAnimationFrame(frame);
    }
  }
  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(app);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  window.__VEGAS_DATA_STREAM_LAYER_READY__ = true;
  window.VegasDataStreamLayer = {
    resize,
    getState: () => ({ layer: 4, ready: true, connectedToOrb: !!(window.VegasOrbProjectedPoints && window.VegasOrbProjectedPoints.length), canvasWidth: width, canvasHeight: height })
  };
  start();
  console.info('[Vegas Fourth Layer] data stream initialized');
})();
