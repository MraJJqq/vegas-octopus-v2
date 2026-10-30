/* 第三层：27 张品种行情卡片、滚动聚焦和行情刷新。 */
(()=>{
const P=[
 ["AAPL","AAPLUSDT"],["MSFT","MSFTUSDT"],["GOOGL","GOOGLUSDT"],["AMZN","AMZNUSDT"],["NVDA","NVDAUSDT"],["TSLA","TSLAUSDT"],["META","METAUSDT"],["INTC","INTCUSDT"],["QCOM","QCOMUSDT"],["AMD","AMDUSDT"],["TSM","TSMUSDT"],["AVGO","AVGOUSDT"],["ORCL","ORCLUSDT"],["ARM","ARMUSDT"],["MU","MUUSDT"],["ASML","ASMLUSDT"],["SNDK","SNDKUSDT"],["SKHYNIX","SKHYNIXUSDT"],["MRVL","MRVLUSDT"],["GLW","GLWUSDT"],["HOOD","HOODUSDT"],["CBRS","CBRSUSDT"],["SPCX","SPCXUSDT"],["BTC","BTCUSDT"],["HYPE","HYPEUSDT"],["XAU","XAUUSDT"],["CL","CLUSDT"]
];
const REALITY_STOCKS=new Set(P.slice(0,23).map(x=>x[0]));
const fmt=p=>p>=100?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(3):p.toFixed(4);
const S=P.map(([s,api],i)=>({s,api,i,p:0,o:0,flashTimer:0,ready:false}));
const left=document.getElementById('mc-left');
S.forEach(d=>{
 left.insertAdjacentHTML('beforeend',`<div class="mc-slot"><div class="mc-float" style="--d:${-d.i*.9}s"><div class="mc-card" id="mc-c${d.i}" data-symbol="${d.s}"><div class="mc-bg"></div><i class="mc-g1"></i><i class="mc-g2"></i><i class="mc-gl"></i><div class="mc-row mc-l2"><span class="mc-coin">${d.s[0]}</span><b class="mc-sym">${d.s}</b></div><div class="mc-price mc-l4">加载中</div><div class="mc-l3"><span class="mc-pct">--</span></div></div></div><div class="mc-gshadow" style="--d:${-d.i*.9}s"></div></div>`);
 d.dom={card:left.querySelector('#mc-c'+d.i),price:left.querySelector('#mc-c'+d.i+' .mc-price'),pct:left.querySelector('#mc-c'+d.i+' .mc-pct'),symbol:left.querySelector('#mc-c'+d.i+' .mc-sym')};

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
window.addEventListener('resize',()=>{
 cachedCardStep=0;
 queueFocusScale();
},{passive:true});
let focusSlots=Array.from(left.querySelectorAll('.mc-slot'));
let focusFrame=0;
function updateFocusScale(){
 focusFrame=0;
 const height=left.clientHeight,scrollTop=left.scrollTop,center=scrollTop+height/2,range=Math.max(1,height*.58),fadeRange=Math.max(1,height*.50),available=Math.max(1,left.clientWidth-8);
 const first=focusSlots[0],step=cardStep();
 if(!first||!step){return}
 /* 卡片统一尺寸且按固定 gap 排列：只读取首卡几何信息，后续位置用步长推算，减少逐卡布局读取。 */
 const baseTop=first.offsetTop,slotHeight=first.offsetHeight,slotWidth=Math.max(1,first.offsetWidth),visibleBottom=scrollTop+height;
 const scaleMax=Math.min(1.34,available/slotWidth);
 const metrics=focusSlots.map((slot,index)=>{
  const top=baseTop+index*step,bottom=top+slotHeight,distance=Math.abs((top+slotHeight/2)-center),t=Math.min(1,distance/range),ease=t*t*(3-2*t),fadeT=Math.min(1,distance/fadeRange),fadeEase=fadeT*fadeT*(3-2*fadeT);
  const visible=Math.max(0,Math.min(bottom,visibleBottom)-Math.max(top,scrollTop)),ratio=Math.min(1,visible/Math.max(1,slotHeight)),focused=distance<height*.23&&ratio>=.98;
  return {slot,scale:1+(scaleMax-1)*(1-ease),opacity:focused?1:(1-.72*fadeEase)*Math.min(1,ratio*1.8)};
 });
 metrics.forEach(({slot,scale,opacity})=>{
  slot.style.setProperty('--mc-focus-scale',scale.toFixed(3));
  slot.style.setProperty('--mc-page-opacity',Math.max(.025,opacity).toFixed(3));
 });
}
function queueFocusScale(){if(!focusFrame)focusFrame=requestAnimationFrame(updateFocusScale)}
let wheelTarget=left.scrollTop,wheelFrame=0,wheelVelocity=0,wheelLastTime=0,loopDirection=1,autoEngage=1;
let cachedCardStep=0;
function cardStep(){
 if(cachedCardStep>0)return cachedCardStep;
 const first=left.firstElementChild;
 const second=first?.nextElementSibling;
 if(!first||!second)return 0;
 /* 相邻卡片步长在同一视口尺寸下恒定；缓存布局读取，避免每帧重复触发几何计算。 */
 cachedCardStep=Math.max(0,second.offsetTop-first.offsetTop);
 return cachedCardStep;
}
let lastObservedScrollTop=left.scrollTop;
function normalizeLoopPosition(){
 if(focusSlots.length<2)return;
 const step=cardStep();
 if(step<1)return;
 let top=left.scrollTop,guard=0;
 const count=focusSlots.length;
 if(loopDirection<0){
  while(top<=0&&guard++<count){
   const last=focusSlots.pop();
   left.insertBefore(last,left.firstElementChild);
   focusSlots.unshift(last);
   top+=step;
   wheelTarget+=step;
  }
 }else{
  while(top>=step&&guard++<count){
   const first=focusSlots.shift();
   left.appendChild(first);
   focusSlots.push(first);
   top-=step;
   wheelTarget-=step;
  }
 }
 if(Math.abs(top-left.scrollTop)>.1)left.scrollTop=top;
 /* 记录校正后的实际位置，避免重排引发的 scroll 事件误判为反向滚动。 */
 lastObservedScrollTop=left.scrollTop;
}
function smoothWheelStep(now){
 try{
  if(!wheelLastTime)wheelLastTime=now;
  const dt=Math.min(32,Math.max(1,now-wheelLastTime));
  wheelLastTime=now;
  const current=left.scrollTop,diff=wheelTarget-current;
  /* 较短的追随时间常数让滚轮更跟手，同时保留连续缓动，避免目标位置拖在鼠标后面。 */
  const ease=1-Math.exp(-dt/72);
  left.scrollTop=current+diff*ease;
  normalizeLoopPosition();
  wheelVelocity*=Math.exp(-dt/180);
  if(Math.abs(wheelVelocity)>.008)wheelTarget+=wheelVelocity*dt;
  else wheelVelocity=0;
  queueFocusScale();
  if(Math.abs(wheelVelocity)<.025){
   wheelTarget=left.scrollTop;wheelVelocity=0;wheelFrame=0;wheelLastTime=0;
   autoResumeAt=touchActive?Math.max(autoResumeAt,now+1400):Math.min(autoResumeAt,now+80);
   return;
  }
  wheelFrame=requestAnimationFrame(smoothWheelStep);
 }catch(error){
  /* 任何单帧异常都必须释放 wheelFrame，否则自动滚动会被误判为仍在手动滚动。 */
  wheelTarget=left.scrollTop;
  wheelVelocity=0;
  wheelFrame=0;
  wheelLastTime=0;
  autoResumeAt=performance.now()+120;
  console.warn('[Vegas Octopus] wheel-scroll frame recovered:',error);
  queueFocusScale();
 }
}
function applyManualScrollDelta(delta,source){
 if(Math.abs(delta)<.1)return;
 const now=performance.now();
 autoResumeAt=now+(source==='touch'?1800:180);
 autoEngage=Math.min(autoEngage,source==='touch'?0:.28);
 autoEngageLastTime=now;
 loopDirection=delta<0?-1:1;
 if(!wheelFrame){wheelTarget=left.scrollTop;wheelVelocity=0;wheelLastTime=0}
 const reversing=wheelVelocity!==0&&Math.sign(wheelVelocity)!==Math.sign(delta);
 if(reversing){wheelTarget=left.scrollTop+delta*1.16;wheelVelocity=delta*.018}
 else{wheelTarget+=delta*1.32;wheelVelocity=Math.max(-1.2,Math.min(1.2,wheelVelocity+delta*.022))}
 if(!wheelFrame)wheelFrame=requestAnimationFrame(smoothWheelStep);
}
left.addEventListener('wheel',e=>{
 if(Math.abs(e.deltaY)<.1)return;
 e.preventDefault();e.stopPropagation();
 const unit=e.deltaMode===1?16:e.deltaMode===2?left.clientHeight:1;
 applyManualScrollDelta(e.deltaY*unit,'wheel');
},{passive:false});
left.addEventListener('scroll',()=>{
 const current=left.scrollTop;
 if(!wheelFrame){
  const delta=current-lastObservedScrollTop;
  /* 触屏滑动或拖动滚动条时，也使用同一套无限循环校正。 */
  if(Math.abs(delta)>.5)loopDirection=delta<0?-1:1;
  normalizeLoopPosition();
  wheelTarget=left.scrollTop;
  wheelVelocity=0;
 }
 lastObservedScrollTop=left.scrollTop;
 queueFocusScale();
},{passive:true});
let touchStartY=0,touchLastY=0,touchActive=false,touchDragging=false,autoResumeAt=0,autoLastTime=0;
left.addEventListener('touchstart',e=>{
 const touch=e.touches[0];if(!touch)return;
 if(wheelFrame)cancelAnimationFrame(wheelFrame);
 wheelFrame=0;wheelLastTime=0;wheelVelocity=0;
 touchStartY=touchLastY=touch.clientY;
 touchActive=true;touchDragging=false;wheelTarget=left.scrollTop;
 autoResumeAt=performance.now()+1800;autoEngage=0;
},{passive:true});
left.addEventListener('touchmove',e=>{
 const touch=e.touches[0];if(!touch||!touchActive)return;
 const y=touch.clientY,dy=touchLastY-y;
 if(!touchDragging&&Math.abs(y-touchStartY)<3){touchLastY=y;return}
 touchDragging=true;e.preventDefault();
 if(Math.abs(dy)>.1){
  touchLastY=y;
  /* 触摸与鼠标进入同一 delta 处理器；缩放只在共用处理器中执行一次。 */
  applyManualScrollDelta(dy,'touch');
 }else{
  touchLastY=y;
 }
},{passive:false});
const finishTouch=()=>{
 touchActive=false;touchDragging=false;touchStartY=touchLastY=0;
 autoResumeAt=performance.now()+1400;
};
left.addEventListener('touchend',finishTouch,{passive:true});
left.addEventListener('touchcancel',finishTouch,{passive:true});
let autoEngageLastTime=0,autoLoopErrorReported=false,autoScrollRemainder=0;
let autoWaveFrame=0,autoWaveTimer=0;
function scheduleAutoWave(){
 if(document.hidden||autoWaveFrame||autoWaveTimer)return;
 autoWaveTimer=window.setTimeout(()=>{autoWaveTimer=0;if(!document.hidden)autoWaveFrame=requestAnimationFrame(autoWaveScroll)},33);
}
function autoWaveScroll(now){
 /* 回调已开始执行，释放上一帧 ID，否则 finally 中的调度会被误拦截。 */
 autoWaveFrame=0;
 try{
  if(!autoLastTime)autoLastTime=now;
  const dt=Math.min(40,Math.max(0,now-autoLastTime))/1000;
  autoLastTime=now;
  if(!autoEngageLastTime)autoEngageLastTime=now;
  const engageDt=Math.min(40,Math.max(0,now-autoEngageLastTime));
  autoEngageLastTime=now;
  if(!wheelFrame&&!touchActive&&now>=autoResumeAt){
   autoEngage=Math.min(1,autoEngage+engageDt/1000);
   /* 每帧重新读取真实卡片数与布局，避免初始化/屏幕尺寸变化时沿用失效参数。 */
   if(focusSlots.length!==left.children.length)focusSlots=Array.from(left.querySelectorAll('.mc-slot'));
   const step=cardStep();
   /* 不依赖 scrollHeight/clientHeight 判断是否启动；该测量在部分布局时不可靠。 */
   if(focusSlots.length>1&&step>0){
    const speed=Math.max(.1,step*focusSlots.length/120);
    /* 累积到整像素再写入，避免移动端对小数 scrollTop 取整后每帧都丢失位移。 */
    autoScrollRemainder+=speed*autoEngage*dt;
    const movement=Math.floor(autoScrollRemainder);
    if(movement>=1){
     autoScrollRemainder-=movement;
     loopDirection=1;
     const before=left.scrollTop;
     left.scrollTop=before+movement;
     normalizeLoopPosition();
     wheelTarget=left.scrollTop;
     if(Math.abs(left.scrollTop-before)>.01)queueFocusScale();
    }
   }
  }
 }catch(error){
  if(!autoLoopErrorReported){
   autoLoopErrorReported=true;
   console.warn('[Vegas Octopus] auto-scroll frame recovered:',error);
  }
 }finally{
  scheduleAutoWave();
 }
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  if(autoWaveFrame)cancelAnimationFrame(autoWaveFrame);
  if(autoWaveTimer)clearTimeout(autoWaveTimer);
  autoWaveFrame=0;autoWaveTimer=0;
 }else{
  autoLastTime=0;
  autoEngageLastTime=0;
  autoResumeAt=performance.now()+250;
  scheduleAutoWave();
 }
},{passive:true});
scheduleAutoWave();

/* 自动滚动看门狗：页面隐藏时彻底停止定时器，回到前台后再恢复。 */
let autoWatchPosition=left.scrollTop,autoWatchChangedAt=performance.now(),autoWatchTimer=0;
function startAutoWatch(){
 if(autoWatchTimer||document.hidden)return;
 autoWatchTimer=window.setInterval(()=>{
  try{
   const now=performance.now(),position=left.scrollTop;
   if(Math.abs(position-autoWatchPosition)>.05){
    autoWatchPosition=position;
    autoWatchChangedAt=now;
    return;
   }
   if(wheelFrame||now<autoResumeAt)return;
   if(now-autoWatchChangedAt<1600)return;
   const step=cardStep();
   if(focusSlots.length<2||step<1)return;
   loopDirection=1;
   left.scrollTop=position+1;
   normalizeLoopPosition();
   wheelTarget=left.scrollTop;
   queueFocusScale();
   autoWatchPosition=left.scrollTop;
   autoWatchChangedAt=now;
  }catch(error){
   console.warn('[Vegas Octopus] auto-scroll watchdog recovered:',error);
  }
 },1000);
}
function stopAutoWatch(){
 if(autoWatchTimer){clearInterval(autoWatchTimer);autoWatchTimer=0;}
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)stopAutoWatch();
 else{
  autoWatchPosition=left.scrollTop;
  autoWatchChangedAt=performance.now();
  startAutoWatch();
 }
},{passive:true});
startAutoWatch();

