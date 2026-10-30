/* 第五层：Vegas 全屏 K线画布。独立模块，不修改其他层级逻辑。 */
(()=> {
'use strict';
const API='https://api.bitget.com';
const STORAGE_KEY='vegas-octopus-layer5-kline-v1';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['15m','30m','1H','2H','4H','6H','12H','1D','1W'];
const STOCK_PERIODS=['4H','1D','1W'];
let requestVersion=0;
const EMA_LINES=[
 {n:12,color:'#f5d76e',width:1.2},
 {n:36,color:'#f5f7ff',width:1.5},
 {n:43,color:'#f5f7ff',width:1.5},
 {n:144,color:'#f4d35e',width:1.7},
 {n:169,color:'#f4d35e',width:1.7},
 {n:576,color:'#ff4e5e',width:1.8},
 {n:676,color:'#ff4e5e',width:1.8}
];
const state={open:false,symbol:'',period:'4H',candles:[],loading:false,fetchAt:0,rotateTimer:0,loadedSymbol:'',loadedPeriod:'',saved:{},candleCache:new Map(),refreshTimer:0,requestController:null,requestFailures:0,retryAfter:0};
const readSaved=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {}}};
state.saved=readSaved();
const storedState=state.saved;state.saved=storedState.perSymbol||storedState;
const root=document.createElement('div');root.id='vegas-layer5-root';
root.innerHTML=`<section id="vegas-layer5-window" aria-label="Vegas 全屏 K线图">
<header id="vegas-layer5-head"><button id="vegas-layer5-prev" class="vegas-l5-nav" type="button" aria-label="上一个正式信号">‹</button><button id="vegas-layer5-next" class="vegas-l5-nav" type="button" aria-label="下一个正式信号">›</button><span id="vegas-layer5-status" aria-live="polite"></span></header>
<div id="vegas-layer5-chart-wrap"><div id="vegas-layer5-chart" aria-label="K线与Vegas均线图"></div><div id="vegas-layer5-message">等待行情</div></div>
<nav id="vegas-layer5-control" aria-label="当前品种与K线周期"><span id="vegas-layer5-title"></span><span class="vegas-l5-divider" aria-hidden="true">·</span><div id="vegas-layer5-periods"></div></nav>
</section>`;
document.body.appendChild(root);
const win=root.querySelector('#vegas-layer5-window'),head=root.querySelector('#vegas-layer5-head'),chartHost=root.querySelector('#vegas-layer5-chart'),title=root.querySelector('#vegas-layer5-title'),status=root.querySelector('#vegas-layer5-status'),controlBar=root.querySelector('#vegas-layer5-control'),periodsHost=root.querySelector('#vegas-layer5-periods'),message=root.querySelector('#vegas-layer5-message');
if(!window.LightweightCharts){message.hidden=false;message.textContent='TradingView 图表组件加载失败';throw new Error('Lightweight Charts CDN did not load');}
const LWC=window.LightweightCharts;
const chart=LWC.createChart(chartHost,{
 autoSize:true,attributionLogo:true,
 layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.7)',fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
 grid:{vertLines:{visible:false},horzLines:{visible:false}},
 rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.06,bottom:.06}},leftPriceScale:{visible:false,borderVisible:false},
 timeScale:{visible:false,borderVisible:false,rightOffset:0,barSpacing:6,minBarSpacing:1,fixLeftEdge:false,fixRightEdge:false,shiftVisibleRangeOnNewBar:true},
 crosshair:{vertLine:{visible:false},horzLine:{visible:false}},
 handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
 handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:false,axisDoubleClickReset:false},
 kineticScroll:{touch:true,mouse:true}
});
const candleSeries=chart.addSeries(LWC.CandlestickSeries,{upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',borderVisible:true,lastValueVisible:false,priceLineVisible:false});
const emaSeries=EMA_LINES.map(line=>chart.addSeries(LWC.LineSeries,{color:line.color,lineWidth:Math.max(1,Math.min(4,Math.round(line.width))),lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}));
let renderedSnapshot=null;
let suppressRangeSaveUntil=0;
function currentSaved(){if(!state.saved[state.symbol])state.saved[state.symbol]={};return state.saved[state.symbol]}
let saveTimer=0;
function scheduleSave(){
 if(saveTimer)clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>{saveTimer=0;save()},220);
}
function flushSave(){
 if(saveTimer){clearTimeout(saveTimer);saveTimer=0;}
 save();
}
chart.timeScale().subscribeVisibleTimeRangeChange(range=>{
 if(!range||!state.open||!state.candles.length||Date.now()<suppressRangeSaveUntil)return;
 const saved=currentSaved();saved.visibleRange=range;saved.period=state.period;scheduleSave();
});
function symbolFor(symbol){return symbol+'USDT'}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({perSymbol:state.saved,defaultPeriodMigration:'4H'}))}catch{}}
if(storedState.defaultPeriodMigration!=='4H'){
 for(const saved of Object.values(state.saved)){
  if(saved&&typeof saved==='object'){saved.period='4H';delete saved.visibleRange;}
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
 state.loading=true;const requestId=++requestVersion;const symbolAtRequest=state.symbol;const controller=new AbortController();state.requestController=controller;message.hidden=false;message.textContent=state.candles.length?'更新行情…':'读取历史行情…';
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
  const previousRange=sameView?chart.timeScale().getVisibleRange():null;
  const wasFollowing=sameView&&chart.timeScale().scrollPosition()<=1.5;
  state.candles=unique;state.fetchAt=Date.now();state.requestFailures=0;state.retryAfter=0;
  const cacheKey=symbolAtRequest+'|'+period;state.candleCache.delete(cacheKey);state.candleCache.set(cacheKey,{candles:unique,fetchAt:state.fetchAt});
  while(state.candleCache.size>8)state.candleCache.delete(state.candleCache.keys().next().value);
  message.hidden=true;
  let range=previousRange,follow=wasFollowing,initial=false;
  if(!sameView){const saved=state.saved[symbolAtRequest]||{};range=(saved.period===period&&saved.visibleRange)?saved.visibleRange:null;follow=false;initial=!range}
  draw({range,follow,initial});
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
 const ts=chart.timeScale();
 if(!incremental){
  if(view.range){try{ts.setVisibleRange(view.range)}catch{ts.setVisibleLogicalRange({from:Math.max(0,newData.length-120),to:newData.length})}}
  else if(view.follow)ts.scrollToRealTime();
  else if(view.initial)ts.setVisibleLogicalRange({from:Math.max(0,newData.length-120),to:newData.length});
 }
 const last=state.candles[state.candles.length-1];
 title.textContent=state.symbol;
 status.textContent=last.close.toLocaleString('en-US',{maximumFractionDigits:6})+'  '+new Date(last.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function renderControlBar(){
 title.textContent=state.symbol||'';
 const options=STOCKS.has(state.symbol)?STOCK_PERIODS: ['4H','1D','1W'];
 periodsHost.replaceChildren(...options.map(period=>{
  const button=document.createElement('button');
  button.type='button';button.className='vegas-l5-period';
  button.dataset.period=period;button.textContent=period;
  button.setAttribute('aria-pressed',String(period===state.period));
  if(period===state.period)button.classList.add('is-active');
  return button;
 }));
}
function saveView(){const s=currentSaved();s.period=state.period;const range=chart.timeScale().getVisibleRange();if(range)s.visibleRange=range;flushSave()}
function openSymbol(symbol){
 if(!symbol)return;
 if(state.rotateTimer)clearTimeout(state.rotateTimer);
 state.rotateTimer=0;
 if(state.requestController){state.requestController.abort();state.requestController=null;}
 state.open=true;state.symbol=symbol;
 const saved=state.saved[symbol]||{};
 state.period=saved.period||'4H';
 state.loading=false;requestVersion++;
 if(STOCKS.has(symbol)&&!STOCK_PERIODS.includes(state.period))state.period='4H';
 const cacheKey=symbol+'|'+state.period;const cached=state.candleCache.get(cacheKey);if(cached){state.candleCache.delete(cacheKey);state.candleCache.set(cacheKey,cached);}
 state.candles=cached?cached.candles:[];state.fetchAt=cached?cached.fetchAt:0;
 state.loadedSymbol=cached?symbol:'';state.loadedPeriod=cached?state.period:'';
 if(!cached){candleSeries.setData([]);emaSeries.forEach(s=>s.setData([]));}
 renderControlBar();win.classList.add('is-open');
 message.hidden=!cached;message.textContent='读取历史行情…';
 if(cached)draw({range:saved.period===state.period?saved.visibleRange:null,initial:!(saved.period===state.period&&saved.visibleRange),restore:true});
 loadCandles(false);
 scheduleAutoRotate();
 scheduleRefresh();
}
function formalSymbols(){
 const fromGlobal=Array.isArray(window.VegasFormalSignalSymbols)?window.VegasFormalSignalSymbols:[];
 const fromCards=[...document.querySelectorAll('#market-cards-layer .mc-card[data-formal-signal="true"][data-symbol]')].map(card=>card.dataset.symbol);
 return [...new Set([...fromGlobal,...fromCards].map(s=>String(s||'').toUpperCase().replace(/USDT$/i,'')).filter(Boolean))];
}
function scheduleAutoRotate(){
 if(state.rotateTimer)clearTimeout(state.rotateTimer);
 state.rotateTimer=0;
 if(!state.open)return;
 /* 无正式信号的卡片也可打开K线，但只对正式信号品种启用自动轮播。 */
 if(!formalSymbols().includes(state.symbol))return;
 state.rotateTimer=setTimeout(()=>{
  state.rotateTimer=0;
  if(!state.open)return;
  const symbols=formalSymbols();
  if(symbols.length>1){
   const current=symbols.indexOf(state.symbol);
   const next=symbols[(current+1+symbols.length)%symbols.length];
   if(next&&next!==state.symbol){openSymbol(next);return}
  }
  scheduleAutoRotate();
 },6000);
}
function stepFormalSymbol(direction){
 const symbols=formalSymbols();
 if(!symbols.length){status.textContent='暂无正式信号';return}
 const current=symbols.indexOf(state.symbol);
 const index=current<0?(direction>0?0:symbols.length-1):(current+direction+symbols.length)%symbols.length;
 openSymbol(symbols[index]);
}
root.querySelector('#vegas-layer5-prev').addEventListener('click',()=>stepFormalSymbol(-1));
root.querySelector('#vegas-layer5-next').addEventListener('click',()=>stepFormalSymbol(1));
function close(){if(state.open&&state.candles.length)saveView();if(state.requestController){state.requestController.abort();state.requestController=null;}state.open=false;requestVersion++;state.loading=false;state.symbol='';state.candles=[];if(state.rotateTimer)clearTimeout(state.rotateTimer);state.rotateTimer=0;if(state.refreshTimer)clearTimeout(state.refreshTimer);state.refreshTimer=0;win.classList.remove('is-open');}
/* 触屏退出：顶部非控件区域双击；图表缩放和平移交由 Lightweight Charts 处理。 */
let lastHeadTap=0;
function isHeadControl(target){return !!(target&&target.closest&&target.closest('button,select,input,textarea,a'))}
head.addEventListener('touchend',e=>{
 if(!state.open||isHeadControl(e.target))return;
 const now=Date.now();
 if(now-lastHeadTap<360){e.preventDefault();lastHeadTap=0;close()}
 else lastHeadTap=now;
},{passive:false});
head.addEventListener('dblclick',e=>{
 if(state.open&&!isHeadControl(e.target)){e.preventDefault();close()}
});

periodsHost.addEventListener('click',e=>{const button=e.target.closest&&e.target.closest('button[data-period]');if(!button||!state.symbol)return;const nextPeriod=button.dataset.period;if(nextPeriod===state.period)return;state.period=nextPeriod;renderControlBar();state.fetchAt=0;state.candles=[];const saved=currentSaved();saved.period=state.period;delete saved.visibleRange;state.loadedSymbol='';state.loadedPeriod='';save();loadCandles(true)});
document.addEventListener('click',e=>{
 const card=e.target.closest&&e.target.closest('#market-cards-layer .mc-card[data-symbol]');
 if(card){
  const symbol=String(card.dataset.symbol||'').toUpperCase();
  if(!symbol)return;
  e.preventDefault();e.stopPropagation();openSymbol(symbol);
  return;
 }
 /* 全屏画布覆盖整个可视屏幕，无法再定义窗口外区域；使用 Escape 退出。 */
},true);
/* Chart pan, pinch zoom and touch kinetic scrolling are owned by TradingView Lightweight Charts.
   Full-screen exit remains available via header double-tap and Escape to avoid gesture conflicts. */
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
  if(state.open&&state.candles.length)saveView();
  if(state.refreshTimer)clearTimeout(state.refreshTimer);
  state.refreshTimer=0;
  if(state.requestController){state.requestController.abort();state.requestController=null;requestVersion++;state.loading=false;}
  return;
 }
 if(state.open){loadCandles(true);scheduleRefresh();}
});
window.addEventListener('pagehide',()=>{
 if(state.open&&state.candles.length)saveView();
});
})();