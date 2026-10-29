/* 第三层：27 张品种行情卡片、滚动聚焦和行情刷新。 */
(()=>{
const P=[
 ["AAPL","AAPLUSDT"],["MSFT","MSFTUSDT"],["GOOGL","GOOGLUSDT"],["AMZN","AMZNUSDT"],["NVDA","NVDAUSDT"],["TSLA","TSLAUSDT"],["META","METAUSDT"],["INTC","INTCUSDT"],["QCOM","QCOMUSDT"],["AMD","AMDUSDT"],["TSM","TSMUSDT"],["AVGO","AVGOUSDT"],["ORCL","ORCLUSDT"],["ARM","ARMUSDT"],["MU","MUUSDT"],["ASML","ASMLUSDT"],["SNDK","SNDKUSDT"],["SKHYNIX","SKHYNIXUSDT"],["MRVL","MRVLUSDT"],["GLW","GLWUSDT"],["HOOD","HOODUSDT"],["CBRS","CBRSUSDT"],["SPCX","SPCXUSDT"],["BTC","BTCUSDT"],["HYPE","HYPEUSDT"],["XAU","XAUUSDT"],["CL","CLUSDT"]
];
const REALITY_STOCKS=new Set(P.slice(0,23).map(x=>x[0]));
const fmt=p=>p>=100?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=1?p.toFixed(3):p.toFixed(4);
const S=P.map(([s,api],i)=>({s,api,i,p:0,o:0,candles:[],candleUpdatedAt:0,candleLoading:false,ready:false}));
const left=document.getElementById('mc-left');
S.forEach(d=>{
 left.insertAdjacentHTML('beforeend',`<div class="mc-slot"><div class="mc-float" style="--d:${-d.i*.9}s"><div class="mc-card" id="mc-c${d.i}" data-symbol="${d.s}"><div class="mc-bg"></div><i class="mc-g1"></i><i class="mc-g2"></i><i class="mc-gl"></i><div class="mc-row mc-l2"><span class="mc-coin">${d.s[0]}</span><b class="mc-sym">${d.s}</b></div><div class="mc-price mc-l4">加载中</div><div class="mc-l3"><span class="mc-pct">--</span></div><canvas class="mc-kline mc-l1" aria-label="${d.s} K线图"></canvas><div class="mc-hl mc-l2">高<span class="mc-hi">--</span>低<span class="mc-lo">--</span></div></div></div><div class="mc-gshadow" style="--d:${-d.i*.9}s"></div></div>`);
});
function drawKline(d,canvas){
 const rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),ratio=window.devicePixelRatio||1;
 const renderKey=[w,h,ratio,d.candleUpdatedAt,d.ready?1:0,d.p,d.o,d.candles.length].join('|');
 if(canvas.__mcRenderKey===renderKey)return;
 canvas.__mcRenderKey=renderKey;
 const ctx=canvas.getContext('2d');
 if(canvas.width!==Math.round(w*ratio))canvas.width=Math.round(w*ratio);
 if(canvas.height!==Math.round(h*ratio))canvas.height=Math.round(h*ratio);
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
 const rows=d.candles||[];if(rows.length<2)return;
 let mn=Infinity,mx=-Infinity;
 rows.forEach(c=>{mn=Math.min(mn,c.low);mx=Math.max(mx,c.high)});
 if(!Number.isFinite(mn)||!Number.isFinite(mx))return;
 const range=mx-mn||1,y=v=>h-3-(v-mn)/range*(h-6),step=w/rows.length,bw=Math.max(1,step*.58);
 ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;
 for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,h*i/4);ctx.lineTo(w,h*i/4);ctx.stroke()}
 rows.forEach((c,i)=>{
  const up=c.close>=c.open,col=up?'#2ee6a6':'#ff5c7c',x=i*step+step/2,top=y(Math.max(c.open,c.close)),bottom=y(Math.min(c.open,c.close));
  ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1.2;ctx.shadowColor=col;ctx.shadowBlur=3;
  ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();
  ctx.fillRect(x-bw/2,top,bw,Math.max(2,bottom-top));
 });
 if(d.ready&&Number.isFinite(d.p)&&d.p>0){const col=d.p>=d.o?'#2ee6a6':'#ff5c7c';ctx.shadowBlur=0;ctx.setLineDash([3,4]);ctx.strokeStyle=col;ctx.globalAlpha=.5;ctx.beginPath();ctx.moveTo(0,y(d.p));ctx.lineTo(w,y(d.p));ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1}
 ctx.shadowBlur=0;
}
function paint(d){
 const c=document.getElementById('mc-c'+d.i),q=s=>c.querySelector(s),priceEl=q('.mc-price');
 const symbolLabel=q('.mc-sym');if(symbolLabel&&symbolLabel.firstChild)symbolLabel.firstChild.textContent=d.s;
 if(!d.ready||!Number.isFinite(d.p)||d.p<=0){q('.mc-price').textContent='加载中';q('.mc-pct').textContent='--';q('.mc-hi').textContent='--';q('.mc-lo').textContent='--';drawKline(d,q('.mc-kline'));return}
 const up=d.p>=d.o;c.classList.toggle('up',up);c.classList.toggle('dn',!up);
 const nextPrice=fmt(d.p);if(priceEl.textContent!==nextPrice&&priceEl.textContent!=='加载中'){priceEl.classList.add('flash');window.setTimeout(()=>priceEl.classList.remove('flash'),250)}priceEl.textContent=nextPrice;q('.mc-pct').textContent=(up?'+':'')+((d.p/d.o-1)*100).toFixed(2)+'%';
 const values=d.candles.flatMap(c=>[c.high,c.low]).filter(v=>Number.isFinite(v)&&v>0);
 if(values.length>1){const mn=Math.min(...values),mx=Math.max(...values);q('.mc-hi').textContent=fmt(mx);q('.mc-lo').textContent=fmt(mn)}
 drawKline(d,q('.mc-kline'));
}
window.addEventListener('resize',()=>{
 cachedCardStep=0;
 S.forEach(d=>drawKline(d,document.querySelector('#mc-c'+d.i+' .mc-kline')));
 queueFocusScale();
},{passive:true});
let focusSlots=Array.from(left.querySelectorAll('.mc-slot'));
let focusFrame=0;
function updateFocusScale(){
 focusFrame=0;
 const height=left.clientHeight,scrollTop=left.scrollTop,center=scrollTop+height/2,range=Math.max(1,height*.52),fadeRange=Math.max(1,height*.46),available=Math.max(1,left.clientWidth-8);
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
function autoWaveScroll(now){
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
  requestAnimationFrame(autoWaveScroll);
 }
}
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden){
  autoLastTime=0;
  autoEngageLastTime=0;
  autoResumeAt=performance.now()+250;
 }
},{passive:true});
requestAnimationFrame(autoWaveScroll);

