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
      const cards=Array.from(document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]'));
      if (pr && cards.length) {
        const appRect=app.getBoundingClientRect();
        const targets=cards.map(function(card){
          const r=card.getBoundingClientRect();
          const center={x:r.left+r.width/2-appRect.left,y:r.top+r.height/2-appRect.top};
          let best=0,bestD=Infinity;
          pr.forEach(function(q,i){
            const d=(q[0]-center.x)*(q[0]-center.x)+(q[1]-center.y)*(q[1]-center.y);
            if(d<bestD){bestD=d;best=i;}
          });
          return {card:card,center:center,target:best,rect:r};
        });
        // 一张正式信号卡片只显示一条对应数据流；无对应信号的多余数据流不绘制。
        x.globalCompositeOperation='lighter';
        x.lineWidth=.8;
        targets.forEach(function(target,i){
          const f=F[i];
          const q=pr[target.target],fa=q[3];
          if(fa<.05)return;
          const cardR=target.rect;
          // 只把流的起点同步到正式信号卡片右侧；沿用素材库原版曲线控制方式。
          const startX=cardR.right-appRect.left;
          const startY=cardR.top+cardR.height/2-appRect.top;
          const endX=q[0],endY=q[1];
          const y0=startY,c1x=(W*.66)*.5;
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