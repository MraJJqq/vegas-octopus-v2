/* 第三层：27 张品种行情卡片、滚动聚焦和行情刷新。 */
(()=>{
const P=[
 ["AAPL","AAPLUSDT"],["MSFT","MSFTUSDT"],["GOOGL","GOOGLUSDT"],["AMZN","AMZNUSDT"],["NVDA","NVDAUSDT"],["TSLA","TSLAUSDT"],["META","METAUSDT"],["INTC","INTCUSDT"],["QCOM","QCOMUSDT"],["AMD","AMDUSDT"],["TSM","TSMUSDT"],["AVGO","AVGOUSDT"],["ORCL","ORCLUSDT"],["ARM","ARMUSDT"],["MU","MUUSDT"],["ASML","ASMLUSDT"],["SNDK","SNDKUSDT"],["SKHYNIX","SKHYNIXUSDT"],["MRVL","MRVLUSDT"],["GLW","GLWUSDT"],["HOOD","HOODUSDT"],["CBRS","CBRSUSDT"],["SPCX","SPCXUSDT"],["BTC","BTCUSDT"],["HYPE","HYPEUSDT"],["XAU","XAUUSDT"],["CL","CLUSDT"]
];
const REALITY_STOCKS=new Set(P.slice(0,23).map(x=>x[0]));
const fmt=p=>p>=100?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(3):p.toFixed(4);
const S=P.map(([s,api],i)=>({s,api,i,p:0,o:0,ready:false,candles:[]}));
const left=document.getElementById('mc-left');
if(!left){console.warn('[Vegas Octopus] market-card root #mc-left is missing; layer 3 initialization skipped.');return;}
S.forEach(d=>{
 left.insertAdjacentHTML('beforeend',`<div class="mc-slot"><div class="mc-float" style="--d:${-d.i*.9}s"><div class="mc-card" id="mc-c${d.i}" data-symbol="${d.s}"><div class="mc-glow"></div><div class="mc-row"><div class="mc-sym"><span class="mc-ico">${d.s==='BTC'?'₿':d.s==='XAU'?'Au':d.s==='CL'?'OIL':d.s==='HYPE'?'H':d.s[0]}</span><span class="mc-name">${d.s}<small>${d.s==='BTC'||d.s==='HYPE'?'永续合约':d.s==='XAU'?'黄金永续合约':d.s==='CL'?'原油期货':'美股行情'}</small></span></div><span class="mc-chg">--</span></div><div class="mc-price">加载中</div><canvas class="mc-chart" aria-hidden="true"></canvas><div class="mc-tag">LIVE MARKET</div></div></div><div class="mc-gshadow" style="--d:${-d.i*.9}s"></div></div>`);
 const card=left.lastElementChild?.querySelector('.mc-card');
 if(!card){console.warn('[Vegas Octopus] market card DOM creation failed:',d.s);return;}
 d.dom={card,price:card.querySelector('.mc-price'),pct:card.querySelector('.mc-chg'),chart:card.querySelector('.mc-chart')};

});
/* 鼠标使用原生 click；触屏使用 touchend 轻点兜底。
   两条入口统一选品，并抑制同一次触摸随后产生的合成 click。 */
function selectMarketSymbol(value){
 const symbol=String(value||'').trim().toUpperCase();
 if(!symbol)return;
 if(typeof window.VegasLayer5ShowSymbol==='function')window.VegasLayer5ShowSymbol(symbol);
 else window.__VEGAS_PENDING_LAYER5_SYMBOL=symbol;
}
let lastTouchSelection={symbol:'',time:0};
let touchTapCard=null,touchTapX=0,touchTapY=0;
function selectMarketCard(event){
 const target=event.target;
 const card=target instanceof Element?target.closest('.mc-card[data-symbol]'):null;
 if(!card||!left.contains(card))return;
 const symbol=String(card.dataset.symbol||'').trim().toUpperCase();
 if(!symbol)return;
 if(lastTouchSelection.symbol===symbol&&Date.now()-lastTouchSelection.time<750)return;
 selectMarketSymbol(symbol);
}
left.addEventListener('click',selectMarketCard,{capture:true});
left.addEventListener('touchstart',event=>{
 const touch=event.touches&&event.touches[0];
 const target=event.target;
 touchTapCard=target instanceof Element?target.closest('.mc-card[data-symbol]'):null;
 if(!touchTapCard||!left.contains(touchTapCard)){touchTapCard=null;return;}
 touchTapX=touch.clientX;touchTapY=touch.clientY;
},{capture:true,passive:true});
left.addEventListener('touchend',event=>{
 const touch=event.changedTouches&&event.changedTouches[0];
 const card=touchTapCard;
 touchTapCard=null;
 if(!touch||!card||!card.isConnected)return;
 if(Math.hypot(touch.clientX-touchTapX,touch.clientY-touchTapY)>=8)return;
 const symbol=String(card.dataset.symbol||'').trim().toUpperCase();
 if(!symbol)return;
 lastTouchSelection={symbol,time:Date.now()};
 selectMarketSymbol(symbol);
},{capture:true,passive:true});
left.addEventListener('touchcancel',()=>{
 touchTapCard=null;
},{capture:true,passive:true});
function drawCardChart(d){
 const canvas=d.dom.chart,ctx=canvas&&canvas.getContext('2d');
 if(!ctx||!d.candles.length)return;
 const rect=canvas.getBoundingClientRect(),w=Math.max(1,canvas.clientWidth||canvas.offsetWidth||rect.width),h=Math.max(1,canvas.clientHeight||canvas.offsetHeight||rect.height),ratio=Math.min(2,window.devicePixelRatio||1);
 const width=Math.round(w*ratio),height=Math.round(h*ratio);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const candles=d.candles.slice(-60),lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high)),span=hi-lo||Math.max(Math.abs(hi)*0.001,1e-8);
 const y=v=>h-3-(v-lo)/span*(h-6),step=w/candles.length,bodyW=Math.max(1,Math.min(4,step*.58));
 candles.forEach((c,i)=>{
  const x=i*step+step/2,up=c.close>=c.open,color=up?'#00f5a0':'#ff3b6b';
  const yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low);
  ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();
  const top=Math.min(yo,yc),bodyH=Math.max(1.2,Math.abs(yc-yo));
  ctx.fillStyle=color;ctx.fillRect(x-bodyW/2,top,bodyW,bodyH);
 });
}
/* Canvas尺寸变化时重绘，覆盖屏幕旋转及容器宽度变化但行情未刷新的情况。 */
const chartDataByCanvas=new WeakMap();
S.forEach(d=>{if(d.dom&&d.dom.chart)chartDataByCanvas.set(d.dom.chart,d);});
if('ResizeObserver' in window){
 const chartResizeObserver=new ResizeObserver(entries=>{
  entries.forEach(entry=>{const d=chartDataByCanvas.get(entry.target);if(d&&d.candles.length)drawCardChart(d);});
 });
 S.forEach(d=>{if(d.dom&&d.dom.chart)chartResizeObserver.observe(d.dom.chart);});
}
/* ResizeObserver负责容器尺寸变化；窗口事件只补偿DPR变化，避免同一次旋转重复绘制27张迷你图。 */
let chartWindowResizeFrame=0,lastChartDpr=Math.min(2,window.devicePixelRatio||1);
window.addEventListener('resize',()=>{
 const nextDpr=Math.min(2,window.devicePixelRatio||1);
 if(nextDpr===lastChartDpr)return;
 lastChartDpr=nextDpr;
 if(chartWindowResizeFrame)return;
 chartWindowResizeFrame=requestAnimationFrame(()=>{
  chartWindowResizeFrame=0;
  S.forEach(d=>{if(d.candles.length)drawCardChart(d);});
 });
},{passive:true});
function paint(d){
 const el=d.dom,priceEl=el.price;
 if(!d.ready||!Number.isFinite(d.p)||d.p<=0){if(priceEl.textContent!=='加载中')priceEl.textContent='加载中';if(el.pct.textContent!=='--')el.pct.textContent='--';return}
 const up=d.p>=d.o;
 el.card.classList.toggle('up',up);el.card.classList.toggle('dn',!up);el.card.style.setProperty('--mc-color',up?'#00f5a0':'#ff3b6b');
 const nextPrice=fmt(d.p);
 if(priceEl.textContent!==nextPrice)priceEl.textContent=nextPrice;
 const nextPct=(up?'+':'')+((d.p/d.o-1)*100).toFixed(2)+'%';
 if(el.pct.textContent!==nextPct)el.pct.textContent=nextPct;
}
/* 滚动行为由独立引擎负责；卡片层只提供容器和卡片节点。 */
if(typeof window.VegasMarketCardScrollInit==='function'){
 window.VegasMarketCardScrollInit(left,Array.from(left.querySelectorAll('.mc-slot')));
}else{
 console.error('[Vegas Octopus] independent scroll engine failed to load');
}
const API='https://api.bitget.com';
async function bitgetJson(path){
 const controller=new AbortController();
 const timeoutId=window.setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(API+path,{cache:'no-store',signal:controller.signal});
  if(!r.ok)throw new Error('Bitget HTTP '+r.status);
  const p=await r.json();
  if(p.code!=='00000'||!Array.isArray(p.data))throw new Error(p.msg||'Bitget response invalid');
  return p.data;
 }catch(error){
  if(error&&error.name==='AbortError')throw new Error('Bitget request timeout (12s): '+path);
  throw error;
 }finally{window.clearTimeout(timeoutId)}
}
let marketLoadInFlight=false,marketRefreshTimer=0;
/* 小卡片使用Bitget真实1H OHLC；首次取60根，后续每分钟增量合并最近3根。 */
let miniKlineInFlight=false,miniKlineNextAt=0;
async function loadMiniCandles(){
 if(document.hidden||miniKlineInFlight||Date.now()<miniKlineNextAt)return;
 miniKlineInFlight=true;miniKlineNextAt=Date.now()+60000;
 const queue=S.filter(d=>!REALITY_STOCKS.has(d.s)||(realitySymbolCache&&d.api===realitySymbolCache.get(d.s)));
 let cursor=0;
 async function worker(){
  while(cursor<queue.length){
   const d=queue[cursor++];
   const symbol=String(d.api||'').toUpperCase();
   if(!symbol)continue;
   const category=REALITY_STOCKS.has(d.s)?'SPOT':'USDT-FUTURES';
   const limit=d.candles.length?'3':'60';
   const path='/api/v3/market/candles?category='+category+'&symbol='+encodeURIComponent(symbol)+'&interval=1H&limit='+limit;
   try{
    const rows=await bitgetJson(path);
    const incoming=rows.map(row=>({time:Number(row[0]),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4])}))
     .filter(c=>Number.isFinite(c.time)&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));
    if(!incoming.length)continue;
    const merged=new Map(d.candles.map(c=>[c.time,c]));
    incoming.forEach(c=>merged.set(c.time,c));
    const next=[...merged.values()].sort((a,b)=>a.time-b.time).slice(-60);
    const changed=next.length!==d.candles.length||next.some((c,i)=>{const p=d.candles[i];return !p||p.time!==c.time||p.open!==c.open||p.high!==c.high||p.low!==c.low||p.close!==c.close;});
    if(changed){d.candles=next;drawCardChart(d);}
   }catch(error){console.warn('[Vegas Octopus] mini K-line failed:',d.s,error);}
  }
 }
 try{await Promise.all(Array.from({length:5},()=>worker()));}
 finally{miniKlineInFlight=false;}
}

