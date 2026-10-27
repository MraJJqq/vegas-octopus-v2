/* Vegas 章鱼｜动态独立数据流
 * Reuses the asset-library seven-hue palette and thin curved fibre/glow-particle style.
 * Each stream is independent and connects one of the seven most volatile cards to the luminous core.
 */
(function(){
  'use strict';
  const COLORS=[0,28,52,150,190,245,320];
  function start(){
    const stage=document.querySelector('.center-stage');
    const grid=document.getElementById('octopusMarketCardGrid');
    const orb=stage&&stage.querySelector('.core-orb');
    if(!stage||!grid||!orb)return;
    const canvas=document.createElement('canvas');
    canvas.id='octopusDynamicDataStreams';
    Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'3'});
    stage.appendChild(canvas);
    const ctx=canvas.getContext('2d');
    let w=1,h=1,dpr=1;
    function resize(){
      const r=stage.getBoundingClientRect();dpr=Math.min(window.devicePixelRatio||1,2);
      w=Math.max(1,r.width);h=Math.max(1,r.height);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function pct(card){
      const el=card.querySelector('.pct');
      const v=el?parseFloat(el.textContent.replace('%','')):NaN;
      return Number.isFinite(v)?Math.abs(v):-1;
    }
    function frame(ms){
      const t=ms/1000;
      ctx.clearRect(0,0,w,h);
      const sr=stage.getBoundingClientRect(),or=orb.getBoundingClientRect();
      const ox=or.left-sr.left+or.width/2,oy=or.top-sr.top+or.height/2;
      const cards=[...grid.querySelectorAll('.pos')].filter(el=>{
        const r=el.getBoundingClientRect(),p=pct(el);
        return p>=0&&r.width>0&&r.height>0&&r.right>sr.left&&r.left<sr.right&&r.bottom>sr.top&&r.top<sr.bottom;
      }).sort((a,b)=>pct(b)-pct(a)).slice(0,7);
      cards.forEach((card,i)=>{
        const r=card.getBoundingClientRect();
        const x=r.left-sr.left+r.width/2,y=r.top-sr.top+r.height/2;
        const color='hsl('+COLORS[i]+',100%,62%)';
        const bend=(i-3)*Math.min(14,w*.025);
        const cx=(x+ox)/2+bend,cy=(y+oy)/2;
        const p=Math.min(1,pct(card)/8);
        ctx.save();
        ctx.lineWidth=.8+p*.7;
        ctx.strokeStyle=color;ctx.globalAlpha=.2+p*.22;
        ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(cx,cy,ox,oy);ctx.stroke();
        const u=(t*(.18+p*.22)+i*.137)%1,v=1-u;
        const px=v*v*x+2*v*u*cx+u*u*ox,py=v*v*y+2*v*u*cy+u*u*oy;
        ctx.globalAlpha=.95;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8+p*8;
        ctx.beginPath();ctx.arc(px,py,1.6+p*.8,0,Math.PI*2);ctx.fill();
        ctx.restore();
      });
      requestAnimationFrame(frame);
    }
    resize();
    if(window.ResizeObserver)new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize',resize,{passive:true});
    requestAnimationFrame(frame);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();