/* resize 主监听器已统一负责缓存失效、K线重绘与焦点缩放刷新。 */
left.style.scrollBehavior='auto';
/* 容器/卡片尺寸变化时使步长缓存失效，兼顾旋转屏幕和响应式布局。 */
if('ResizeObserver' in window){
 const stepObserver=new ResizeObserver(()=>{
  cachedCardStep=0;
  queueFocusScale();
});
 stepObserver.observe(left);
 if(left.firstElementChild)stepObserver.observe(left.firstElementChild);
}
queueFocusScale();
/* 只让视口附近的卡片运行浮动与阴影动画，减少平板 GPU 合成开销。 */
if('IntersectionObserver' in window){
 const cardMotionObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>entry.target.classList.toggle('mc-in-view',entry.isIntersecting));
 },{root:left,threshold:0.01});
 focusSlots.forEach(slot=>cardMotionObserver.observe(slot));
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
   if(!futures){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='行情暂不可用';return}
   const ticker=futures.get(d.api.toUpperCase());
   if(!ticker){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='暂无行情';return}
   const last=Number(ticker.lastPr),open=Number(ticker.open24h);
   if(!(last>0&&open>0)){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='数据无效';return}
   d.p=last;d.o=open;d.ready=true;paint(d);
  });
 }
 function processStocks(){
  if(stocksProcessed||!spotsDone||!directoryDone)return;
  stocksProcessed=true;
  S.forEach(d=>{
   if(!REALITY_STOCKS.has(d.s))return;
   if(!spots||!realitySymbols){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='行情暂不可用';return}
   const symbol=realitySymbols.get(d.s),ticker=symbol&&spots.get(symbol.toUpperCase());
   if(!ticker){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='暂无行情';return}
   const last=Number(ticker.lastPrice),open=Number(ticker.openPrice24h);
   if(!(last>0&&open>0)){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='数据无效';return}
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
   tasks.push(bitgetJson('/api/v3/reality/market/stock-info').then(data=>{
    realitySymbols=new Map(data.filter(s=>s&&s.code&&s.symbol).map(s=>[String(s.code).toUpperCase(),String(s.symbol)]));
    const sk=data.find(s=>s&&s.symbol&&(String(s.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'')==='SKHY'||/SK\s*HYNIX/i.test(String(s.name||''))||/RSKHYUSDT/i.test(String(s.symbol||''))));
    if(sk)realitySymbols.set('SKHYNIX',String(sk.symbol));
    realitySymbolCache=realitySymbols;realitySymbolCacheAt=Date.now();
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
/* 禁止全页面双击触发浏览器放大；只拦截短时间内、相近位置的第二次触摸，不影响正常单击。 */
let lastTapAt=0,lastTapX=0,lastTapY=0;
document.addEventListener('touchend',event=>{
 if(!event.changedTouches||event.changedTouches.length!==1)return;
 const touch=event.changedTouches[0],now=performance.now();
 const dx=touch.clientX-lastTapX,dy=touch.clientY-lastTapY;
 if(now-lastTapAt>0&&now-lastTapAt<350&&dx*dx+dy*dy<625){
  event.preventDefault();
  lastTapAt=0;lastTapX=lastTapY=0;
  return;
 }
 lastTapAt=now;lastTapX=touch.clientX;lastTapY=touch.clientY;
},{passive:false});
window.VegasApplyFormalSignals=function(){
 const formal=new Set(window.VegasFormalSignalSymbols||[]);
 document.querySelectorAll('#market-cards-layer .mc-card[data-symbol]').forEach(card=>{
  const active=formal.has(String(card.dataset.symbol||'').toUpperCase());
  if(active)card.setAttribute('data-formal-signal','true');
  else card.removeAttribute('data-formal-signal');
 });
};
window.VegasApplyFormalSignals();
loadMarketData();scheduleMarketRefresh();
document.querySelectorAll('#market-cards-layer .mc-slot').forEach(el=>{const c=el.querySelector('.mc-card');const off=()=>{c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg');c.classList.remove('hot')};el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.setProperty('--ry',((x-.5)*24)+'deg');c.style.setProperty('--rx',((.5-y)*20)+'deg');c.style.setProperty('--mx',x*100+'%');c.style.setProperty('--my',y*100+'%');c.classList.add('hot')});['pointerleave','pointerup','pointercancel'].forEach(t=>el.addEventListener(t,off))});
})();
