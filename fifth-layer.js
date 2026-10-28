/* 第五层：透明大卡片图表。独立模块；不改写前四层样式或业务逻辑。 */
(function(){
  'use strict';
  if (window.__VEGAS_FIFTH_LAYER__) return;
  window.__VEGAS_FIFTH_LAYER__ = true;

  const style = document.createElement('style');
  style.textContent = `
  #vegas-fifth-overlay{position:fixed;inset:0;z-index:20;display:none;background:transparent;pointer-events:auto}
  #vegas-fifth-chart{position:absolute;inset:5vh 5vw;width:90vw;height:90vh;display:block;background:transparent;pointer-events:auto;touch-action:none;cursor:crosshair}
  #vegas-fifth-status{position:absolute;left:7vw;top:6vh;color:rgba(210,235,255,.78);font:12px/1.4 Inter,-apple-system,sans-serif;pointer-events:none;text-shadow:0 0 8px #02040a}
  `;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.id = 'vegas-fifth-overlay';
  overlay.innerHTML = '<canvas id="vegas-fifth-chart" aria-label="4小时K线与Vegas均线图"></canvas><div id="vegas-fifth-status"></div>';
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas'), ctx = canvas.getContext('2d'), status = overlay.querySelector('#vegas-fifth-status');
  const API='https://api.bitget.com';
  const EMA_SPECS=[{p:12,c:'#ffd84a'},{p:36,c:'#f4f8ff'},{p:43,c:'#f4f8ff'},{p:144,c:'#ffd84a'},{p:169,c:'#ffd84a'},{p:576,c:'#ff4c62'},{p:676,c:'#ff4c62'}];
  let candles=[], series=[], activeSymbol='', activeName='', isStock=false, viewEnd=0, viewCount=90, panStart=null, lastPointer=null, refreshTimer=null, resizeObserver=null, dpr=1, W=1,H=1, hitSegments=[];
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function resize(){
    const r=canvas.getBoundingClientRect(); dpr=Math.max(1,window.devicePixelRatio||1); W=Math.max(1,r.width); H=Math.max(1,r.height);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); draw();
  }
  function ema(values,period){
    const out=Array(values.length).fill(null), k=2/(period+1); let prev=null;
    for(let i=0;i<values.length;i++){const v=values[i];if(!Number.isFinite(v))continue;prev=prev===null?v:v*k+prev*(1-k);out[i]=prev;}
    return out;
  }
  function normalizeRows(rows){
    return (Array.isArray(rows)?rows:[]).filter(r=>Array.isArray(r)&&r.length>=5&&Number(r[1])>0&&Number(r[2])>0&&Number(r[3])>0&&Number(r[4])>0)
      .map(r=>({t:Number(r[0]),o:Number(r[1]),h:Number(r[2]),l:Number(r[3]),c:Number(r[4])})).sort((a,b)=>a.t-b.t)
      .filter((r,i,a)=>!i||r.t!==a[i-1].t);
  }
  async function json(path){const r=await fetch(API+path,{cache:'no-store'});if(!r.ok)throw new Error('行情接口 HTTP '+r.status);const j=await r.json();if(j.code!=='00000'||!Array.isArray(j.data))throw new Error(j.msg||'行情数据格式异常');return j.data;}
  async function resolveStockSymbol(symbol){
    const rows=await json('/api/v3/reality/market/stock-info');
    const found=rows.find(s=>s&&String(s.code||'').toUpperCase()===symbol.toUpperCase()||s&&String(s.name||'').toUpperCase()===symbol.toUpperCase());
    return found&&found.symbol?String(found.symbol):symbol;
  }
  async function load(){
    status.textContent=activeName+' · 4H · 正在加载行情';
    try{
      let apiSymbol=activeSymbol, rows;
      if(isStock){
        apiSymbol=await resolveStockSymbol(activeSymbol);
        rows=await json('/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol:apiSymbol,interval:'4H',limit:'1000'}));
      }else{
        rows=await json('/api/v2/mix/market/candles?'+new URLSearchParams({symbol:apiSymbol,productType:'USDT-FUTURES',granularity:'4H',limit:'1000'}));
      }
      candles=normalizeRows(rows);
      if(!candles.length)throw new Error('该品种没有可用的4H K线数据');
      series=EMA_SPECS.map(s=>({...s,v:ema(candles.map(c=>c.c),s.p)}));
      viewEnd=candles.length; viewCount=Math.min(viewCount,Math.max(20,candles.length));
      status.textContent=activeName+' · 4H · 最近一个月 · 实时行情';
      draw();
    }catch(e){status.textContent=activeName+' · 行情加载失败：'+(e&&e.message?e.message:'未知错误');console.warn('[Vegas Fifth Layer]',e);}
  }
  function visibleRange(){
    const end=Math.max(1,Math.min(candles.length,viewEnd||candles.length));
    const start=Math.max(0,end-Math.max(10,viewCount));
    return {start,end};
  }
  function draw(){
    if(!ctx||overlay.style.display==='none')return;
    ctx.clearRect(0,0,W,H); hitSegments=[];
    if(!candles.length)return;
    const {start,end}=visibleRange(), list=candles.slice(start,end);
    if(!list.length)return;
    const pad={l:8,r:8,t:35,b:12}, cw=Math.max(1,W-pad.l-pad.r), ch=Math.max(1,H-pad.t-pad.b), step=cw/list.length, bodyW=Math.max(1,Math.min(7,step*.62));
    let min=Infinity,max=-Infinity;
    list.forEach((c,j)=>{min=Math.min(min,c.l);max=Math.max(max,c.h);});
    series.forEach(s=>{for(let i=start;i<end;i++){const v=s.v[i];if(v!==null&&Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}});
    const margin=(max-min)*.06||Math.max(max*.005,.01);min-=margin;max+=margin;
    const py=v=>pad.t+(max-v)/(max-min)*ch, px=i=>pad.l+(i-start+.5)*step;
    // Only draw actual candlesticks and Vegas EMA curves: no axes, grid, legend, or panel.
    list.forEach((c,j)=>{
      const i=start+j,x=px(i),up=c.c>=c.o,color=up?'#2ee6a6':'#ff5c7c',yH=py(c.h),yL=py(c.l),yO=py(c.o),yC=py(c.c);
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,Math.min(1.5,step*.18));ctx.beginPath();ctx.moveTo(x,yH);ctx.lineTo(x,yL);ctx.stroke();
      const top=Math.min(yO,yC),bh=Math.max(1,Math.abs(yC-yO));ctx.fillStyle=color;ctx.fillRect(x-bodyW/2,top,bodyW,bh);
      hitSegments.push({x1:x,y1:yH,x2:x,y2:yL,type:'candle'});
      hitSegments.push({x1:x-bodyW/2,y1:top,x2:x+bodyW/2,y2:top+bh,type:'candle'});
    });
    series.forEach(s=>{
      ctx.strokeStyle=s.c;ctx.lineWidth=s.p===12?1.5:1.25;ctx.globalAlpha=s.p===12?.95:.88;ctx.beginPath();let begun=false,prev=null;
      for(let i=start;i<end;i++){const v=s.v[i];if(v===null||!Number.isFinite(v)){begun=false;prev=null;continue;}const x=px(i),y=py(v);if(!begun){ctx.moveTo(x,y);begun=true;}else{ctx.lineTo(x,y);hitSegments.push({x1:prev.x,y1:prev.y,x2:x,y2:y,type:'ema'});}prev={x,y};}
      ctx.stroke();ctx.globalAlpha=1;
    });
  }
  function open(card){
    const symbol=String(card.dataset.symbol||'').toUpperCase();if(!symbol)return;
    activeSymbol=symbol;activeName=(card.querySelector('.mc-sym')?.childNodes[0]?.textContent||symbol).trim();
    isStock=['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX'].includes(symbol);
    viewCount=90;viewEnd=0;overlay.style.display='block';resize();load();
    if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(overlay.style.display!=='none')load();},60000);
  }
  function close(){overlay.style.display='none';if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}panStart=null;}
  function distToSegment(p,s){const dx=s.x2-s.x1,dy=s.y2-s.y1,l=dx*dx+dy*dy;const t=l?Math.max(0,Math.min(1,((p.x-s.x1)*dx+(p.y-s.y1)*dy)/l)):0;return Math.hypot(p.x-(s.x1+t*dx),p.y-(s.y1+t*dy));}
  canvas.addEventListener('pointerdown',e=>{if(!candles.length)return;panStart={x:e.clientX,y:e.clientY,end:viewEnd,count:viewCount};lastPointer={x:e.offsetX,y:e.offsetY};try{canvas.setPointerCapture(e.pointerId)}catch(_){}});
  canvas.addEventListener('pointermove',e=>{
    if(!panStart)return;const dx=e.clientX-panStart.x;const r=canvas.getBoundingClientRect(),step=(W-16)/Math.max(1,viewCount);
    if(Math.abs(dx)>2){viewEnd=Math.max(1,Math.min(candles.length,panStart.end-Math.round(dx/Math.max(1,step))));draw();}
  });
  canvas.addEventListener('pointerup',e=>{
    if(!panStart)return;const moved=Math.hypot(e.clientX-panStart.x,e.clientY-panStart.y);panStart=null;
    if(moved>5)return;
    const p={x:e.offsetX,y:e.offsetY};if(!hitSegments.some(s=>distToSegment(p,s)<9))close();
  });
  canvas.addEventListener('pointercancel',()=>{panStart=null;});
  canvas.addEventListener('wheel',e=>{
    if(!candles.length)return;e.preventDefault();const factor=e.deltaY<0?.82:1.22;
    viewCount=Math.max(20,Math.min(candles.length,Math.round(viewCount*factor)));viewEnd=Math.max(viewCount,Math.min(candles.length,viewEnd||candles.length));draw();
  },{passive:false});
  overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.style.display!=='none')close();});
  window.addEventListener('resize',resize,{passive:true});
  if(window.ResizeObserver)resizeObserver=new ResizeObserver(resize).observe(canvas);
  document.addEventListener('click',e=>{
    if(overlay.style.display!=='none')return;
    const card=e.target.closest('#market-cards-layer .mc-card[data-symbol]');
    if(card)open(card);
  });
  window.VegasFifthLayer={open,close};
})();