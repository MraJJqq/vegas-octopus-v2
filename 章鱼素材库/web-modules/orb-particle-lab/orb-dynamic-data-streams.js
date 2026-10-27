/* Vegas 章鱼｜动态独立数据流
 * Match the original orb-seven-data-streams.js visual language:
 * seven hues, fine curved fibres, dim trails and many moving glow particles.
 * Each of seven independent fibres connects a high-volatility card to the core.
 */
(function(){
  'use strict';
  const COLORS=Object.freeze([0,28,52,150,190,245,320]);
  const PARTICLES_PER_STREAM=22;
  function start(){
    const stage=document.querySelector('.center-stage');
    const grid=document.getElementById('octopusMarketCardGrid');
    const orb=stage&&stage.querySelector('.core-orb');
    if(!stage||!grid||!orb||document.getElementById('octopusDynamicDataStreams'))return;
    const canvas=document.createElement('canvas');
    canvas.id='octopusDynamicDataStreams';
    Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'3'});
    stage.appendChild(canvas);
    const ctx=canvas.getContext('2d');
    let w=1,h=1,dpr=1;
    const streams=Array.from({length:7},(_,s)=>({
      hue:COLORS[s],phase:Math.random(),bend:(s-3)*.025,
      particles:Array.from({length:PARTICLES_PER_STREAM},()=>({offset:Math.random(),speed:.18+Math.random()*.25,size:1.1+Math.random()*.5}))
    }));
    function resize(){
      const r=stage.getBoundingClientRect();dpr=Math.min(window.devicePixelRatio||1,2);
      w=Math.max(1,r.width);h=Math.max(1,r.height);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function volatility(card){
      const el=card.querySelector('.pct');
      if(!el)return -1;
      const n=parseFloat(el.textContent.replace(/[^0-9.+-]/g,''));
      return Number.isFinite(n)?Math.abs(n):-1;
    }
    function frame(ms){
      const time=ms/1000;
      ctx.clearRect(0,0,w,h);
      const sr=stage.getBoundingClientRect(),or=orb.getBoundingClientRect();
      const ox=or.left-sr.left+or.width/2,oy=or.top-sr.top+or.height/2;
      const cards=[...grid.querySelectorAll('.pos')].filter(card=>{
        const r=card.getBoundingClientRect();
        return volatility(card)>=0&&r.width>0&&r.height>0&&r.right>sr.left&&r.left<sr.right&&r.bottom>sr.top&&r.top<sr.bottom;
      }).sort((a,b)=>volatility(b)-volatility(a)).slice(0,7);
      streams.forEach((stream,index)=>{
        const card=cards[index];if(!card)return;
        const r=card.getBoundingClientRect();
        const ax=r.left-sr.left+r.width/2,ay=r.top-sr.top+r.height/2;
        const dx=ox-ax,dy=oy-ay;
        const cx=(ax+ox)/2-dy*stream.bend,cy=(ay+oy)/2+dx*stream.bend;
        const fade=Math.max(.2,Math.min(1,volatility(card)/5));
        const color='hsl('+stream.hue+',100%,62%)';
        ctx.save();ctx.lineWidth=.8;ctx.strokeStyle=color;ctx.globalAlpha=.26*fade;
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(cx,cy,ox,oy);ctx.stroke();
        stream.particles.forEach(p=>{
          const u=(time*p.speed+p.offset+stream.phase)%1,v=1-u;
          const px=v*v*ax+2*v*u*cx+u*u*ox,py=v*v*ay+2*v*u*cy+u*u*oy;
          ctx.globalAlpha=.95*fade;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;
          ctx.beginPath();ctx.arc(px,py,p.size,0,Math.PI*2);ctx.fill();
        });
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