/* 第三层：27 张品种行情卡片、滚动聚焦和行情刷新。 */
(()=>{
const P=[
 ["AAPL","AAPLUSDT"],["MSFT","MSFTUSDT"],["GOOGL","GOOGLUSDT"],["AMZN","AMZNUSDT"],["NVDA","NVDAUSDT"],["TSLA","TSLAUSDT"],["META","METAUSDT"],["INTC","INTCUSDT"],["QCOM","QCOMUSDT"],["AMD","AMDUSDT"],["TSM","TSMUSDT"],["AVGO","AVGOUSDT"],["ORCL","ORCLUSDT"],["ARM","ARMUSDT"],["MU","MUUSDT"],["ASML","ASMLUSDT"],["SNDK","SNDKUSDT"],["SKHYNIX","SKHYNIXUSDT"],["MRVL","MRVLUSDT"],["GLW","GLWUSDT"],["HOOD","HOODUSDT"],["CBRS","CBRSUSDT"],["SPCX","SPCXUSDT"],["BTC","BTCUSDT"],["HYPE","HYPEUSDT"],["XAU","XAUUSDT"],["CL","CLUSDT"]
];
const REALITY_STOCKS=new Set(P.slice(0,23).map(x=>x[0]));
const fmt=p=>p>=100?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(3):p.toFixed(4);
const S=P.map(([s,api],i)=>({s,api,i,p:0,o:0,flashTimer:0,ready:false}));
const left=document.getElementById('mc-left');
if(!left){console.warn('[Vegas Octopus] market-card root #mc-left is missing; layer 3 initialization skipped.');return;}
S.forEach(d=>{
 left.insertAdjacentHTML('beforeend',`<div class="mc-slot"><div class="mc-float" style="--d:${-d.i*.9}s"><div class="mc-card" id="mc-c${d.i}" data-symbol="${d.s}"><div class="mc-bg"></div><i class="mc-g1"></i><i class="mc-g2"></i><i class="mc-gl"></i><div class="mc-row mc-l2"><span class="mc-coin">${d.s[0]}</span><b class="mc-sym">${d.s}</b></div><div class="mc-price mc-l4">加载中</div><div class="mc-l3"><span class="mc-pct">--</span></div></div></div><div class="mc-gshadow" style="--d:${-d.i*.9}s"></div></div>`);
 const card=left.lastElementChild?.querySelector('.mc-card');
 if(!card){console.warn('[Vegas Octopus] market card DOM creation failed:',d.s);return;}
 d.dom={card,price:card.querySelector('.mc-price'),pct:card.querySelector('.mc-pct'),symbol:card.querySelector('.mc-sym')};

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
function paint(d){
 const el=d.dom,priceEl=el.price;
 if(!d.ready||!Number.isFinite(d.p)||d.p<=0){if(priceEl.textContent!=='加载中')priceEl.textContent='加载中';if(el.pct.textContent!=='--')el.pct.textContent='--';return}
 const up=d.p>=d.o;
 el.card.classList.toggle('up',up);el.card.classList.toggle('dn',!up);
 const nextPrice=fmt(d.p);
 if(priceEl.textContent!==nextPrice){
  if(priceEl.textContent!=='加载中'){priceEl.classList.add('flash');if(d.flashTimer)window.clearTimeout(d.flashTimer);d.flashTimer=window.setTimeout(()=>{priceEl.classList.remove('flash');d.flashTimer=0},250)}
  priceEl.textContent=nextPrice;
 }
 const nextPct=(up?'+':'')+((d.p/d.o-1)*100).toFixed(2)+'%';
 if(el.pct.textContent!==nextPct)el.pct.textContent=nextPct;
 
}
/* 统一滚动控制器：自动、滚轮、触屏共用唯一位移与循环校正入口。
   卡片 DOM、悬浮层结构、尺寸和视觉样式保持不变。 */
let cachedCardStep=0;
function cardStep(){
 if(cachedCardStep>0)return cachedCardStep;
 const first=left.firstElementChild,second=first?.nextElementSibling;
 if(!first||!second)return 0;
 cachedCardStep=Math.max(0,second.offsetTop-first.offsetTop);
 return cachedCardStep;
}
let focusSlots=Array.from(left.querySelectorAll('.mc-slot'));
let focusFrame=0;
const focusStyleCache=new WeakMap();
function updateFocusScale(){
 focusFrame=0;
 const height=left.clientHeight,scrollTop=left.scrollTop,center=scrollTop+height/2,range=Math.max(1,height*.58),fadeRange=Math.max(1,height*.50),available=Math.max(1,left.clientWidth-8);
 const first=focusSlots[0],step=cardStep();
 if(!first||!step)return;
 const baseTop=first.offsetTop,slotHeight=first.offsetHeight,slotWidth=Math.max(1,first.offsetWidth),visibleBottom=scrollTop+height;
 const scaleMax=Math.min(1.34,available/slotWidth);
 for(let index=0;index<focusSlots.length;index++){
  const slot=focusSlots[index],top=baseTop+index*step,bottom=top+slotHeight,distance=Math.abs((top+slotHeight/2)-center),t=Math.min(1,distance/range),ease=t*t*(3-2*t),fadeT=Math.min(1,distance/fadeRange),fadeEase=fadeT*fadeT*(3-2*fadeT);
  const visible=Math.max(0,Math.min(bottom,visibleBottom)-Math.max(top,scrollTop)),ratio=Math.min(1,visible/Math.max(1,slotHeight)),focused=distance<height*.23&&ratio>=.98;
  const scale=1+(scaleMax-1)*(1-ease),opacity=focused?1:(1-.72*fadeEase)*Math.min(1,ratio*1.8);
  const scaleText=scale.toFixed(3),opacityText=Math.max(.025,opacity).toFixed(3);
  let previous=focusStyleCache.get(slot);
  if(!previous){previous={scale:'',opacity:''};focusStyleCache.set(slot,previous)}
  if(previous.scale!==scaleText){slot.style.setProperty('--mc-focus-scale',scaleText);previous.scale=scaleText}
  if(previous.opacity!==opacityText){slot.style.setProperty('--mc-page-opacity',opacityText);previous.opacity=opacityText}
 }
}
function queueFocusScale(){if(!focusFrame)focusFrame=requestAnimationFrame(updateFocusScale)}
let manualTarget=left.scrollTop,manualVelocity=0,manualFrame=0,manualLastTime=0;
let autoResumeAt=0,touchActive=false,touchDragging=false,touchStartY=0,touchLastY=0,touchLastTime=0,touchVelocity=0;
let autoLastTime=0,autoEngageLastTime=0,autoEngage=1,autoRemainder=0;
let autoFrame=0,autoTimer=0,loopDirection=1,lastObservedScrollTop=left.scrollTop;
let normalizing=false;
function normalizeLoopPosition(direction){
 if(normalizing||focusSlots.length<2)return 0;
 const step=cardStep();if(step<1)return 0;
 normalizing=true;
 let top=left.scrollTop,shift=0,guard=0;
 if(direction<0){
  while(top<=0&&guard++<focusSlots.length){
   const last=focusSlots.pop();left.insertBefore(last,left.firstElementChild);focusSlots.unshift(last);
   top+=step;shift+=step;
  }
 }else{
  while(top>=step&&guard++<focusSlots.length){
   const first=focusSlots.shift();left.appendChild(first);focusSlots.push(first);
   top-=step;shift-=step;
  }
 }
 if(Math.abs(top-left.scrollTop)>.1)left.scrollTop=top;
 if(manualFrame&&shift)manualTarget+=shift;
 lastObservedScrollTop=left.scrollTop;
 normalizing=false;
 return shift;
}
function moveLoop(delta,direction,source){
 if(!Number.isFinite(delta)||Math.abs(delta)<.01)return;
 loopDirection=direction<0?-1:1;
 left.scrollTop+=delta;
 normalizeLoopPosition(loopDirection);
 if(source==='manual')manualTarget=left.scrollTop;
 lastObservedScrollTop=left.scrollTop;
 queueFocusScale();
}
function scheduleAutoScroll(){
 if(document.hidden||autoFrame||autoTimer)return;
 autoTimer=window.setTimeout(()=>{
  autoTimer=0;
  if(!document.hidden)autoFrame=requestAnimationFrame(runAutoScroll);
 },50);
}
function runAutoScroll(now){
 autoFrame=0;
 try{
  if(!autoLastTime)autoLastTime=now;
  const dt=Math.min(40,Math.max(0,now-autoLastTime))/1000;autoLastTime=now;
  if(!autoEngageLastTime)autoEngageLastTime=now;
  const engageDt=Math.min(40,Math.max(0,now-autoEngageLastTime));autoEngageLastTime=now;
  if(!manualFrame&&!touchActive&&now>=autoResumeAt){
   autoEngage=Math.min(1,autoEngage+engageDt/1000);
   const step=cardStep();
   if(focusSlots.length>1&&step>0){
    const speed=Math.max(.1,step*focusSlots.length/120);
    autoRemainder+=speed*autoEngage*dt;
    const movement=Math.floor(autoRemainder);
    if(movement>=1){autoRemainder-=movement;moveLoop(movement,1,'auto')}
   }
  }
 }catch(error){console.warn('[Vegas Octopus] unified auto-scroll recovered:',error)}
 finally{scheduleAutoScroll()}
}
function pauseAutoScroll(){
 if(autoFrame){cancelAnimationFrame(autoFrame);autoFrame=0}
 if(autoTimer){clearTimeout(autoTimer);autoTimer=0}
 autoLastTime=0;autoEngageLastTime=0;
}
function applyManualDelta(delta,source){
 if(Math.abs(delta)<.1)return;
 const now=performance.now();
 autoResumeAt=now+(source==='touch'?1600:180);
 autoEngage=Math.min(autoEngage,.28);autoEngageLastTime=now;
 const direction=delta<0?-1:1;
 if(!manualFrame){manualTarget=left.scrollTop;manualVelocity=0;manualLastTime=0}
 const reversing=manualVelocity!==0&&Math.sign(manualVelocity)!==Math.sign(delta);
 if(source==='touch'){
  manualTarget+=delta;
  manualVelocity=Math.max(-1.2,Math.min(1.2,manualVelocity+delta*.018));
 }else if(reversing){
  manualTarget=left.scrollTop+delta*1.12;manualVelocity=delta*.018;
 }else{
  manualTarget+=delta*1.28;manualVelocity=Math.max(-1.2,Math.min(1.2,manualVelocity+delta*.022));
 }
 loopDirection=direction;
 if(!manualFrame)manualFrame=requestAnimationFrame(runManualScroll);
}
function runManualScroll(now){
 try{
  if(!manualLastTime)manualLastTime=now;
  const dt=Math.min(32,Math.max(1,now-manualLastTime));manualLastTime=now;
  const current=left.scrollTop,diff=manualTarget-current,ease=1-Math.exp(-dt/30);
  moveLoop(diff*ease,Math.sign(diff)||loopDirection,'manual');
  manualVelocity*=Math.exp(-dt/180);
  if(!touchActive&&Math.abs(manualVelocity)>.008)manualTarget+=manualVelocity*dt;
  else if(Math.abs(manualVelocity)<=.008)manualVelocity=0;
  if(Math.abs(manualVelocity)<.025&&Math.abs(manualTarget-left.scrollTop)<.5){
   manualTarget=left.scrollTop;manualVelocity=0;manualFrame=0;manualLastTime=0;
   autoResumeAt=Math.max(autoResumeAt,now+(touchActive?1400:80));
   return;
  }
  manualFrame=requestAnimationFrame(runManualScroll);
 }catch(error){
  manualTarget=left.scrollTop;manualVelocity=0;manualFrame=0;manualLastTime=0;
  autoResumeAt=performance.now()+120;
  console.warn('[Vegas Octopus] manual-scroll frame recovered:',error);
  queueFocusScale();
 }
}
left.addEventListener('wheel',e=>{
 if(Math.abs(e.deltaY)<.1)return;
 e.preventDefault();e.stopPropagation();
 const unit=e.deltaMode===1?16:e.deltaMode===2?left.clientHeight:1;
 applyManualDelta(e.deltaY*unit,'wheel');
},{passive:false});
left.addEventListener('scroll',()=>{
 if(normalizing)return;
 const current=left.scrollTop,delta=current-lastObservedScrollTop;
 if(!manualFrame&&!touchActive&&Math.abs(delta)>.5){
  loopDirection=delta<0?-1:1;
  normalizeLoopPosition(loopDirection);
  manualTarget=left.scrollTop;manualVelocity=0;
 }
 lastObservedScrollTop=left.scrollTop;
 queueFocusScale();
},{passive:true});
/* 触摸拖动直接映射手指位移；松手后独立执行高质量惯性衰减。 */
function runTouchInertia(now){
 try{
  if(!manualLastTime)manualLastTime=now;
  const dt=Math.min(32,Math.max(1,now-manualLastTime));manualLastTime=now;
  moveLoop(touchVelocity*dt,Math.sign(touchVelocity)||loopDirection,'manual');
  touchVelocity*=Math.exp(-dt/520);
  if(Math.abs(touchVelocity)<.025){
   touchVelocity=0;manualFrame=0;manualLastTime=0;manualTarget=left.scrollTop;
   autoResumeAt=Math.max(autoResumeAt,now+100);
   return;
  }
  manualFrame=requestAnimationFrame(runTouchInertia);
 }catch(error){
  touchVelocity=0;manualFrame=0;manualLastTime=0;manualTarget=left.scrollTop;
  autoResumeAt=performance.now()+120;
  console.warn('[Vegas Octopus] touch inertia recovered:',error);
  queueFocusScale();
 }
}
left.addEventListener('touchstart',e=>{
 const touch=e.touches[0];if(!touch)return;
 if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
 manualLastTime=0;manualVelocity=0;touchVelocity=0;
 touchStartY=touchLastY=touch.clientY;touchLastTime=performance.now();
 touchActive=true;touchDragging=false;
 manualTarget=left.scrollTop;autoResumeAt=performance.now()+1600;autoEngage=0;
},{passive:true});
left.addEventListener('touchmove',e=>{
 const touch=e.touches[0];if(!touch||!touchActive)return;
 const now=performance.now(),y=touch.clientY,delta=touchLastY-y,dt=Math.max(1,now-touchLastTime);
 if(!touchDragging&&Math.abs(y-touchStartY)<3){touchLastY=y;touchLastTime=now;return}
 touchDragging=true;e.preventDefault();
 if(Math.abs(delta)>.05){
  /* 拖动阶段不做追赶缓动：一帧内完成与手指等量位移。 */
  moveLoop(delta,Math.sign(delta),'manual');
  const instant=Math.max(-3.6,Math.min(3.6,delta/dt));
  touchVelocity=Math.max(-3.6,Math.min(3.6,touchVelocity*.35+instant*.65));
  manualTarget=left.scrollTop;
  autoResumeAt=now+1600;autoEngage=Math.min(autoEngage,.0);
 }
 touchLastY=y;touchLastTime=now;
},{passive:false});
function finishTouch(cancelled){
 touchActive=false;touchDragging=false;touchStartY=touchLastY=0;touchLastTime=0;
 if(!cancelled&&Math.abs(touchVelocity)>.035){
  /* 适度放大释放速度，520ms时间常数带来更长、更连贯的滑行。 */
  touchVelocity=Math.max(-3.6,Math.min(3.6,touchVelocity*1.25));
  manualLastTime=0;
  if(!manualFrame)manualFrame=requestAnimationFrame(runTouchInertia);
 }else touchVelocity=0;
 autoResumeAt=performance.now()+1400;
}
left.addEventListener('touchend',()=>finishTouch(false),{passive:true});
left.addEventListener('touchcancel',()=>finishTouch(true),{passive:true});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  pauseAutoScroll();
  if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
  manualLastTime=0;manualVelocity=0;manualTarget=left.scrollTop;
 }else{
  autoLastTime=0;autoEngageLastTime=0;autoResumeAt=performance.now()+250;
  scheduleAutoScroll();
 }
},{passive:true});
window.addEventListener('resize',()=>{
 cachedCardStep=0;queueFocusScale();
},{passive:true});
left.style.scrollBehavior='auto';
if('ResizeObserver' in window){
 const stepObserver=new ResizeObserver(()=>{cachedCardStep=0;queueFocusScale()});
 stepObserver.observe(left);
 if(left.firstElementChild)stepObserver.observe(left.firstElementChild);
}
queueFocusScale();
scheduleAutoScroll();
/* 统一控制器已完成尺寸监听与焦点初始化。 */
/* 只让视口附近的卡片运行浮动与阴影动画，减少平板 GPU 合成开销。 */
if('IntersectionObserver' in window){
 const cardMotionObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>entry.target.classList.toggle('mc-in-view',entry.isIntersecting));
 },{root:left,threshold:0.01});
 focusSlots.forEach(slot=>cardMotionObserver.observe(slot));
}else{
 focusSlots.forEach(slot=>slot.classList.add('mc-in-view'));
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