let realitySymbolCache=null,realitySymbolCacheAt=0;
let realityDirectoryPromise=null;
function loadRealitySymbolDirectory(){
 if(realitySymbolCache&&Date.now()-realitySymbolCacheAt<5*60*1000)return Promise.resolve(realitySymbolCache);
 if(realityDirectoryPromise)return realityDirectoryPromise;
 realityDirectoryPromise=bitgetJson('/api/v3/reality/market/stock-info').then(data=>{
  const map=new Map(data.filter(s=>s&&s.code&&s.symbol).map(s=>[String(s.code).toUpperCase(),String(s.symbol)]));
  const sk=data.find(s=>s&&s.symbol&&(String(s.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'')==='SKHY'||/SK\s*HYNIX/i.test(String(s.name||''))||/RSKHYUSDT/i.test(String(s.symbol||''))));
  if(sk)map.set('SKHYNIX',String(sk.symbol));
  realitySymbolCache=map;realitySymbolCacheAt=Date.now();
  return map;
 }).finally(()=>{realityDirectoryPromise=null;});
 return realityDirectoryPromise;
}
window.VegasGetRealityStockMap=loadRealitySymbolDirectory;
function scheduleMarketRefresh(){
 if(marketRefreshTimer){clearTimeout(marketRefreshTimer);marketRefreshTimer=0;}
 if(document.hidden)return;
 marketRefreshTimer=setTimeout(async()=>{
  marketRefreshTimer=0;
  await loadMarketData();
  scheduleMarketRefresh();
 },15000);
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  if(marketRefreshTimer){clearTimeout(marketRefreshTimer);marketRefreshTimer=0;}
 }else{
  loadMarketData();
  scheduleMarketRefresh();
 }
},{passive:true});
async function loadMarketData(){
 if(document.hidden||marketLoadInFlight)return;
 marketLoadInFlight=true;
 const needRealityDirectory=!realitySymbolCache||Date.now()-realitySymbolCacheAt>5*60*1000;
 let futures=null,spots=null,realitySymbols=realitySymbolCache;
 let futuresDone=false,spotsDone=false,directoryDone=!needRealityDirectory,stocksProcessed=false;
 function processFutures(){
  if(!futuresDone)return;
  S.forEach(d=>{
   if(REALITY_STOCKS.has(d.s))return;
   if(!futures){if(!d.ready)d.dom.price.textContent='行情暂不可用';return}
   const ticker=futures.get(d.api.toUpperCase());
   if(!ticker){if(!d.ready)d.dom.price.textContent='暂无行情';return}
   const last=Number(ticker.lastPr),open=Number(ticker.open24h);
   if(!(last>0&&open>0)){if(!d.ready)d.dom.price.textContent='数据无效';return}
   d.p=last;d.o=open;d.ready=true;paint(d);
  });
 }
 function processStocks(){
  if(stocksProcessed||!spotsDone||!directoryDone)return;
  stocksProcessed=true;
  S.forEach(d=>{
   if(!REALITY_STOCKS.has(d.s))return;
   if(!spots||!realitySymbols){if(!d.ready)d.dom.price.textContent='行情暂不可用';return}
   const symbol=realitySymbols.get(d.s),ticker=symbol&&spots.get(symbol.toUpperCase());
   if(symbol){d.api=symbol;}
   if(!ticker){if(!d.ready)d.dom.price.textContent='暂无行情';return}
   const last=Number(ticker.lastPrice),open=Number(ticker.openPrice24h);
   if(!(last>0&&open>0)){if(!d.ready)d.dom.price.textContent='数据无效';return}
   d.api=symbol;d.p=last;d.o=open;d.ready=true;paint(d);
  });
 }
 try{
  const tasks=[
   bitgetJson('/api/v2/mix/market/tickers?productType=USDT-FUTURES').then(data=>{
    futures=new Map(data.map(t=>[String(t.symbol).toUpperCase(),t]));futuresDone=true;processFutures();
   }).catch(error=>{
    futuresDone=true;processFutures();console.warn('[Vegas Octopus] futures feed failed:',error);
   }),
   bitgetJson('/api/v3/market/tickers?category=SPOT').then(data=>{
    spots=new Map(data.map(t=>[String(t.symbol).toUpperCase(),t]));spotsDone=true;processStocks();
   }).catch(error=>{
    spotsDone=true;processStocks();console.warn('[Vegas Octopus] spot feed failed:',error);
   })
  ];
  if(needRealityDirectory){
   tasks.push(loadRealitySymbolDirectory().then(map=>{
    realitySymbols=map;
   }).catch(error=>{
    console.warn('[Vegas Octopus] stock directory failed:',error);
   }).finally(()=>{
    directoryDone=true;processStocks();
   }));
  }else{
   directoryDone=true;processStocks();
  }
  await Promise.allSettled(tasks);
  await loadMiniCandles();
 }finally{
  marketLoadInFlight=false;
 }
}
/* html/body 已使用 touch-action:manipulation，交由浏览器原生手势处理。
   不再全局取消第二次 touchend，避免误吞品种卡片的点击。 */
