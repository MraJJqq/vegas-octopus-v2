/* 第三层：27 张品种行情卡片、滚动聚焦和行情刷新。 */
(()=>{
const P=[
 ["AAPL","AAPLUSDT"],["MSFT","MSFTUSDT"],["GOOGL","GOOGLUSDT"],["AMZN","AMZNUSDT"],["NVDA","NVDAUSDT"],["TSLA","TSLAUSDT"],["META","METAUSDT"],["INTC","INTCUSDT"],["QCOM","QCOMUSDT"],["AMD","AMDUSDT"],["TSM","TSMUSDT"],["AVGO","AVGOUSDT"],["ORCL","ORCLUSDT"],["ARM","ARMUSDT"],["MU","MUUSDT"],["ASML","ASMLUSDT"],["SNDK","SNDKUSDT"],["SKHYNIX","SKHYNIXUSDT"],["MRVL","MRVLUSDT"],["GLW","GLWUSDT"],["HOOD","HOODUSDT"],["CBRS","CBRSUSDT"],["SPCX","SPCXUSDT"],["BTC","BTCUSDT"],["HYPE","HYPEUSDT"],["XAU","XAUUSDT"],["CL","CLUSDT"]
];
const REALITY_STOCKS=new Set(P.slice(0,23).map(x=>x[0]));
const fmt=p=>p>=100?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(3):p.toFixed(4);
const S=P.map(([s,api],i)=>({s,api,i,p:0,o:0,ready:false,history:[]}));
const left=document.getElementById('mc-left');
if(!left){console.warn('[Vegas Octopus] market-card root #mc-left is missing; layer 3 initialization skipped.');return;}
S.forEach(d=>{
 left.insertAdjacentHTML('beforeend',`<div class="mc-slot"><div class="mc-float" style="--d:${-d.i*.9}s"><div class="mc-card" id="mc-c${d.i}" data-symbol="${d.s}"><div class="mc-bg"></div><i class="mc-g1"></i><i class="mc-g2"></i><i class="mc-gl"></i><div class="mc-card-head mc-l2"><span class="mc-coin">${d.s[0]}</span><b class="mc-sym">${d.s}</b><span class="mc-pct mc-l3">--</span></div><div class="mc-card-market"><div class="mc-price mc-l4">加载中</div><canvas class="mc-chart" aria-hidden="true"></canvas></div><span class="mc-card-tag">LIVE MARKET</span></div></div><div class="mc-gshadow" style="--d:${-d.i*.9}s"></div></div>`);
 const card=left.lastElementChild?.querySelector('.mc-card');
 if(!card){console.warn('[Vegas Octopus] market card DOM creation failed:',d.s);return;}
 d.dom={card,price:card.querySelector('.mc-price'),pct:card.querySelector('.mc-pct'),chart:card.querySelector('.mc-chart')};

});
/* 在卡片DOM创建后立即绑定委托点击，不等待行情请求完成。 */
left.addEventListener('click',event=>{
 const card=event.target.closest('.mc-card[data-symbol]');
 if(!card||!left.contains(card))return;
 const symbol=String(card.dataset.symbol||'').trim().toUpperCase();
 if(!symbol)return;
 if(typeof window.VegasLayer5ShowSymbol==='function')window.VegasLayer5ShowSymbol(symbol);
 else window.__VEGAS_PENDING_LAYER5_SYMBOL=symbol;
});
function drawCardChart(d){
 const canvas=d.dom.chart,ctx=canvas&&canvas.getContext('2d');
 if(!ctx||!d.history.length)return;
 const rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),ratio=Math.min(2,window.devicePixelRatio||1);
 const width=Math.round(w*ratio),height=Math.round(h*ratio);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const values=d.history,mn=Math.min(...values),mx=Math.max(...values),span=mx-mn||1;
 const pts=values.map((v,i)=>[values.length===1?w:i/(values.length-1)*w,h-3-(v-mn)/span*(h-6)]);
 const color=d.p>=d.o?'#00f5a0':'#ff3b6b';
 const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,color+'55');gradient.addColorStop(1,color+'00');
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
 ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
 ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.lineJoin='round';ctx.shadowColor=color;ctx.shadowBlur=4;ctx.stroke();ctx.shadowBlur=0;
}
function paint(d){
 const el=d.dom,priceEl=el.price;
 if(!d.ready||!Number.isFinite(d.p)||d.p<=0){if(priceEl.textContent!=='加载中')priceEl.textContent='加载中';if(el.pct.textContent!=='--')el.pct.textContent='--';return}
 const up=d.p>=d.o;
 el.card.classList.toggle('up',up);el.card.classList.toggle('dn',!up);
 const nextPrice=fmt(d.p);
 if(priceEl.textContent!==nextPrice)priceEl.textContent=nextPrice;
 const nextPct=(up?'+':'')+((d.p/d.o-1)*100).toFixed(2)+'%';
 if(el.pct.textContent!==nextPct)el.pct.textContent=nextPct;
 const previous=d.history[d.history.length-1];
 if(!Number.isFinite(previous)||previous!==d.p){d.history.push(d.p);if(d.history.length>60)d.history.shift();}
 drawCardChart(d);
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
 const off=()=>{hasPending=false;if(pointerFrame){cancelAnimationFrame(pointerFrame);pointerFrame=0}c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg');c.classList.remove('hot')};
 const applyPointer=()=>{pointerFrame=0;if(!hasPending)return;hasPending=false;const r=el.getBoundingClientRect(),x=(pendingX-r.left)/Math.max(1,r.width),y=(pendingY-r.top)/Math.max(1,r.height);c.style.setProperty('--ry',((x-.5)*24)+'deg');c.style.setProperty('--rx',((.5-y)*20)+'deg');c.style.setProperty('--mx',x*100+'%');c.style.setProperty('--my',y*100+'%');c.classList.add('hot')};
 el.addEventListener('pointermove',e=>{pendingX=e.clientX;pendingY=e.clientY;hasPending=true;if(!pointerFrame)pointerFrame=requestAnimationFrame(applyPointer)},{passive:true});
 ['pointerleave','pointerup','pointercancel'].forEach(t=>el.addEventListener(t,off,{passive:true}));
});
})();
