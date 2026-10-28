/* Vegas 章鱼｜第四层：七色数据流连接正式信号卡片与发光球
 * 保留素材库原版七色、150 粒子、曲线控制方式、速度、透明度与辉光参数。
 * 每帧读取当天正式信号卡片；每张正式卡片匹配最近的实时球面粒子作为连接终点。
 * 不修改行情、信号识别、正式信号推送规则。
 */
(function () {
  'use strict';
  const SH = [0, 28, 52, 150, 190, 245, 320];
  const F = [];
  for (let i = 0; i < 300; i++) {
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
    const cardStates=new WeakMap();
    const cardGroups=new WeakMap();
    let nextGroup=0,lastFrameMs=0;

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
      const dt=lastFrameMs ? Math.min(.1,Math.max(0,(ms-lastFrameMs)/1000)) : 1/60;
      lastFrameMs=ms;
      x.clearRect(0,0,W,H);
      const pr=getProjectedOrb();
      const appRect=app.getBoundingClientRect();
      const cards=Array.from(document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"]'));
      const active=new Set(cards);
      const targets=[];
      cards.forEach(function(card){
        const rect=card.getBoundingClientRect();
        const scroller=card.closest('.mc-side');
        const clip=scroller ? scroller.getBoundingClientRect() : appRect;
        const left=Math.max(rect.left,clip.left,appRect.left);
        const right=Math.min(rect.right,clip.right,appRect.right);
        const top=Math.max(rect.top,clip.top,appRect.top);
        const bottom=Math.min(rect.bottom,clip.bottom,appRect.bottom);
        const visibleArea=Math.max(0,right-left)*Math.max(0,bottom-top);
        const totalArea=Math.max(1,rect.width*rect.height);
        const ratio=rect.width>0&&rect.height>0 ? Math.min(1,visibleArea/totalArea) : 0;
        const slot=card.closest('.mc-slot');
        const slotOpacity=slot ? Number.parseFloat(getComputedStyle(slot).opacity) : 1;
        let state=cardStates.get(card);
        if(!state){state={opacity:0};cardStates.set(card,state);}
        // 与滚动卡片的可见/淡化状态同步；离开滚动视口后平滑消失，滚回后平滑出现。
        const targetOpacity=ratio>0 ? Math.max(0,Math.min(1,ratio*(Number.isFinite(slotOpacity)?slotOpacity:1))) : 0;
        const step=Math.min(1,dt/.18);
        state.opacity+=(targetOpacity-state.opacity)*step;
        if(state.opacity>.005 && rect.width>0 && rect.height>0) {
          if(!cardGroups.has(card)){cardGroups.set(card,nextGroup++);}
          targets.push({card:card,rect:rect,opacity:state.opacity,group:cardGroups.get(card)});
        }
      });
      if (pr && targets.length) {
        // 每张卡片固定一组七色数据流，始终绘制七根；不会因球面粒子透明度而随机少线。
        x.globalCompositeOperation='lighter';
        x.lineWidth=1.2;
        targets.forEach(function(target){
          const cardR=target.rect;
          const cardCenterX=cardR.left+cardR.width/2-appRect.left;
          const cardCenterY=cardR.top+cardR.height/2-appRect.top;
          const cardLeft=cardR.left-appRect.left;
          const cardRight=cardR.right-appRect.left;
          const groupBase=(target.group*14)%(F.length-13);
          for(let j=0;j<14;j++){
            const f=F[groupBase+j];
            let q=pr[f.t];
            // 球面点过暗时，改用最近的可见投影粒子，避免单组数据流数量缺失。
            if(!q || q.length<4) continue;
            if(q[3]<.08){
              let best=null,bestScore=Infinity;
              for(let k=0;k<pr.length;k++){
                const candidate=pr[k];
                if(!candidate || candidate.length<4 || candidate[3]<.08) continue;
                const score=Math.abs(candidate[0]-cardCenterX)+Math.abs(candidate[1]-cardCenterY);
                if(score<bestScore){best=candidate;bestScore=score;}
              }
              if(best) q=best;
            }
            const fa=Math.max(.12,Math.min(1,q[3]||0));
            const endX=q[0],endY=q[1];
            const startX=endX>=cardCenterX?cardRight:cardLeft;
            const y0=cardCenterY+(j-6.5)*3.5;
            const c1x=(startX+endX)*.5;
            const col='hsl('+SH[f.s]+',100%,62%)';
            x.strokeStyle=col;x.globalAlpha=.52*fa*target.opacity;
            x.beginPath();x.moveTo(startX,y0);x.quadraticCurveTo(c1x,y0,endX,endY);x.stroke();
            const u=(t*f.v+f.o)%1,v=1-u;
            const px=v*v*startX+2*v*u*c1x+u*u*endX;
            const py=v*v*y0+2*v*u*y0+u*u*endY;
            x.globalAlpha=Math.min(1,1.15*fa*target.opacity);x.fillStyle=col;x.shadowColor=col;x.shadowBlur=14;
            x.beginPath();x.arc(px,py,2.1,0,Math.PI*2);x.fill();x.shadowBlur=0;
          }
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