let lastFormalSignature=null;
window.VegasApplyFormalSignals=function(){
 const symbols=[...new Set((window.VegasFormalSignalSymbols||[]).map(s=>String(s||'').trim().toUpperCase()).filter(Boolean))];
 const signature=symbols.join('|');
 if(signature===lastFormalSignature)return;
 lastFormalSignature=signature;
 const formal=new Set(symbols);
 left.querySelectorAll('.mc-card[data-symbol]').forEach(card=>{
  const active=formal.has(String(card.dataset.symbol||'').toUpperCase());
  if(active){if(card.getAttribute('data-formal-signal')!=='true')card.setAttribute('data-formal-signal','true');}
  else if(card.hasAttribute('data-formal-signal'))card.removeAttribute('data-formal-signal');
 });
 if(typeof window.VegasLayer5SetAutoQueue==='function')window.VegasLayer5SetAutoQueue(symbols);
};
window.VegasApplyFormalSignals();
loadMarketData();scheduleMarketRefresh();
document.querySelectorAll('#market-cards-layer .mc-slot').forEach(el=>{
 const c=el.querySelector('.mc-card');
 let pointerFrame=0,pendingX=0,pendingY=0,hasPending=false;
 const off=()=>{hasPending=false;if(pointerFrame){cancelAnimationFrame(pointerFrame);pointerFrame=0}c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')};
 const applyPointer=()=>{pointerFrame=0;if(!hasPending)return;hasPending=false;const r=el.getBoundingClientRect(),x=(pendingX-r.left)/Math.max(1,r.width),y=(pendingY-r.top)/Math.max(1,r.height);c.style.setProperty('--ry',((x-.5)*24)+'deg');c.style.setProperty('--rx',((.5-y)*20)+'deg')};
 el.addEventListener('pointermove',e=>{pendingX=e.clientX;pendingY=e.clientY;hasPending=true;if(!pointerFrame)pointerFrame=requestAnimationFrame(applyPointer)},{passive:true});
 ['pointerleave','pointerup','pointercancel'].forEach(t=>el.addEventListener(t,off,{passive:true}));
});
})();