/* 自动滚动看门狗：若动画帧运行但滚动位置连续停滞，使用独立定时器恢复位移。 */
let autoWatchPosition=left.scrollTop,autoWatchChangedAt=performance.now();
window.setInterval(()=>{
 try{
  const now=performance.now(),position=left.scrollTop;
  if(Math.abs(position-autoWatchPosition)>.05){
   autoWatchPosition=position;
   autoWatchChangedAt=now;
   return;
  }
  if(document.hidden||wheelFrame||now<autoResumeAt)return;
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
},250);

/* resize 主监听器已统一负责缓存失效、K线重绘与焦点缩放刷新。 */
left.style.scrollBehavior='auto';
/* 容器/卡片尺寸变化时使步长缓存失效，兼顾旋转屏幕和响应式布局。 */
if('ResizeObserver' in window){
 const stepObserver=new ResizeObserver(()=>{
  cachedCardStep=0;
  /* 视口/断点改变时同步重绘迷你 K 线，避免沿用旧尺寸的 canvas 缓冲区。 */
  S.forEach(d=>drawKline(d,document.querySelector('#mc-c'+d.i+' .mc-kline')));
  queueFocusScale();
});
 stepObserver.observe(left);
 if(left.firstElementChild)stepObserver.observe(left.firstElementChild);
}
queueFocusScale();
const API='https://api.bitget.com';
const CANDLE_REFRESH_MS=5*60*1000;
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
async function loadSparkline(d,symbol,isStock){
 if(d.candleLoading||document.hidden)return;
 d.candleLoading=true;
 try{
  const params=isStock?new URLSearchParams({category:'SPOT',symbol,interval:'1H',limit:'30'}):new URLSearchParams({symbol,productType:'USDT-FUTURES',granularity:'1H',limit:'30'});
  const path=isStock?'/api/v3/market/candles':'/api/v2/mix/market/candles';
  const rows=await bitgetJson(path+'?'+params);
  d.candles=rows.filter(r=>Array.isArray(r)&&Number(r[1])>0&&Number(r[2])>0&&Number(r[3])>0&&Number(r[4])>0).sort((a,b)=>Number(a[0])-Number(b[0])).slice(-30).map(r=>({open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4])}));
  d.candleUpdatedAt=Date.now();
 }catch(error){d.candleUpdatedAt=Date.now()-CANDLE_REFRESH_MS+60000;console.warn('[Vegas Octopus] 1H candles failed for '+d.s+':',error)}
 finally{d.candleLoading=false}
 paint(d)
}
let marketLoadInFlight=false;
let realitySymbolCache=null,realitySymbolCacheAt=0;
/* K线请求使用全局队列限流，避免每轮行情刷新都创建独立批次导致并发叠加。 */
const SPARK_CONCURRENCY=4;
const sparkQueue=[];
const sparkQueued=new Set();
let sparkWorkers=0;
function enqueueSparkJobs(jobs){
 for(const job of jobs){
  if(sparkQueued.has(job.key)||job.d.candleLoading)continue;
  sparkQueued.add(job.key);
  sparkQueue.push(job);
 }
 pumpSparkJobs();
}
function pumpSparkJobs(){
 while(sparkWorkers<SPARK_CONCURRENCY&&sparkQueue.length&&!document.hidden){
  const job=sparkQueue.shift();
  sparkQueued.delete(job.key);
  if(job.d.candleLoading)continue;
  sparkWorkers++;
  Promise.resolve().then(job.run).catch(error=>{
   console.warn('[Vegas Octopus] candle queue job failed:',error);
  }).finally(()=>{
   sparkWorkers=Math.max(0,sparkWorkers-1);
   pumpSparkJobs();
  });
 }
}
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)pumpSparkJobs();
},{passive:true});
async function loadMarketData(){
 if(marketLoadInFlight)return;marketLoadInFlight=true;
 try{
  const needRealityDirectory=!realitySymbolCache||Date.now()-realitySymbolCacheAt>5*60*1000;
  const requests=[bitgetJson('/api/v2/mix/market/tickers?productType=USDT-FUTURES'),bitgetJson('/api/v3/market/tickers?category=SPOT')];
  if(needRealityDirectory)requests.push(bitgetJson('/api/v3/reality/market/stock-info'));
  const results=await Promise.allSettled(requests);
  const [futureResult,spotResult]=results;
  const stockResult=needRealityDirectory?results[2]:null;
  const futures=futureResult.status==='fulfilled'?new Map(futureResult.value.map(t=>[String(t.symbol).toUpperCase(),t])):null;
  const spots=spotResult.status==='fulfilled'?new Map(spotResult.value.map(t=>[String(t.symbol).toUpperCase(),t])):null;
  let realitySymbols=realitySymbolCache;
  if(needRealityDirectory&&stockResult&&stockResult.status==='fulfilled'){
   realitySymbols=new Map(stockResult.value.filter(s=>s&&s.code&&s.symbol).map(s=>[String(s.code).toUpperCase(),String(s.symbol)]));
   const sk=stockResult.value.find(s=>s&&s.symbol&&(String(s.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'')==='SKHY'||/SK\s*HYNIX/i.test(String(s.name||''))||/RSKHYUSDT/i.test(String(s.symbol||''))));
   if(sk)realitySymbols.set('SKHYNIX',String(sk.symbol));
   realitySymbolCache=realitySymbols;realitySymbolCacheAt=Date.now();
  }
  const sparkJobs=[];
  S.forEach(d=>{
   if(REALITY_STOCKS.has(d.s)){
    if(!spots||!realitySymbols){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='行情暂不可用';return}
    const symbol=realitySymbols.get(d.s),ticker=symbol&&spots.get(symbol.toUpperCase());
    if(!ticker){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='暂无行情';return}
    const last=Number(ticker.lastPrice),open=Number(ticker.openPrice24h);
    if(!(last>0&&open>0)){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='数据无效';return}
    d.api=symbol;d.p=last;d.o=open;d.ready=true;paint(d);if(Date.now()-d.candleUpdatedAt>=CANDLE_REFRESH_MS)sparkJobs.push({key:d.i,d,run:()=>loadSparkline(d,symbol,true)});
   }else{
    if(!futures){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='行情暂不可用';return}
    const ticker=futures.get(d.api.toUpperCase());
    if(!ticker){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='暂无行情';return}
    const last=Number(ticker.lastPr),open=Number(ticker.open24h);
    if(!(last>0&&open>0)){if(!d.ready)document.querySelector('#mc-c'+d.i+' .mc-price').textContent='数据无效';return}
    d.p=last;d.o=open;d.ready=true;paint(d);if(Date.now()-d.candleUpdatedAt>=CANDLE_REFRESH_MS)sparkJobs.push({key:d.i,d,run:()=>loadSparkline(d,d.api,false)});
   }
  });
  if(sparkJobs.length)enqueueSparkJobs(sparkJobs);
 }catch(error){console.warn('[Vegas Octopus] market feed failed:',error)}finally{marketLoadInFlight=false}
}
window.VegasApplyFormalSignals=function(){
 const formal=new Set(window.VegasFormalSignalSymbols||[]);
 document.querySelectorAll('#market-cards-layer .mc-card[data-symbol]').forEach(card=>{
  const active=formal.has(String(card.dataset.symbol||'').toUpperCase());
  if(active)card.setAttribute('data-formal-signal','true');
  else card.removeAttribute('data-formal-signal');
 });
};
window.VegasApplyFormalSignals();
loadMarketData();setInterval(loadMarketData,15000);
document.querySelectorAll('#market-cards-layer .mc-slot').forEach(el=>{const c=el.querySelector('.mc-card');const off=()=>{c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg');c.classList.remove('hot')};el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.setProperty('--ry',((x-.5)*24)+'deg');c.style.setProperty('--rx',((.5-y)*20)+'deg');c.style.setProperty('--mx',x*100+'%');c.style.setProperty('--my',y*100+'%');c.classList.add('hot')});['pointerleave','pointerup','pointercancel'].forEach(t=>el.addEventListener(t,off))});
})();
