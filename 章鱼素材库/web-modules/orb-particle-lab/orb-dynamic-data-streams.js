/* 第四层：每张正式信号卡片独立连接发光球的数据流。 */
(function () {
  'use strict';
  if (window.__VEGAS_DATA_STREAM_LAYER_READY__) return;

  const $ = id => document.getElementById(id);
  const R = Math.random, PI = Math.PI;
  const P = [], F = [];
  let formalCards = Array.from(document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]'));
  const cardStarts = [];
  const cardStartByElement = new Map();
  const SYMBOL_HUES = new Map(Array.from(document.querySelectorAll('#market-cards-layer .mc-card[data-symbol]')).map((card, index) => [String(card.dataset.symbol || '').toUpperCase(), (190 + index * 137.508) % 360]));
  let canvas, ctx, width = 1, height = 1, dpr = 1;
  let geometryAppRect = null, geometryOrbRect = null, geometryStartsDirty = true;
  let rotA = 0, lastT = 0, frameId = 0, frameTimer = 0, lastFrameAt = 0, resizeObserver = null;
  const FRAME_INTERVAL = 1000 / ((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 20 : 30);

  /* 透明叠加层：不创建背景，不接管鼠标/触摸事件。 */
  const app = document.querySelector('.app') || document.body;
  const layer = document.createElement('div');
  layer.id = 'vegas-data-stream-layer';
  layer.setAttribute('aria-hidden', 'true');
  /* 同级 z-index=2，依靠 DOM 顺序叠在第三层卡片上；第二层最新事件 z-index=3，仍位于数据流上方。 */
  layer.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;background:transparent;';
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

  /* 每张正式信号卡片拥有独立数据流组，起点绑定该卡片，终点连接发光球。 */
  const STREAM_COUNT = 36;
  function syncCardLines() {
    F.length = 0;
    for (let i = 0; i < STREAM_COUNT; i++) {
      F.push({ t: Math.floor(R() * P.length), o: R(), v: .18 + R() * .25, index: i });
    }
  }
  syncCardLines();

  function resize() {
    const r = layer.getBoundingClientRect();
    geometryAppRect = app.getBoundingClientRect();
    const orbCanvas = $('orb-core-canvas');
    geometryOrbRect = orbCanvas ? orbCanvas.getBoundingClientRect() : null;
    geometryStartsDirty = true;
    /* 与发光球保持一致：限制高像素密度设备的离屏画布成本。 */
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    dpr = Math.min(coarse ? 1.25 : 1.5, Math.max(1, window.devicePixelRatio || 1));
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

  function getOrbPoints(t, frameAppRect) {
    const orbCanvas = $('orb-core-canvas');
    const projected = window.VegasOrbProjectedPoints;
    if (orbCanvas && Array.isArray(projected) && projected.length) {
      const r = geometryOrbRect || orbCanvas.getBoundingClientRect();
      const appRect = frameAppRect || geometryAppRect || app.getBoundingClientRect();
      return {
        points: projected,
        sx: r.width / Math.max(1, orbCanvas.clientWidth),
        sy: r.height / Math.max(1, orbCanvas.clientHeight),
        ox: r.left - appRect.left,
        oy: r.top - appRect.top
      };
    }
    /* 发光球投影尚未就绪时才使用回退球面。 */
    const cx = width * .66, cy = height * .5;
    const rr = Math.min(width * .36, height * .4);
    const pit = .32 + .1 * Math.sin(t * .17);
    const cp = Math.cos(pit), sp = Math.sin(pit);
    return {
      points: P.map(p => {
        const yw = rotA * (.8 + .4 * p.k);
        const q = pj([p.x, p.y, p.z], Math.cos(yw), Math.sin(yw), cp, sp, cx, cy, rr);
        const u = (q[0] - (cx - rr)) / (2 * rr);
        q.push(Math.max(0, Math.min(1, (.6 - u) / .22)), (q[2] + 1) / 2);
        return q;
      }),
      sx: 1, sy: 1, ox: 0, oy: 0
    };
  }

  /* 直接使用 V9 正式信号名单驱动第四层；卡片属性仅作为未收到同步数据时的兼容回退。 */
  let directSignalSymbols = new Set(
    (Array.isArray(window.VegasFormalSignalSymbols) ? window.VegasFormalSignalSymbols : [])
      .map(symbol => String(symbol || '').toUpperCase())
  );
  let hasDirectSignalSync = Array.isArray(window.VegasFormalSignalSymbols);

  function refreshFormalCards() {
    geometryStartsDirty = true;
    const cards = Array.from(document.querySelectorAll('#market-cards-layer .mc-card[data-symbol]'));
    formalCards = hasDirectSignalSync
      ? cards.filter(card => directSignalSymbols.has(String(card.dataset.symbol || '').toUpperCase()))
      : cards.filter(card => card.matches('[data-formal-signal="true"]'));
    /* 丢弃已退出正式信号名单的卡片，避免缓存持有失效 DOM。 */
    const activeCards = new Set(formalCards);
    for (const card of cardStartByElement.keys()) {
      if (!activeCards.has(card)) cardStartByElement.delete(card);
    }
    start();
  }

  function setFormalSignals(symbols) {
    directSignalSymbols = new Set(
      (Array.isArray(symbols) ? symbols : []).map(symbol => String(symbol || '').toUpperCase())
    );
    hasDirectSignalSync = true;
    refreshFormalCards();
  }

  function updateGeometrySnapshot() {
    /* 几何读取集中在滚动/尺寸/信号变化时；动画帧只消费缓存，避免逐卡布局查询。 */
    const appRect = app.getBoundingClientRect();
    geometryAppRect = appRect;
    const orbCanvas = $('orb-core-canvas');
    geometryOrbRect = orbCanvas ? orbCanvas.getBoundingClientRect() : null;
    cardStarts.length = 0;
    const scroller = $('mc-left');
    const view = scroller ? scroller.getBoundingClientRect() : appRect;
    const clipTop = Math.max(view.top, appRect.top, 0);
    const clipBottom = Math.min(view.bottom, appRect.bottom, window.innerHeight);
    if (clipBottom <= clipTop) { geometryStartsDirty = false; return cardStarts; }
    for (const card of formalCards) {
      const r = card.getBoundingClientRect();
      const visibleTop = Math.max(r.top, clipTop);
      const visibleBottom = Math.min(r.bottom, clipBottom);
      const visibleWidth = Math.max(0, Math.min(r.right, view.right, appRect.right) - Math.max(r.left, view.left, appRect.left));
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const visibleRatio = Math.min(1, visibleHeight / Math.max(1, r.height)) * Math.min(1, visibleWidth / Math.max(1, r.width));
      if (visibleRatio <= 0 || visibleWidth <= 0) continue;
      let start = cardStartByElement.get(card);
      if (!start) {
        start = { card, symbol: '', x: 0, y: 0, visibleRatio: 0 };
        cardStartByElement.set(card, start);
      }
      start.symbol = String(card.dataset.symbol || '').toUpperCase();
      start.x = Math.min(r.right, view.right, appRect.right, window.innerWidth) - appRect.left;
      start.y = (visibleTop + visibleBottom) * .5 - appRect.top;
      start.visibleRatio = visibleRatio;
      cardStarts.push(start);
    }
    geometryStartsDirty = false;
    return cardStarts;
  }

  function getFormalSignalCardStarts() {
    if (geometryStartsDirty) updateGeometrySnapshot();
    return cardStarts;
  }

  /* 预绘制有限档位的发射辉光贴图，避免每帧、每张正式信号卡片重复创建 CanvasGradient。 */
  const emissionGlowSprites = Array.from({ length: 16 }, (_, index) => {
    const pulse = index / 15;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 128;
    const glowCtx = sprite.getContext('2d');
    const gradientRadius = 64 * (34 + pulse * 10) / (44 + pulse * 3);
    const glow = glowCtx.createRadialGradient(64, 64, 0, 64, 64, gradientRadius);
    glow.addColorStop(0, 'rgba(110,235,255,.34)');
    glow.addColorStop(.28, 'rgba(45,190,255,.18)');
    glow.addColorStop(1, 'rgba(30,150,255,0)');
    glowCtx.fillStyle = glow;
    glowCtx.beginPath();
    glowCtx.arc(64, 64, 64, 0, PI * 2);
    glowCtx.fill();
    return sprite;
  });

  /* 仅增强卡片发射端：不改变任何流线起点、球体终点或连接关系。 */
  function drawCardEmission(start, t) {
    const x = start.x, y = start.y;
    const pulse = (Math.sin(t * 3.1) + 1) * .5;
    const alpha = start.visibleRatio;

    /* 使用预绘制贴图并按脉冲档位缩放；可见比例通过globalAlpha控制。 */
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    const glowRadius = 44 + pulse * 3;
    const glowSprite = emissionGlowSprites[Math.min(15, Math.round(pulse * 15))];
    ctx.drawImage(glowSprite, x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);
    ctx.globalAlpha = 1;

    /* 细脉冲环由卡片边缘向外扩散，避免强闪烁。 */
    for (let i = 0; i < 2; i++) {
      const phase = (t * .42 + i * .5) % 1;
      const radius = 3 + phase * 25;
      ctx.globalAlpha = (1 - phase) * .38 * alpha;
      ctx.strokeStyle = i === 0 ? '#8af3ff' : '#3fc8ff';
      ctx.lineWidth = 1.15 - phase * .55;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * .72, radius, 0, 0, PI * 2);
      ctx.stroke();
    }

    /* 七色短纤维只作用于发射口附近；长距离流线仍沿原路径连接发光球。 */
    for (let i = 0; i < 7; i++) {
      const spread = (i - 3) * .105;
      const drift = (t * (.65 + i * .025) + i * .19) % 1;
      const len = 9 + drift * 24;
      const bend = spread * len * .8;
      ctx.globalAlpha = (.18 + (1 - drift) * .42) * alpha;
      ctx.strokeStyle = EMISSION_COLORS[i];
      ctx.lineWidth = .65 + (1 - drift) * .55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * .48, y + bend * .35, x + len, y + bend);
      ctx.stroke();
      ctx.globalAlpha = (.3 + (1 - drift) * .55) * alpha;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(x + len * .78, y + bend * .72, .7 + (1 - drift) * .55, 0, PI * 2);
      ctx.fill();
    }

    /* 发射核心保持贴合卡片右边缘。 */
    ctx.globalAlpha = .92 * alpha;
    ctx.fillStyle = '#d9fbff';
    ctx.shadowColor = '#48d8ff';
    ctx.shadowBlur = 12 + pulse * 7;
    ctx.beginPath();
    ctx.arc(x, y, 2.1 + pulse * .55, 0, PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
  }

  /* 每个可见卡片组分配唯一色相；黄金角间隔让相邻组颜色尽量易于区分。 */
  const EMISSION_COLORS = Array.from({ length: 7 }, (_, i) => 'hsl(' + (184 + i * 19) + ',100%,' + (68 + (i % 3) * 7) + '%)');
  const SYMBOL_COLORS = new Map();
  function getGroupColor(symbol) {
    const cached = SYMBOL_COLORS.get(symbol);
    if (cached) return cached;
    let hue = SYMBOL_HUES.get(symbol);
    if (hue == null) {
      /* 新增/延迟出现的品种只分配一次颜色，后续滚动或信号变化不会改色。 */
      hue = (190 + SYMBOL_HUES.size * 137.508) % 360;
      SYMBOL_HUES.set(symbol, hue);
    }
    const color = 'hsl(' + hue.toFixed(2) + ',100%,68%)';
    SYMBOL_COLORS.set(symbol, color);
    return color;
  }

  function flowDraw(t) {
    const dt = Math.max(0, Math.min(.05, t - lastT));
    lastT = t;
    rotA += dt * .2;
    ctx.clearRect(0, 0, width, height);
    /* 同一动画帧共用 app 的几何快照，避免球体投影与卡片锚点重复读取。 */
    const appRect = geometryAppRect || app.getBoundingClientRect();
    const projection = getOrbPoints(t, appRect);
    const pr = projection.points;
    const starts = getFormalSignalCardStarts();
    /* 每帧只计算一次 36 个球体投影端点，供所有独立卡片组复用。 */
    for (let i = 0; i < F.length; i++) {
      const f = F[i], q = pr[f.t];
      f.valid = !!q;
      if (!q) continue;
      f.fa = q[3] == null ? 1 : q[3];
      f.qx = projection.ox + q[0] * projection.sx;
      f.qy = projection.oy + q[1] * projection.sy;
    }
    if (!starts.length) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      return false;
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = .8;
    for (let groupIndex = 0; groupIndex < starts.length; groupIndex++) {
      const start = starts[groupIndex];
      /* 同一组只连接当前卡片；每组独立配色，当前可见组之间不重复。 */
      const groupColor = getGroupColor(start.symbol);
      /* 每组统一设置粒子辉光状态，避免每个粒子反复写入相同 Canvas 属性。 */
      ctx.shadowColor = groupColor;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = groupColor;
      ctx.fillStyle = groupColor;
      const c1y = start.y;
      for (let particleIndex = 0; particleIndex < F.length; particleIndex++) {
        const f = F[particleIndex];
        if (!f.valid || f.fa < .05) continue;
        const fa = f.fa, qx = f.qx, qy = f.qy;
        const c1x = start.x + (qx - start.x) * .42;
        ctx.globalAlpha = .22 * fa * start.visibleRatio;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.quadraticCurveTo(c1x, c1y, qx, qy);
        ctx.stroke();

        const u = (t * f.v + f.o + groupIndex * .13) % 1, v = 1 - u;
        const px = v * v * start.x + 2 * v * u * c1x + u * u * qx;
        const py = v * v * start.y + 2 * v * u * c1y + u * u * qy;
        ctx.globalAlpha = .95 * fa * start.visibleRatio;
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      drawCardEmission(start, t + groupIndex * .17);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }

  function scheduleFrame() {
    if (document.hidden || frameId || frameTimer) return;
    const wait = Math.max(0, FRAME_INTERVAL - (performance.now() - lastFrameAt));
    frameTimer = window.setTimeout(() => {
      frameTimer = 0;
      if (!document.hidden) frameId = requestAnimationFrame(frame);
    }, wait);
  }
  function frame(ms) {
    frameId = 0;
    if (document.hidden) return;
    lastFrameAt = performance.now();
    if (flowDraw(ms / 1000)) scheduleFrame();
  }
  function start() {
    if (!frameId && !frameTimer && !document.hidden) {
      lastT = 0;
      scheduleFrame();
    }
  }
  /* 无可见正式信号时停止绘制；滚动、窗口尺寸或信号变化时按需恢复。 */
  const motionScroller = $('mc-left');
  if (motionScroller) motionScroller.addEventListener('scroll', () => { updateGeometrySnapshot(); start(); }, { passive: true });
  window.addEventListener('scroll', () => { updateGeometrySnapshot(); start(); }, { passive: true });
  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    if (frameTimer) clearTimeout(frameTimer);
    frameId = 0;
    frameTimer = 0;
  }

  resize();
  window.addEventListener('resize', () => { resize(); updateGeometrySnapshot(); start(); }, { passive: true });
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => { resize(); updateGeometrySnapshot(); start(); });
    resizeObserver.observe(app);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  if (window.MutationObserver) {
    const cardLayer = $('market-cards-layer');
    if (cardLayer) {
      const signalObserver = new MutationObserver(() => { refreshFormalCards(); updateGeometrySnapshot(); });
      signalObserver.observe(cardLayer, { subtree: true, attributes: true, attributeFilter: ['data-formal-signal'] });
    }
  }
  window.__VEGAS_DATA_STREAM_LAYER_READY__ = true;
  window.VegasDataStreamLayer = {
    resize,
    syncCardLines,
    setFormalSignals,
    getState: () => ({
      layer: 4,
      ready: true,
      connectedToOrb: !!(window.VegasOrbProjectedPoints && window.VegasOrbProjectedPoints.length),
      connectedToSmallCards: !!$('mc-left'),
      streamCount: F.length,
      anchorMode: 'one-independent-stream-group-per-formal-signal-card',
      activeSignalSymbols: getFormalSignalCardStarts().map(card => card.symbol),
      visibleFormalSignalCardCount: getFormalSignalCardStarts().length,
      formalSignalCardCount: document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]').length,
      canvasWidth: width,
      canvasHeight: height
    })
  };
  refreshFormalCards();
  updateGeometrySnapshot();
  start();
  console.info('[Vegas Fourth Layer] data stream directly synced with V9 formal signals');
})();
