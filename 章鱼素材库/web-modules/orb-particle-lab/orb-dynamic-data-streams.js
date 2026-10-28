/* Vegas 章鱼｜第四层：七色数据流连接正式信号卡片与发光球
 * 保留素材库原版七色、150 粒子、曲线控制方式、速度、透明度与辉光参数。
 * 每帧读取当天正式信号卡片；每张正式卡片匹配最近的实时球面粒子作为连接终点。
 * 不修改行情、信号识别、正式信号推送规则。
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
    Object.assign(cv.style, { position:'absolute', inset:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'2' });
    const cardLayer = document.getElementById('market-cards-layer');
    if (cardLayer && cardLayer.parentElement === app) app.insertBefore(cv, cardLayer);
    else app.appendChild(cv);
    const x = cv.getContext('2d');
    let W=1,H=1,dpr=1,raf=0;

    function rs() {
      const r=app.getBoundingClientRect();
      dpr=window.devicePixelRatio||1; W=r.width; H=r.height;
      cv.width=Math.max(1,Math.round(W*dpr)); cv.height=Math.max(1,Math.round(H*dpr));
      x.setTransform(dpr,0,0,dpr,0,0);
    }

    function getProjectedOrb() {
      // 直接读取发光球自身每帧生成的投影点，确保数据流终点与球面粒子完全重合。
      const points=window.VegasOrbProjectedPoints;
      return Array.isArray(points) && points.length ? points : null;
    }

    function frame(ms) {
      const t=ms/1000;
      x.clearRect(0,0,W,H);
      const pr=getProjectedOrb();
      const appRect=app.getBoundingClientRect();
      // 只为当前滚动视口内实际可见的正式信号卡片绘制数据流。
      // 被滚动到视口之外的卡片不参与连接，滚回可见区域后自动恢复。
      const cards=Array.from(document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]'));
      const targets=cards.map(function(card){
        const rect=card.getBoundingClientRect();
        const scroller=card.closest('.mc-side');
        const clip=scroller ? scroller.getBoundingClientRect() : appRect;
        const visible=rect.width>0 && rect.height>0 &&
          rect.right>clip.left && rect.left<clip.right &&
          rect.bottom>clip.top && rect.top<clip.bottom &&
          rect.right>appRect.left && rect.left<appRect.right &&
          rect.bottom>appRect.top && rect.top<appRect.bottom;
        return visible ? {rect:rect} : null;
      }).filter(Boolean);
      if (pr && targets.length) {
        // 原版 F 总计 150 根，是全页面总量，不是每张卡片各 150 根。
        // 将这 150 根分配给当前正式信号卡片，每根只绘制一次，避免按卡片数量倍增。
        x.globalCompositeOperation='lighter';
        x.lineWidth=.8;
        F.forEach(function(f,index){
          const target=targets[index%targets.length];
          const cardR=target.rect;
          const cardCenterX=cardR.left+cardR.width/2-appRect.left;
          const cardCenterY=cardR.top+cardR.height/2-appRect.top;
          const q=pr[f.t],fa=q[3];
          if(fa<.05)return;
          // 连接点始终以卡片垂直中心为准，并根据球面终点所在方向选择卡片左右边缘。
          const endX=q[0],endY=q[1];
          const cardLeft=cardR.left-appRect.left;
          const cardRight=cardR.right-appRect.left;
          const startX=endX>=cardCenterX?cardRight:cardLeft;
          const y0=cardCenterY;
          const c1x=(startX+endX)*.5;
          const col='hsl('+SH[f.s]+',100%,62%)';
          x.strokeStyle=col;x.globalAlpha=.26*fa;
          x.beginPath();x.moveTo(startX,y0);x.quadraticCurveTo(c1x,y0,endX,endY);x.stroke();
          const u=(t*f.v+f.o)%1,v=1-u;
          const px=v*v*startX+2*v*u*c1x+u*u*endX;
          const py=v*v*y0+2*v*u*y0+u*u*endY;
          x.globalAlpha=.95*fa;x.fillStyle=col;x.shadowColor=col;x.shadowBlur=8;
          x.beginPath();x.arc(px,py,1.6,0,Math.PI*2);x.fill();x.shadowBlur=0;
        });
      }
      x.globalAlpha=1;x.globalCompositeOperation='source-over';
      raf=requestAnimationFrame(frame);
    }

    window.VegasSignalDataStreams=Object.freeze({refresh:rs});
    rs();
    if(window.ResizeObserver)new ResizeObserver(rs).observe(app);
    window.addEventListener('resize',rs,{passive:true});
    raf=requestAnimationFrame(frame);
    document.addEventListener('visibilitychange',function(){
      if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}
      else if(!document.hidden&&!raf)raf=requestAnimationFrame(frame);
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();