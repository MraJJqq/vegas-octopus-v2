/* 第五层：Vegas 全屏 K线画布。独立模块，不修改其他层级逻辑。 */
(()=> {
'use strict';
const API='https://api.bitget.com';
const STORAGE_KEY='vegas-octopus-layer5-kline-v1';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['1H','4H','1D'];
let requestVersion=0;
const EMA_LINES=[
 {n:12,color:'#f5d76e',width:1.2},
 {n:36,color:'#54B8D0',width:1.5},
 {n:43,color:'#54B8D0',width:1.5},
 {n:144,color:'#f4d35e',width:1.7},
 {n:169,color:'#f4d35e',width:1.7},
 {n:576,color:'#ff4e5e',width:1.8},
 {n:676,color:'#ff4e5e',width:1.8}
];
const state={open:false,symbol:'',period:'4H',candles:[],loading:false,fetchAt:0,loadedSymbol:'',loadedPeriod:'',saved:{},candleCache:new Map(),refreshTimer:0,requestController:null,requestFailures:0,retryAfter:0,pendingVisibleRange:null};
const readSaved=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {}}};
state.saved=readSaved();
const storedState=state.saved;state.saved=storedState.perSymbol||storedState;
let globalVisibleRange=storedState.globalVisibleRange||null;
const root=document.createElement('div');root.id='vegas-layer5-root';
root.innerHTML=`<section id="vegas-layer5-window" aria-label="Vegas 全屏 K线图">
<span id="vegas-layer5-status" aria-live="polite"></span>
<div id="vegas-layer5-chart-wrap"><div id="vegas-layer5-chart" aria-label="K线与Vegas均线图"></div><div id="vegas-layer5-message">等待行情</div></div>
<nav id="vegas-layer5-control" aria-label="当前品种与K线周期"><span id="vegas-layer5-title"></span><span class="vegas-l5-divider" aria-hidden="true">·</span><div id="vegas-layer5-periods"></div></nav>
</section>`;
document.body.appendChild(root);
const win=root.querySelector('#vegas-layer5-window'),chartHost=root.querySelector('#vegas-layer5-chart'),title=root.querySelector('#vegas-layer5-title'),status=root.querySelector('#vegas-layer5-status'),periodsHost=root.querySelector('#vegas-layer5-periods'),message=root.querySelector('#vegas-layer5-message');
const LWC=window.LightweightCharts;
if(!LWC){
 console.error('[Vegas Layer 5] Lightweight Charts CDN did not load');
 if(typeof window.VegasLayer5BridgeFailed==='function')window.VegasLayer5BridgeFailed();
 return;
}
const chart=LWC.createChart(chartHost,{
 autoSize:true,attributionLogo:true,
 layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.7)',fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
 grid:{vertLines:{visible:false},horzLines:{visible:false}},
 rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.06,bottom:.06}},leftPriceScale:{visible:false,borderVisible:false},
 timeScale:{visible:false,borderVisible:false,rightOffset:0,barSpacing:6,minBarSpacing:1,fixLeftEdge:false,fixRightEdge:false,shiftVisibleRangeOnNewBar:false},
 crosshair:{vertLine:{visible:false},horzLine:{visible:false}},
 handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},
 handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:false,axisDoubleClickReset:false},
 kineticScroll:{touch:true,mouse:true}
});
const candleSeries=chart.addSeries(LWC.CandlestickSeries,{upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',borderVisible:true,lastValueVisible:false,priceLineVisible:false});
const emaSeries=EMA_LINES.map(line=>chart.addSeries(LWC.LineSeries,{color:line.color,lineWidth:Math.max(1,Math.min(4,Math.round(line.width))),lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}));


let renderedSnapshot=null;
let suppressRangeSaveUntil=0,chartAutoApplying=false;
function currentSaved(){if(!state.saved[state.symbol])state.saved[state.symbol]={};return state.saved[state.symbol]}
let saveTimer=0,rollInTimer=0,lastTitleTap=0,legacyRangesCleaned=false;
function scheduleSave(){
 if(saveTimer)clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{saveTimer=0;save()},220);
}
function flushSave(){
 if(saveTimer){clearTimeout(saveTimer);saveTimer=0;}
 save();
}
chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
 if(!range||!state.open||!state.candles.length||Date.now()<suppressRangeSaveUntil||chartAutoApplying)return;
 globalVisibleRange=range;scheduleSave();
});
function symbolFor(symbol){return symbol+'USDT'}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({perSymbol:state.saved,globalVisibleRange,defaultPeriodMigration:'4H'}))}catch{}}
if(storedState.defaultPeriodMigration!=='4H'){
 for(const saved of Object.values(state.saved)){
  if(saved&&typeof saved==='object')saved.period='4H';
 }
 save();
}
async function getJson(path,controller){
 const signal=controller.signal;
 let lastError;
 for(let attempt=0;attempt<3;attempt++){
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const attemptController=new AbortController();
  const abortAttempt=()=>attemptController.abort();
  signal.addEventListener('abort',abortAttempt,{once:true});
  const timeout=setTimeout(()=>attemptController.abort(),10000);
  try{
   const r=await fetch(API+path,{cache:'no-store',signal:attemptController.signal});
   if(!r.ok){
    const error=Error('HTTP '+r.status);
    error.retryable=r.status===429||r.status>=500;
    if(r.status===429){
     const retryAfter=r.headers.get('Retry-After');
     const seconds=Number(retryAfter);
     const dateDelay=retryAfter&&!Number.isFinite(seconds)?Date.parse(retryAfter)-Date.now():0;
     error.retryAfterMs=Number.isFinite(seconds)&&seconds>0?seconds*1000:Math.max(0,dateDelay||0);
    }
    if(!error.retryable||attempt===2)throw error;
    lastError=error;
   }else{
    const j=await r.json();
    if(j.code!=='00000'||!Array.isArray(j.data))throw Error(j.msg||'行情响应无效');
    return j.data;
   }
  }catch(error){
   if(signal.aborted)throw new DOMException('Aborted','AbortError');
   if(attemptController.signal.aborted){lastError=Error('行情请求超时');lastError.retryable=true;}
   else{
    if(error.name==='AbortError')throw error;
    if(!error.retryable&&!(error instanceof TypeError))throw error;
    lastError=error;
   }
   if(attempt===2)throw lastError;
  }finally{
   clearTimeout(timeout);
   signal.removeEventListener('abort',abortAttempt);
  }
  await new Promise((resolve,reject)=>{
   if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
   const wait=Math.max(500*(attempt+1),Math.min(60000,lastError&&lastError.retryAfterMs||0));
   const delay=setTimeout(done,wait);
   function done(){signal.removeEventListener('abort',abort);resolve()}
   function abort(){clearTimeout(delay);signal.removeEventListener('abort',abort);reject(new DOMException('Aborted','AbortError'))}
   signal.addEventListener('abort',abort,{once:true});
  });
 }
 throw lastError||Error('行情请求失败');
}
let stockDirectory=null,stockDirectoryAt=0;
async function getStockSymbol(symbol,controller){
 if(!stockDirectory||Date.now()-stockDirectoryAt>300000){
  const rows=await getJson('/api/v3/reality/market/stock-info',controller);
  stockDirectory=new Map(rows.filter(x=>x&&x.code&&x.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
  const sk=rows.find(x=>x&&x.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
  if(sk)stockDirectory.set('SKHYNIX',String(sk.symbol));
  stockDirectoryAt=Date.now();
 }
 const s=stockDirectory.get(symbol);
 if(!s)throw Error('交易所未提供该品种的现货映射');
 return s;
}
async function loadCandles(force=false){
 if(!state.open||!state.symbol)return;
 if(state.loading&&!force)return;
 if(!force&&Date.now()<state.retryAfter)return;
 if(!force&&Date.now()-state.fetchAt<25000)return;
 if(force&&state.requestController){state.requestController.abort();state.requestController=null;}
 state.loading=true;const requestId=++requestVersion;const symbolAtRequest=state.symbol;const controller=new AbortController();state.requestController=controller;
 try{
  const stock=STOCKS.has(symbolAtRequest),period=state.period;
  let rows;
  if(stock){
   const sym=await getStockSymbol(symbolAtRequest,controller);
   rows=await getJson('/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol:sym,interval:period,limit:'1000'}),controller);
  }else{
   rows=await getJson('/api/v2/mix/market/candles?'+new URLSearchParams({symbol:symbolFor(symbolAtRequest),productType:'USDT-FUTURES',granularity:period,limit:'1000'}),controller);
  }
  if(requestId!==requestVersion||symbolAtRequest!==state.symbol)return;
  const data=rows.filter(r=>Array.isArray(r)&&Number(r[0])>0&&Number(r[1])>0&&Number(r[2])>0&&Number(r[3])>0&&Number(r[4])>0)
   .map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),}))
   .sort((a,b)=>a.time-b.time);
  const unique=[];for(const c of data){if(unique.length&&unique[unique.length-1].time===c.time)unique[unique.length-1]=c;else unique.push(c)}
  if(!unique.length)throw Error('交易所未返回有效K线');
  const sameView=state.loadedSymbol===symbolAtRequest&&state.loadedPeriod===period&&state.candles.length>0;
  const previousRange=sameView?(chart.timeScale().getVisibleRange()||globalVisibleRange):null;
  state.candles=unique;state.fetchAt=Date.now();state.requestFailures=0;state.retryAfter=0;
  const cacheKey=symbolAtRequest+'|'+period;state.candleCache.delete(cacheKey);state.candleCache.set(cacheKey,{candles:unique,fetchAt:state.fetchAt});
  while(state.candleCache.size>8)state.candleCache.delete(state.candleCache.keys().next().value);
  message.hidden=true;
  let range=previousRange,initial=false;
  if(!sameView){range=state.pendingVisibleRange||globalVisibleRange;initial=!range}
  draw({range,initial});
  state.loadedSymbol=symbolAtRequest;state.loadedPeriod=period;
 }catch(e){if(requestId===requestVersion){if(e.name!=='AbortError'){state.requestFailures=Math.min(5,state.requestFailures+1);const cooldown=Math.min(300000,30000*Math.pow(2,state.requestFailures-1));state.retryAfter=Date.now()+cooldown;}message.hidden=false;message.textContent='行情读取失败 · '+String(e.message||e).slice(0,48);status.textContent='数据异常';console.warn('[Vegas Layer 5] candle load failed',e)}}
 finally{if(state.requestController===controller)state.requestController=null;if(requestId===requestVersion)state.loading=false}
}
function ema(values,n){
 const out=new Array(values.length).fill(null);if(values.length<n)return out;
 let sum=0;for(let i=0;i<n;i++)sum+=values[i];
 let prev=sum/n;out[n-1]=prev;const k=2/(n+1);
 for(let i=n;i<values.length;i++){prev=values[i]*k+prev*(1-k);out[i]=prev}
 return out;
}
function draw(view={}){
 if(!state.open||!state.candles.length)return;
 const cacheKey=state.symbol+'|'+state.period;
 let prepared=state.candleCache.get(cacheKey);
 if(!prepared||prepared.candles!==state.candles||!prepared.chartCandles){
  const candles=state.candles.map(c=>({time:Math.floor(c.time/1000),open:c.open,high:c.high,low:c.low,close:c.close}));
  prepared={...(prepared||{}),candles:state.candles,chartCandles:candles};
  state.candleCache.delete(cacheKey);state.candleCache.set(cacheKey,prepared);
 }
 const previous=renderedSnapshot;
 const sameView=previous&&previous.symbol===state.symbol&&previous.period===state.period;
 const oldData=sameView?previous.chartCandles:null,newData=prepared.chartCandles;
 let incremental=!!(!view.restore&&oldData&&oldData.length>0&&(newData.length===oldData.length||newData.length===oldData.length+1));
 if(incremental){
  const compareUntil=newData.length===oldData.length?oldData.length-1:oldData.length;
  for(let i=0;i<compareUntil;i++){
   const a=oldData[i],b=newData[i];
   if(!b||a.time!==b.time||a.open!==b.open||a.high!==b.high||a.low!==b.low||a.close!==b.close){incremental=false;break;}
  }
 }
 let emaData=null;
 if(incremental&&previous.emaData&&newData.length>1){
  const priorTime=newData[newData.length-2].time;
  const close=newData[newData.length-1].close;
  const next=[];
  for(let index=0;index<EMA_LINES.length;index++){
   const line=EMA_LINES[index],series=previous.emaData[index];
   const prior=series.length?series[series.length-1]:null;
   if(!prior||prior.time!==priorTime){emaData=null;break;}
   const value=close*(2/(line.n+1))+prior.value*(1-2/(line.n+1));
   next.push([...series.slice(0,-1),{time:newData[newData.length-1].time,value}]);
  }
  if(next.length===EMA_LINES.length)emaData=next;
 }
 if(!emaData){
  const closes=state.candles.map(c=>c.close);
  emaData=EMA_LINES.map(line=>ema(closes,line.n).map((value,i)=>value==null?null:{time:newData[i].time,value}).filter(point=>point&&Number.isFinite(point.value)));
 }
 prepared.emaData=emaData;
 if(incremental){
  const last=newData[newData.length-1];
  candleSeries.update(last);
  emaData.forEach((data,index)=>{if(data.length)emaSeries[index].update(data[data.length-1]);});
 }else{
  suppressRangeSaveUntil=Date.now()+250;
  candleSeries.setData(newData);
  emaData.forEach((data,index)=>emaSeries[index].setData(data));
 }
 renderedSnapshot={symbol:state.symbol,period:state.period,chartCandles:newData,emaData};
 if(!chartPriceBase){const range=readChartPriceRange();if(range&&range.to>range.from)chartPriceBase={from:range.from,to:range.to};}
 const ts=chart.timeScale();
 if(view.range){
  let restored=false;
  try{ts.setVisibleRange(view.range);restored=true}
  catch{
   const interval=state.period==='1H'?3600:state.period==='4H'?14400:86400;
   const toLogical=time=>{
    let lo=0,hi=newData.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(newData[mid].time<time)lo=mid+1;else hi=mid;}
    if(lo===0)return (time-newData[0].time)/interval;
    if(lo>=newData.length)return newData.length-1+(time-newData[newData.length-1].time)/interval;
    const before=newData[lo-1],after=newData[lo];
    return lo-1+(time-before.time)/Math.max(1,after.time-before.time);
   };
   const from=toLogical(view.range.from),to=toLogical(view.range.to);
   if(Number.isFinite(from)&&Number.isFinite(to)&&to>from)ts.setVisibleLogicalRange({from,to});

  }
  if(state.pendingVisibleRange){
   if(restored)globalVisibleRange=view.range;
   state.pendingVisibleRange=null;
   save();
  }
 }else if(view.initial&&!incremental)ts.setVisibleLogicalRange({from:Math.max(0,newData.length-120),to:newData.length});
 const last=state.candles[state.candles.length-1];
 title.textContent=state.symbol;
 status.textContent=last.close.toLocaleString('en-US',{maximumFractionDigits:6})+'  '+new Date(last.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
 scheduleChartAutoScroll();
}
function renderControlBar(){
 const options=PERIODS;
 periodsHost.replaceChildren(...options.map(period=>{
  const button=document.createElement('button');
  button.type='button';button.className='vegas-l5-period';
  button.dataset.period=period;button.textContent=period;
  button.setAttribute('aria-pressed',String(period===state.period));
  if(period===state.period)button.classList.add('is-active');
  return button;
 }));
}
function saveView(){flushSave()}
function playRollIn(){
 win.classList.remove('is-closing','is-roll-out','is-roll-in');
 win.classList.add('is-open');
 void win.offsetWidth;
 win.classList.add('is-roll-in');
 if(rollInTimer)clearTimeout(rollInTimer);
 rollInTimer=window.setTimeout(()=>{rollInTimer=0;win.classList.remove('is-roll-in')},ROLL_MS+30);
}
function openSymbol(symbol){
 if(!symbol)return;
 lastTitleTap=0;
 const animateIn=!state.open||win.classList.contains('is-roll-out')||win.classList.contains('is-closing');
 win.classList.remove('is-closing');
 if(state.requestController){state.requestController.abort();state.requestController=null;}
 if(state.open&&state.candles.length)saveView();
 state.open=true;state.symbol=symbol;
 const saved=state.saved[symbol]||{};
 state.period=saved.period||'4H';
 /* 旧版按品种保存的视窗只用于一次性迁移；之后统一使用 globalVisibleRange。 */
 if(!globalVisibleRange){
  const legacy=saved.visibleRanges&&saved.visibleRanges[state.period]||saved.visibleRange||
   Object.values(state.saved).map(item=>item&&item.visibleRanges&&
    (item.visibleRanges[state.period]||Object.values(item.visibleRanges)[0])||item&&item.visibleRange).find(Boolean);
  if(legacy)globalVisibleRange=legacy;
 }
 if(!legacyRangesCleaned){
  const hadLegacyRanges=Object.values(state.saved).some(item=>item&&typeof item==='object'&&('visibleRanges'in item||'visibleRange'in item));
  if(hadLegacyRanges){
   for(const item of Object.values(state.saved)){
    if(item&&typeof item==='object'){delete item.visibleRanges;delete item.visibleRange;}
   }
   save();
  }
  legacyRangesCleaned=true;
 }
 state.loading=false;requestVersion++;
 if(!PERIODS.includes(state.period))state.period='4H';
 const cacheKey=symbol+'|'+state.period;const cached=state.candleCache.get(cacheKey);if(cached){state.candleCache.delete(cacheKey);state.candleCache.set(cacheKey,cached);}
 state.candles=cached?cached.candles:[];state.fetchAt=cached?cached.fetchAt:0;
 state.loadedSymbol=cached?symbol:'';state.loadedPeriod=cached?state.period:'';
 renderControlBar();
 if(animateIn)playRollIn();else win.classList.add('is-open');
 if(window.matchMedia&&window.matchMedia('(hover:hover)').matches&&chartHost.matches(':hover')){chartHover=true;syncChartInteraction();}
 message.hidden=true;
 if(cached){const range=globalVisibleRange;draw({range,initial:!range,restore:true});}
 loadCandles(false);
 scheduleRefresh();
}
let autoQueue=[],autoIndex=0,autoTimer=0,autoTransitionTimer=0,autoMode=false,manualControl=false;
const AUTO_DWELL=10000,ROLL_MS=240,FADE_MS=240;
let autoInteractionPaused=false,lastChartInteractionType='mouse';
const activeChartPointers=new Set();
/* 竖向自动平移：只改变隐藏价格轴的可视窗口，不移动卡片或周期栏。 */
const CHART_VERTICAL_SPEED=.035;
const CHART_VERTICAL_LIMIT=.22;
let chartAutoFrame=0,chartAutoTimer=0,chartAutoLastTime=0,chartAutoResumeAt=0;
let chartAutoEngage=1,chartAutoEngageLastTime=0,chartPriceBase=null,chartVerticalDirection=1;
function readChartPriceRange(){
 try{return candleSeries.priceScale().getVisibleRange()}catch{return null}
}
function scheduleChartAutoScroll(){
 if(document.hidden||!state.open||!state.candles.length||chartAutoFrame||chartAutoTimer)return;
 chartAutoTimer=window.setTimeout(()=>{chartAutoTimer=0;if(!document.hidden)chartAutoFrame=requestAnimationFrame(runChartAutoScroll)},50);
}
function runChartAutoScroll(now){
 chartAutoFrame=0;
 try{
  if(!state.open||!state.candles.length||chartInteractionActive())return;
  if(!chartAutoLastTime)chartAutoLastTime=now;
  const dt=Math.min(40,Math.max(0,now-chartAutoLastTime))/1000;
  chartAutoLastTime=now;
  if(!chartAutoEngageLastTime)chartAutoEngageLastTime=now;
  const engageDt=Math.min(40,Math.max(0,now-chartAutoEngageLastTime));
  chartAutoEngageLastTime=now;
  if(now>=chartAutoResumeAt){
   chartAutoEngage=Math.min(1,chartAutoEngage+engageDt/1000);
   const range=readChartPriceRange();
   if(range&&Number.isFinite(range.from)&&Number.isFinite(range.to)&&range.to>range.from){
    if(!chartPriceBase)chartPriceBase={from:range.from,to:range.to};
    const span=chartPriceBase.to-chartPriceBase.from;
    const limit=span*CHART_VERTICAL_LIMIT;
    const step=span*CHART_VERTICAL_SPEED*chartAutoEngage*dt;
    let offset=(range.from-chartPriceBase.from)+chartVerticalDirection*step;
    if(offset>=limit){offset=limit;chartVerticalDirection=-1}
    else if(offset<=-limit){offset=-limit;chartVerticalDirection=1}
    if(step>0){
     chartAutoApplying=true;
     try{candleSeries.priceScale().setVisibleRange({from:chartPriceBase.from+offset,to:chartPriceBase.to+offset})}
     finally{chartAutoApplying=false}
    }
   }
  }
 }catch(error){console.warn('[Vegas Layer 5] vertical auto-scroll frame recovered',error)}
 finally{scheduleChartAutoScroll()}
}
function pauseChartAutoScroll(type){
 lastChartInteractionType=type||lastChartInteractionType;
 chartAutoResumeAt=Infinity;
 if(chartAutoFrame){cancelAnimationFrame(chartAutoFrame);chartAutoFrame=0}
 if(chartAutoTimer){clearTimeout(chartAutoTimer);chartAutoTimer=0}
 chartAutoLastTime=0;chartAutoEngageLastTime=0;
}
function resumeChartAutoScroll(type){
 lastChartInteractionType=type||lastChartInteractionType;
 const current=readChartPriceRange();
 if(current&&Number.isFinite(current.from)&&Number.isFinite(current.to)&&current.to>current.from)
  chartPriceBase={from:current.from,to:current.to};
 chartAutoResumeAt=performance.now()+(lastChartInteractionType==='touch'?1400:180);
 chartAutoEngage=lastChartInteractionType==='touch'?0:.28;
 chartAutoLastTime=0;chartAutoEngageLastTime=0;
 scheduleChartAutoScroll();
}
function clearChartAutoScroll(){
 if(chartAutoFrame)cancelAnimationFrame(chartAutoFrame);
 if(chartAutoTimer)clearTimeout(chartAutoTimer);
 chartAutoFrame=0;chartAutoTimer=0;chartAutoLastTime=0;chartAutoEngageLastTime=0;
 chartPriceBase=null;chartVerticalDirection=1;
}
function clearAutoTimers(){
 if(autoTimer){clearTimeout(autoTimer);autoTimer=0;}
 if(autoTransitionTimer){clearTimeout(autoTransitionTimer);autoTransitionTimer=0;}
 if(rollInTimer){clearTimeout(rollInTimer);rollInTimer=0;}
}
function chartInteractionActive(){return activeChartPointers.size>0}
function syncChartInteraction(){
 const paused=chartInteractionActive();
 if(paused===autoInteractionPaused)return;
 autoInteractionPaused=paused;
 if(paused){
  pauseChartAutoScroll(lastChartInteractionType);
  if(autoTimer){clearTimeout(autoTimer);autoTimer=0;}
 }else{
  resumeChartAutoScroll(lastChartInteractionType);
  scheduleAutoStep();
 }
}
chartHost.addEventListener('pointerdown',e=>{
 activeChartPointers.add(e.pointerId);
 pauseChartAutoScroll(e.pointerType==='touch'?'touch':e.pointerType);
 syncChartInteraction();
},{passive:true});
window.addEventListener('pointerup',e=>{
 activeChartPointers.delete(e.pointerId);
 lastChartInteractionType=e.pointerType==='touch'?'touch':e.pointerType;
 syncChartInteraction();
},{passive:true});
window.addEventListener('pointercancel',e=>{
 activeChartPointers.delete(e.pointerId);
 lastChartInteractionType=e.pointerType==='touch'?'touch':e.pointerType;
 syncChartInteraction();
},{passive:true});
chartHost.addEventListener('lostpointercapture',e=>{
 activeChartPointers.delete(e.pointerId);syncChartInteraction();
},{passive:true});
chartHost.addEventListener('wheel',()=>{
 resumeChartAutoScroll('mouse');
},{passive:true});
function hideWindow(){
 lastTitleTap=0;
 if(state.open&&state.candles.length)saveView();
 if(state.requestController){state.requestController.abort();state.requestController=null;}
 state.open=false;requestVersion++;state.loading=false;state.symbol='';state.candles=[];
 if(state.refreshTimer)clearTimeout(state.refreshTimer);
 state.refreshTimer=0;
 win.classList.remove('is-open','is-roll-in','is-roll-out');
 win.classList.add('is-closing');
 window.setTimeout(()=>{if(!state.open)win.classList.remove('is-closing')},FADE_MS+30);
}
function scheduleAutoStep(){
 if(manualControl||document.hidden||!autoMode||!autoQueue.length||chartInteractionActive())return;
 if(autoTimer)clearTimeout(autoTimer);
 autoTimer=window.setTimeout(()=>{autoTimer=0;advanceAutoQueue()},AUTO_DWELL);
}
function showAutoSymbol(symbol){
 if(!symbol||manualControl||document.hidden)return;
 if(state.open&&state.symbol===symbol){autoMode=true;scheduleAutoStep();return;}
 autoMode=true;
 if(state.open){
  if(autoTransitionTimer)clearTimeout(autoTransitionTimer);
  win.classList.remove('is-roll-in');
  win.classList.add('is-roll-out');
  autoTransitionTimer=window.setTimeout(()=>{
   autoTransitionTimer=0;
   if(manualControl||document.hidden)return;
   openSymbol(symbol);
   scheduleAutoStep();
  },ROLL_MS);
  return;
 }
 openSymbol(symbol);
 scheduleAutoStep();
}
function advanceAutoQueue(){
 if(manualControl||document.hidden||!autoQueue.length)return;
 if(autoQueue.length===1){
  if(!state.open||state.symbol!==autoQueue[0])showAutoSymbol(autoQueue[0]);
  else scheduleAutoStep();
  return;
 }
 autoIndex=(autoIndex+1)%autoQueue.length;
 showAutoSymbol(autoQueue[autoIndex]);
}
function resumeAutoQueue(){
 if(manualControl||document.hidden||!autoQueue.length)return;
 autoMode=true;
 if(state.open){
  const current=autoQueue.indexOf(state.symbol);
  if(current>=0)autoIndex=current;
  advanceAutoQueue();
 }else{
  autoIndex=Math.min(autoIndex,autoQueue.length-1);
  showAutoSymbol(autoQueue[autoIndex]);
 }
}
window.VegasLayer5SetAutoQueue=function(symbols){
 const next=Array.from(new Set((symbols||[]).map(s=>String(s||'').trim().toUpperCase()).filter(Boolean)));
 const previous=autoQueue;
 autoQueue=next;
 if(!autoQueue.length){
  clearAutoTimers();
  if(!manualControl&&autoMode&&state.open){autoMode=false;hideWindow();}
  else autoMode=false;
  autoIndex=0;
  return;
 }
 if(autoIndex>=autoQueue.length)autoIndex=0;
 if(manualControl)return;
 if(state.open&&!autoMode){autoMode=true;scheduleAutoStep();return;}
 if(state.open&&autoMode&&!autoQueue.includes(state.symbol)){
  clearAutoTimers();
  autoIndex=0;
  showAutoSymbol(autoQueue[autoIndex]);
  return;
 }
 if(!state.open&&!autoMode){
  autoIndex=0;
  showAutoSymbol(autoQueue[autoIndex]);
  return;
 }
 if(!previous.length&&!state.open){
  autoIndex=0;
  showAutoSymbol(autoQueue[0]);
 }
};
window.VegasLayer5Open=function(symbol){
 clearAutoTimers();
 manualControl=false;
 const manualIndex=autoQueue.indexOf(String(symbol||'').trim().toUpperCase());
 autoIndex=manualIndex>=0?manualIndex:Math.max(0,autoQueue.length-1);
 autoMode=autoQueue.length>0;
 openSymbol(symbol);
 if(autoMode)scheduleAutoStep();
};
if(typeof window.VegasLayer5BridgeReady==='function')window.VegasLayer5BridgeReady();
function close(){
 clearAutoTimers();
 manualControl=true;autoMode=false;
 activeChartPointers.clear();autoInteractionPaused=false;clearChartAutoScroll();
 hideWindow();
}
/* 品种名称双击/触屏双击退出；周期按钮仍只响应单击。 */
title.addEventListener('touchend',e=>{
 if(!state.open)return;
 const now=Date.now();
 if(now-lastTitleTap<380){e.preventDefault();lastTitleTap=0;close()}
 else lastTitleTap=now;
},{passive:false});
title.addEventListener('dblclick',e=>{
 if(state.open){e.preventDefault();close()}
});
/* Escape 键保留为全局退出方式。 */
periodsHost.addEventListener('click',e=>{
 const button=e.target.closest&&e.target.closest('button[data-period]');
 if(!button||!state.symbol)return;
 const nextPeriod=button.dataset.period;
 if(nextPeriod===state.period)return;
 const saved=currentSaved();
 const currentRange=chart.timeScale().getVisibleRange();
 if(currentRange)globalVisibleRange=currentRange;
 state.pendingVisibleRange=globalVisibleRange;
 state.period=nextPeriod;
 saved.period=state.period;
 renderControlBar();
 state.fetchAt=0;
 state.candles=[];
 state.loadedSymbol='';
 state.loadedPeriod='';
 save();
 loadCandles(true);
});
document.addEventListener('click',e=>{
 /* 底部空白带作为单击退出区；周期栏优先保留自身点击，不拦截图表区域。 */
 if(state.open&&e.clientY>=window.innerHeight-56&&!(e.target.closest&&e.target.closest('#vegas-layer5-control'))){
  e.preventDefault();e.stopPropagation();close();return;
 }
 /* 全屏画布覆盖整个可视屏幕，无法再定义窗口外区域；使用 Escape 退出。 */
},true);
/* Chart pan, pinch zoom and touch kinetic scrolling remain owned by Lightweight Charts; exit uses ticker-name double-tap or Escape. */
document.addEventListener('keydown',e=>{if(state.open&&e.key==='Escape')close()});
function scheduleRefresh(){
 if(state.refreshTimer)clearTimeout(state.refreshTimer);
 state.refreshTimer=0;
 if(!state.open||document.hidden)return;
 const wait=state.retryAfter>Date.now()?state.retryAfter-Date.now():30000;
 state.refreshTimer=setTimeout(()=>{
  state.refreshTimer=0;
  if(state.open&&!document.hidden)loadCandles(false);
  scheduleRefresh();
 },wait);
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  clearAutoTimers();
  activeChartPointers.clear();autoInteractionPaused=false;clearChartAutoScroll();
  if(autoMode&&state.open){win.classList.remove('is-closing');win.classList.add('is-open');}
  if(state.open&&state.candles.length)saveView();
  if(state.refreshTimer)clearTimeout(state.refreshTimer);
  state.refreshTimer=0;
  if(state.requestController){state.requestController.abort();state.requestController=null;requestVersion++;state.loading=false;}
  return;
 }
 if(state.open){loadCandles(true);scheduleRefresh();resumeChartAutoScroll('touch');}
 if(!manualControl&&autoQueue.length){
  if(!state.open){autoMode=false;resumeAutoQueue();}
  else{autoMode=true;scheduleAutoStep();}
 }
});
window.addEventListener('pagehide',()=>{
 if(state.open&&state.candles.length)saveView();
});

window.VegasLayer5SetAutoQueue(window.VegasFormalSignalSymbols||[]);
})();
