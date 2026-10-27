/* orb-seven-data-streams.js
 * Vegas 章鱼｜发光球七根彩色数据流模块
 * 独立素材：七种色相、150 个流动光点、二次贝塞尔曲线与动态光点。
 * 网页暂时停用时，此文件仍作为可复用素材保存。
 *
 * API:
 *   const streams = VegasOrbSevenStreams.create(Math.random, 150, 900);
 *   VegasOrbSevenStreams.draw(ctx, {
 *     streams, projected, width, height, cx, cy, time
 *   });
 * projected 为发光球每个粒子的投影数组；每项至少包含 [x, y, depthFade]。
 */
(function (global) {
  "use strict";

  const COLORS = Object.freeze([0, 28, 52, 150, 190, 245, 320]);

  function create(random, count, particleCount) {
    const rand = typeof random === "function" ? random : Math.random;
    const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 150;
    const particleTotal = Number.isFinite(particleCount) ? Math.max(1, Math.floor(particleCount)) : 900;
    const streams = [];
    for (let i = 0; i < total; i++) {
      streams.push({
        s: i % 7,
        t: Math.floor(rand() * particleTotal),
        o: rand(),
        v: 0.18 + rand() * 0.25
      });
    }
    return streams;
  }

  function draw(ctx, state) {
    if (!ctx || !state) return;
    const streams = state.streams || [];
    const projected = state.projected || [];
    const width = state.width || 0;
    const height = state.height || 0;
    const cx = state.cx || 0;
    const cy = state.cy || 0;
    const time = state.time || 0;

    ctx.lineWidth = 0.8;
    streams.forEach(function (stream) {
      const point = projected[stream.t];
      if (!point) return;
      const fade = point[3];
      if (fade < 0.05) return;

      const y0 = height * (0.12 + stream.s * 0.12);
      const color = "hsl(" + COLORS[stream.s] + ",100%,62%)";
      const controlX = cx * 0.5;

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.26 * fade;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      ctx.quadraticCurveTo(controlX, y0, point[0], point[1]);
      ctx.stroke();

      const u = (time * stream.v + stream.o) % 1;
      const v = 1 - u;
      const px = 2 * v * u * controlX + u * u * point[0];
      const py = v * v * y0 + 2 * v * u * y0 + u * u * point[1];

      ctx.globalAlpha = 0.95 * fade;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }

  global.VegasOrbSevenStreams = Object.freeze({
    colors: COLORS,
    create: create,
    draw: draw
  });
})(typeof window !== "undefined" ? window : globalThis);
