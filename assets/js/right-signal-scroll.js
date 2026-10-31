/* 第五层：正式信号K线渐变轮播，双图层交替渲染 */
(()=>{
'use strict';
if(window.__VEGAS_RIGHT_SCROLL_INIT__)return;
window.__VEGAS_RIGHT_SCROLL_INIT__=true;

const API='https://api.bitget.com';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['1H','4H','1D'];
const EMAS=[12,36,43,144,169,576,676];
const EMA_COLORS=['#f5d76e','#00B0FF','#00B0FF','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const PERIOD_KEY='vegas-right-track-v1';
const INITIAL_REVEAL_MS=1000,INITIAL_CLEAR_MS=4000,CLEAR_MS=5000,TRANSITION_MS=5000;
const root=document.getElementById('vegas-right-scroll');
const LWC=window.LightweightCharts;
if(!root||!LWC)return;

const single=root.querySelector('.vr-single');
const nav=root.querySelector('.vr-periods');
const title=root.querySelector('.vr-symbol');
const status=root.querySelector('.vr-status');
const error=root.querySelector('.vr-error');
const layers=[0,1].map(index=>{
 const el=document.createElement('div');
 el.className='vr-fade-layer'+(index===0?' is-active':'');
 el.dataset.layer=String(index);
 single.append(el);
 return el;
});

let queue=[],currentIndex=0,period='4H',periodSettings={},manualSymbol='',queueInitialized=false;
let activeLayer=0,stateTimer=0,transitionRaf=0,refreshTimer=0,rotationState='idle',refreshDeferred=false;
let cycleToken=0,initialRevealDone=false;
const isPaused=()=>rotationState==='paused';
const isTransitioning=()=>rotationState==='preparing'||rotationState==='transitioning';
let stockMap=null,stockMapAt=0,cache=new Map(),backfills=new Map(),candleRequests=new Map();

try{
 const saved=JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}');
 periodSettings=Object.fromEntries(Object.entries(saved||{})
  .filter(([,v])=>PERIODS.includes(v?.period))
  .map(([symbol,v])=>[symbol,{period:v.period}]));
}catch{}
const currentSymbol=()=>manualSymbol||queue[currentIndex]||'';
const periodFor=s=>PERIODS.includes(periodSettings[s]?.period)?periodSettings[s].period:'4H';
function savePeriods(){try{localStorage.setItem(PERIOD_KEY,JSON.stringify(periodSettings))}catch{}}
let renderedPeriod=null;
function renderPeriods(){
 if(renderedPeriod===period)return;
 renderedPeriod=period;
 nav.replaceChildren();
 PERIODS.forEach(value=>{
  const button=document.createElement('button');
  button.type='button';button.textContent=value;
  button.classList.toggle('active',value===period);
  button.addEventListener('click',()=>{
   if(value===period)return;
   captureViewport(views[activeLayer]);
   period=value;
   const symbol=currentSymbol();
   if(symbol){periodSettings[symbol]={period};savePeriods()}
   renderPeriods();pauseForInteraction();
   loadLayer(activeLayer,symbol,period).then(()=>resumeAfterInteraction());
  });
  nav.append(button);
 });
}

async function getJson(path){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(API+path,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  const json=await response.json();
  if(json.code!=='00000'||!Array.isArray(json.data))throw Error(json.msg||'行情响应无效');
  return json.data;
 }finally{clearTimeout(timeout)}
}
async function getStockMap(){
 if(stockMap&&Date.now()-stockMapAt<300000)return stockMap;
 if(typeof window.VegasGetRealityStockMap==='function'){
  stockMap=await window.VegasGetRealityStockMap();
 }else{
  const rows=await getJson('/api/v3/reality/market/stock-info');
  stockMap=new Map(rows.filter(x=>x?.code&&x?.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
  const special=rows.find(x=>x?.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
  if(special)stockMap.set('SKHYNIX',String(special.symbol));
 }
 stockMapAt=Date.now();return stockMap;
}
function normalizeCandles(rows){
 return rows.filter(row=>Array.isArray(row)&&row.slice(0,5).every(v=>Number.isFinite(+v)&&+v>0))
  .map(row=>({time:Math.floor(+row[0]/1000),open:+row[1],high:+row[2],low:+row[3],close:+row[4]}))
  .filter(row=>Number.isFinite(row.time)&&row.time>0);
}
async function getCandleContext(symbol){
 const isStock=STOCKS.has(symbol);
 let mapped='';
 if(isStock){
  mapped=(await getStockMap()).get(symbol);
  if(!mapped)throw Error('无现货映射');
 }
 return{
  isStock,
  /* 首屏走最新K线接口：美股与合约均可一次取最多1000根。 */
  latestEndpoint:isStock?'/api/v3/market/candles':'/api/v2/mix/market/candles',
  latestParams:isStock
   ?{category:'SPOT',symbol:mapped,interval:period,limit:'1000'}
   :{symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:period,limit:'1000'},
  /* 历史接口负责向更早时间分页补齐，保留各接口规定的分页上限。 */
  endpoint:isStock?'/api/v3/market/history-candles':'/api/v2/mix/market/history-candles',
  params:isStock
   ?{category:'SPOT',symbol:mapped,interval:period,limit:'100'}
   :{symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:period,limit:'200'},
  pageLimit:isStock?100:200
 };
}
async function fetchLatestCandlePage(context,timeframe){
 const params={...context.latestParams};
 if(context.isStock)params.interval=timeframe;
 else params.granularity=timeframe;
 return normalizeCandles(await getJson(context.latestEndpoint+'?'+new URLSearchParams(params)));
}
async function fetchCandlePage(context,timeframe,endTime){
 const params={...context.params};
 if(context.isStock)params.interval=timeframe;
 else params.granularity=timeframe;
 if(endTime!==null)params.endTime=String(endTime);
 return normalizeCandles(await getJson(context.endpoint+'?'+new URLSearchParams(params)));
}
async function getCandles(symbol,timeframe){
 const key=symbol+'|'+timeframe,cached=cache.get(key);
 if(cached&&Date.now()-cached.at<12000)return cached.rows;
 const pending=candleRequests.get(key);
 if(pending)return pending;
 const request=(async()=>{
  const context=await getCandleContext(symbol);
  const latest=await fetchLatestCandlePage(context,timeframe);
  if(!latest.length)throw Error('没有有效历史K线');
  /* 并发刷新共用同一请求；完成时合并最新缓存，避免重复请求或覆盖期间更新。 */
  const current=cache.get(key);
  const merged=new Map((current?.rows||[]).map(row=>[row.time,row]));
  latest.forEach(row=>merged.set(row.time,row));
  const rows=[...merged.values()].sort((a,b)=>a.time-b.time);
  cache.set(key,{rows,at:Date.now()});
  return rows;
 })();
 candleRequests.set(key,request);
 try{return await request}
 finally{if(candleRequests.get(key)===request)candleRequests.delete(key)}
}
async function completeCandles(symbol,timeframe,firstRows){
 const key=symbol+'|'+timeframe;
 const context=await getCandleContext(symbol);
 const all=new Map(firstRows.map(row=>[row.time,row]));
 let oldestKnown=all.size?Math.min(...all.keys()):0;
 let endTime=oldestKnown?oldestKnown*1000-1:null;
 const TARGET_BARS=1200,MAX_PAGES=14;
 const diagnostics={pages:0,received:0,added:0,stop:'target-or-page-limit',firstOldest:oldestKnown,lastOldest:oldestKnown};
 for(let page=0;page<MAX_PAGES&&all.size<TARGET_BARS;page++){
  if(endTime===null){diagnostics.stop='no-valid-oldest-timestamp';break;}
  const rows=await fetchCandlePage(context,timeframe,endTime);
  diagnostics.pages++;
  diagnostics.received+=rows.length;
  if(!rows.length){diagnostics.stop='empty-page';break;}
  let added=0;
  rows.forEach(row=>{if(!all.has(row.time)){all.set(row.time,row);added++;}});
  diagnostics.added+=added;
  const oldest=Math.min(...rows.map(row=>row.time));
  if(!Number.isFinite(oldest)){diagnostics.stop='invalid-page-timestamp';break;}
  diagnostics.lastOldest=oldest;
  if(added===0){diagnostics.stop='no-new-candles';break;}
  if(oldest>=oldestKnown){diagnostics.stop='pagination-did-not-move-backward';break;}
  oldestKnown=oldest;
  endTime=oldest*1000-1;
 }
 if(all.size>=TARGET_BARS)diagnostics.stop='target-reached';
 else if(diagnostics.pages>=MAX_PAGES)diagnostics.stop='max-pages-reached';
 /* 分页期间可能已有15秒行情刷新；以当前缓存覆盖相同时间戳，避免旧分页结果回滚最新K线。 */
 const current=cache.get(key);
 if(current&&Array.isArray(current.rows))current.rows.forEach(row=>all.set(row.time,row));
 const result=[...all.values()].sort((a,b)=>a.time-b.time);
 cache.set(key,{rows:result,at:current?.at??Date.now()});
 while(cache.size>30)cache.delete(cache.keys().next().value);
 /* 只记录摘要，不输出行情价格；方便通过浏览器控制台判断分页为何提前停止。 */
 console.info('[Vegas K-line history]',{symbol,timeframe,count:result.length,target:TARGET_BARS,...diagnostics});
 return result;
}
function ema(rows,length){
 if(rows.length<length)return[];
 let value=rows.slice(0,length).reduce((sum,row)=>sum+row.close,0)/length;
 const result=[{time:rows[length-1].time,value}],factor=2/(length+1);
 for(let i=length;i<rows.length;i++){value=rows[i].close*factor+value*(1-factor);result.push({time:rows[i].time,value})}
 return result;
}
/* 每个品种独立自动纵向缩放；上下各留5%空间，手动缩放仍由图表交互接管。 */
function createChart(layer){
 const host=document.createElement('div');host.className='vr-chart';layer.append(host);
 const gesture=document.createElement('div');gesture.className='vr-gesture-layer';gesture.setAttribute('aria-label','K线视窗手势控制');
 const chart=LWC.createChart(host,{
  autoSize:false,attributionLogo:false,
  layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.72)',fontSize:11},
  grid:{vertLines:{visible:false},horzLines:{visible:false}},
  rightPriceScale:{visible:false,borderVisible:false,mode:LWC.PriceScaleMode.Logarithmic,autoScale:true,scaleMargins:{top:.10,bottom:.10}},
  leftPriceScale:{visible:false,borderVisible:false},
  timeScale:{visible:false,borderVisible:false,rightOffset:3,barSpacing:5,minBarSpacing:.5,shiftVisibleRangeOnNewBar:false},
  crosshair:{vertLine:{visible:false},horzLine:{visible:false}},
  /* 所有手势由上层独立控制层接管，图表本身只负责绘制。 */
  handleScroll:{mouseWheel:false,pressedMouseMove:false,horzTouchDrag:false,vertTouchDrag:false},
  handleScale:{mouseWheel:false,pinch:false,axisPressedMouseMove:false}
 });
 const candle=chart.addSeries(LWC.CandlestickSeries,{
  upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',
  wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',lastValueVisible:false,priceLineVisible:false
 });
 const lines=EMAS.map((length,index)=>chart.addSeries(LWC.LineSeries,{
  color:EMA_COLORS[index],lineWidth:index?2:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false
 }));
 layer.append(gesture);
 return{layer,host,gesture,chart,candle,lines,symbol:'',period:'4H',request:0,hasData:false,dataAt:0};
}
const views=layers.map(createChart);
/* 图表容器初始处于 hidden 状态；显式接管尺寸，避免 iOS 首次显示时画布仍为 0×0。 */
let chartResizeFrame=0;
function resizeAllCharts(){
 if(root.hidden)return;
 const width=Math.max(1,root.clientWidth||window.innerWidth||1);
 const height=Math.max(1,root.clientHeight||window.innerHeight||1);
 views.forEach(view=>{try{view.chart.resize(width,height)}catch(error){console.warn('[Vegas K-line] chart resize failed:',error)}});
}
function scheduleChartResize(){
 if(root.hidden||chartResizeFrame)return;
 chartResizeFrame=requestAnimationFrame(()=>{chartResizeFrame=0;resizeAllCharts()});
}
if('ResizeObserver' in window){
 const rootResizeObserver=new ResizeObserver(scheduleChartResize);
 rootResizeObserver.observe(root);
}
window.addEventListener('resize',scheduleChartResize,{passive:true});
/* 独立手势控制层：K线画布不再直接处理拖动/缩放，避免外层滚动与图表手势互相抢占。 */
const gesturePointers=new Map();
let gestureBase=null;
function readGestureRange(view){
 const range=view.chart.timeScale().getVisibleLogicalRange();
 if(!range||!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.to<=range.from)return null;
 return{from:range.from,to:range.to,width:range.to-range.from};
}
function applyGestureRange(view,from,to){
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return;
 try{view.chart.timeScale().setVisibleLogicalRange({from,to})}catch{}
}
function pointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function startGesture(event){
 const view=views[activeLayer];
 if(!view?.rows?.length)return;
 event.preventDefault();
 try{view.gesture.setPointerCapture(event.pointerId)}catch{}
 gesturePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 const range=readGestureRange(view);
 if(!range)return;
 if(gesturePointers.size===1){
  gestureBase={type:'drag',view,range,startX:event.clientX,barSpacing:Math.max(.5,view.chart.timeScale().options().barSpacing||5)};
 }else if(gesturePointers.size===2){
  const points=[...gesturePointers.values()];
  gestureBase={type:'pinch',view,range,distance:Math.max(1,pointerDistance(points[0],points[1])),centerX:(points[0].x+points[1].x)/2};
 }
}
function moveGesture(event){
 if(!gesturePointers.has(event.pointerId)||!gestureBase)return;
 event.preventDefault();
 gesturePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
 const view=gestureBase.view;
 if(gesturePointers.size>=2&&gestureBase.type==='pinch'){
  const points=[...gesturePointers.values()].slice(0,2);
  const distance=Math.max(1,pointerDistance(points[0],points[1]));
  const centerX=(points[0].x+points[1].x)/2;
  const rect=view.gesture.getBoundingClientRect();
  const ratio=gestureBase.distance/distance;
  const width=Math.max(2,Math.min(5000,gestureBase.range.width*ratio));
  const shift=(gestureBase.centerX-centerX)/Math.max(1,rect.width)*gestureBase.range.width;
  const center=(gestureBase.range.from+gestureBase.range.to)/2+shift;
  applyGestureRange(view,center-width/2,center+width/2);
 }else if(gestureBase.type==='drag'){
  const rect=view.gesture.getBoundingClientRect();
  const dx=event.clientX-gestureBase.startX;
  const shift=-dx/Math.max(.5,gestureBase.barSpacing);
  applyGestureRange(view,gestureBase.range.from+shift,gestureBase.range.to+shift);
 }
}
function endGesture(event){
 if(!gesturePointers.has(event.pointerId))return;
 gesturePointers.delete(event.pointerId);
 if(gesturePointers.size===1){
  const [id,point]=[...gesturePointers.entries()][0];
  const view=views[activeLayer],range=readGestureRange(view);
  if(range)gestureBase={type:'drag',view,range,startX:point.x,barSpacing:Math.max(.5,view.chart.timeScale().options().barSpacing||5)};
 }else if(!gesturePointers.size){gestureBase=null}
}
views.forEach(view=>{
 view.gesture.addEventListener('pointerdown',startGesture,{passive:false});
 view.gesture.addEventListener('pointermove',moveGesture,{passive:false});
 view.gesture.addEventListener('pointerup',endGesture,{passive:true});
 view.gesture.addEventListener('pointercancel',endGesture,{passive:true});
 view.gesture.addEventListener('wheel',event=>{
  const range=readGestureRange(view);if(!range)return;
  event.preventDefault();
  const factor=event.deltaY>0?1.12:.89;
  const width=Math.max(2,Math.min(5000,range.width*factor));
  /* 固定以视窗右边界为缩放锚点，鼠标横向位置不再推动K线左右漂移。 */
  const right=range.to;
  applyGestureRange(view,right-width,right);
 },{passive:false});
});
/* 统一视窗状态：保存K线跨度、缩放比例和相对最新K线的位置；跨周期按真实时间跨度换算。 */
const VIEWPORT_KEY='vegas-layer5-viewport-v2';
const PERIOD_SECONDS={'1H':3600,'4H':14400,'1D':86400};
let viewport={barSpacing:5,rightOffset:3,visibleBars:null,rightEdgeOffset:-3,period:'4H'};
let viewportSaveTimer=0;
try{
 const saved=JSON.parse(localStorage.getItem(VIEWPORT_KEY)||'null');
 if(saved&&typeof saved==='object'){
  if(Number.isFinite(saved.barSpacing))viewport.barSpacing=Math.max(.5,Math.min(30,saved.barSpacing));
  if(Number.isFinite(saved.rightOffset))viewport.rightOffset=Math.max(-50,Math.min(100,saved.rightOffset));
  if(Number.isFinite(saved.visibleBars)&&saved.visibleBars>0)viewport.visibleBars=Math.max(1,Math.min(5000,saved.visibleBars));
  if(Number.isFinite(saved.rightEdgeOffset))viewport.rightEdgeOffset=Math.max(-5000,Math.min(50000,saved.rightEdgeOffset));
  if(PERIODS.includes(saved.period))viewport.period=saved.period;
 }
}catch{}
function saveViewport(){try{localStorage.setItem(VIEWPORT_KEY,JSON.stringify(viewport))}catch{}}
function scheduleViewportSave(){
 if(viewportSaveTimer)clearTimeout(viewportSaveTimer);
 viewportSaveTimer=setTimeout(()=>{viewportSaveTimer=0;saveViewport()},180);
}
function captureViewport(view){
 if(!view?.rows?.length)return;
 const scale=view.chart.timeScale(),range=scale.getVisibleLogicalRange();
 if(!range||!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.to<=range.from)return;
 const options=scale.options();
 viewport.visibleBars=Math.max(1,range.to-range.from);
 viewport.barSpacing=Number.isFinite(options.barSpacing)?options.barSpacing:viewport.barSpacing;
 viewport.rightOffset=Number.isFinite(options.rightOffset)?options.rightOffset:viewport.rightOffset;
 viewport.rightEdgeOffset=(view.rows.length-1)-range.to;
 viewport.period=view.period||viewport.period;
 scheduleViewportSave();
}
function applyViewport(view,rows,targetPeriod,commitState=(views.indexOf(view)===activeLayer)){
 if(!rows?.length)return;
 const oldSeconds=PERIOD_SECONDS[viewport.period]||PERIOD_SECONDS['4H'];
 const newSeconds=PERIOD_SECONDS[targetPeriod]||oldSeconds;
 const ratio=oldSeconds/newSeconds;
 const width=Math.max(1,view.host.clientWidth||window.innerWidth||1);
 const visibleBars=viewport.visibleBars===null?Math.max(30,Math.floor(width/viewport.barSpacing)):Math.max(1,viewport.visibleBars*ratio);
 const rightEdgeOffset=viewport.rightEdgeOffset*ratio;
 const scale=view.chart.timeScale();
 scale.applyOptions({barSpacing:viewport.barSpacing,rightOffset:viewport.rightOffset});
 const to=rows.length-1-rightEdgeOffset;
 const from=to-visibleBars;
 const applyToken=(view.viewportApplyToken||0)+1;
 view.viewportApplyToken=applyToken;
 view.applyingViewport=true;
 try{scale.setVisibleLogicalRange({from,to})}
 catch(error){console.warn('[Vegas] 应用视窗状态失败',error)}
 finally{requestAnimationFrame(()=>{if(applyToken===view.viewportApplyToken)view.applyingViewport=false})}
 /* 隐藏预加载图层只套用状态，不得抢先改写当前品种的全局记忆。 */
 if(commitState){
  viewport.visibleBars=visibleBars;
  viewport.rightEdgeOffset=rightEdgeOffset;
  viewport.period=targetPeriod;
  scheduleViewportSave();
 }
}
views.forEach((view,index)=>view.chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{
 if(index!==activeLayer||view.applyingViewport)return;
 captureViewport(view);
}));
window.addEventListener('pagehide',()=>{
 if(viewportSaveTimer)clearTimeout(viewportSaveTimer);
 viewportSaveTimer=0;captureViewport(views[activeLayer]);saveViewport();
},{passive:true});
function setData(view,rows,preserveRange=false){
 /* 渐变期间不向正在显示的两个图层写入新K线；只保留每层最新一份数据，交接结束后统一应用。 */
 if(rotationState==='transitioning'){
  view.pendingData={rows,preserveRange};
  return false;
 }
 const isActive=views.indexOf(view)===activeLayer;
 /* 仅从当前活动图层捕获用户视窗；数据更新后按K线跨度与右侧偏移恢复，
    不再使用绝对时间范围，避免刷新/历史补齐时视窗被新数据挤动。 */
 if(preserveRange&&isActive)captureViewport(view);
 view.candle.setData(rows);
 view.lines.forEach((series,index)=>series.setData(ema(rows,EMAS[index])));
 view.rows=rows;
 if(preserveRange)applyViewport(view,rows,view.period,isActive);
 view.hasData=true;
 view.dataAt=Date.now();
 view.pendingData=null;
 return true;
}
function applyPendingLayerData(){
 views.forEach((view,index)=>{
  const pending=view.pendingData;
  if(!pending)return;
  view.pendingData=null;
  setData(view,pending.rows,pending.preserveRange);
  updateLayerStatus(index,view.symbol,pending.rows);
 });
}
function resetDefaultVisibleRange(view,rows){
 if(!rows.length)return;
 /* 品种或周期切换只应用统一视窗状态；价格轴继续独立自动适配。 */
 view.chart.applyOptions({rightPriceScale:{autoScale:true,scaleMargins:{top:.10,bottom:.10}}});
 applyViewport(view,rows,view.period);
}
function syncLayerView(source,target){
 try{
  captureViewport(source);
  if(target.rows?.length)applyViewport(target,target.rows,target.period,true);
 }catch(error){
  console.warn('[Vegas] K线视窗同步失败',error);
 }
}
function updateLayerStatus(index,symbol,rows){
 if(index!==activeLayer||symbol!==currentSymbol())return;
 status.textContent=rows.at(-1).close.toLocaleString('en-US',{maximumFractionDigits:5})+' · '+rows.length+'根K线';
 if(rows.length<676){error.textContent='历史K线不足676根，EMA576/EMA676红峰无法完整显示（当前'+rows.length+'根）';error.hidden=false;}
 else error.hidden=true;
}
async function loadLayer(index,symbol,timeframe){
 if(!symbol)return false;
 const view=views[index],token=++view.request;
 const identityChanged=view.symbol!==symbol||view.period!==timeframe;
 /* 活动图层切换品种或周期前，先保存用户最后看到的逻辑视窗。 */
 if(identityChanged&&index===activeLayer&&view.rows?.length)captureViewport(view);
 if(identityChanged){view.hasData=false;view.dataAt=0;}
 view.symbol=symbol;view.period=timeframe;
 try{
  /* 首屏只等待最近一页；先画出K线，再在后台补齐EMA所需历史。 */
  const firstRows=await getCandles(symbol,timeframe);
  if(token!==view.request)return false;
  setData(view,firstRows,!identityChanged);
  if(identityChanged)resetDefaultVisibleRange(view,firstRows);
  updateLayerStatus(index,symbol,firstRows);
  if(index===activeLayer&&!initialRevealDone&&!document.hidden){
   initialRevealDone=true;rotationState='reveal';
   const layer=layers[index];
   layer.style.transition='none';layer.style.opacity='1';layer.style.filter='brightness(0.25)';
   layer.getBoundingClientRect();
   layer.style.transition=`filter ${INITIAL_REVEAL_MS}ms ease-out`;
   requestAnimationFrame(()=>{if(!document.hidden&&rotationState==='reveal'&&index===activeLayer)layer.style.filter='brightness(1)'});
   clearStateTimer();
   stateTimer=setTimeout(()=>{
    stateTimer=0;layer.style.transition='';layer.style.filter='brightness(1)';
    rotationState=manualSymbol?'manual':'idle';
    if(!manualSymbol)scheduleCycle(INITIAL_CLEAR_MS);
   },INITIAL_REVEAL_MS);
  }
  if(firstRows.length>=1200)return true;
  const backfillKey=symbol+'|'+timeframe;
  let backfill=backfills.get(backfillKey);
  if(!backfill){
   backfill=completeCandles(symbol,timeframe,firstRows).finally(()=>backfills.delete(backfillKey));
   backfills.set(backfillKey,backfill);
  }
  backfill.then(rows=>{
   if(token!==view.request||view.symbol!==symbol||view.period!==timeframe)return;
   setData(view,rows,true);
   updateLayerStatus(index,symbol,rows);
  }).catch(exception=>{
   if(token===view.request&&index===activeLayer&&symbol===currentSymbol()){
    error.textContent='历史数据补齐失败 · '+String(exception.message||exception).slice(0,42);
    error.hidden=false;
   }
  });
  return true;
 }catch(exception){
  if(index===activeLayer&&symbol===currentSymbol()){
   status.textContent='数据异常';error.textContent='行情暂不可用 · '+String(exception.message||exception).slice(0,42);error.hidden=false;
  }
  if(token===view.request){view.symbol='';view.hasData=false;}
  return false;
 }
}
function setActive(index){
 activeLayer=index;
 layers.forEach((layer,i)=>{
  layer.classList.toggle('is-active',i===index);
  layer.style.pointerEvents=i===index?'auto':'none';
 });
 const symbol=currentSymbol();
 title.textContent=symbol;
 period=periodFor(symbol);
 renderPeriods();
 const view=views[index];
 if(view.symbol===symbol&&view.period===period&&view.hasData){
  status.textContent='';error.hidden=true;
  return Promise.resolve(true);
 }
 return loadLayer(index,symbol,period);
}
function clearStateTimer(){
 if(stateTimer){clearTimeout(stateTimer);stateTimer=0;}
}
function clearTimers(){
 clearStateTimer();
 if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=0;}
}
function scheduleRefresh(delay=15000){
 if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=0;}
 if(document.hidden||!currentSymbol())return;
 refreshTimer=setTimeout(async()=>{
  refreshTimer=0;
  if(isTransitioning()){refreshDeferred=true;return;}
  const symbol=currentSymbol();
  if(symbol)await loadLayer(activeLayer,symbol,periodFor(symbol));
  scheduleRefresh();
 },delay);
}
function preloadNext(){
 if(manualSymbol||queue.length<2||document.hidden)return;
 const nextIndex=(currentIndex+1)%queue.length;
 const symbol=queue[nextIndex],timeframe=periodFor(symbol),view=views[1-activeLayer];
 if(view.symbol===symbol&&view.period===timeframe&&view.hasData&&Date.now()-view.dataAt<15000)return;
 loadLayer(1-activeLayer,symbol,timeframe);
}
function clearTransitionWork(){
 clearStateTimer();
 if(transitionRaf){cancelAnimationFrame(transitionRaf);transitionRaf=0;}
}
function applyLayerState(active=activeLayer,restoreTransition=false,forceLayout=false){
 layers.forEach((layer,index)=>{
  const isActive=index===active;
  layer.style.transition='none';
  layer.style.opacity=isActive?'1':'0';
  layer.style.filter=isActive?'brightness(1)':'brightness(0.25)';
  layer.classList.toggle('is-active',isActive);
  layer.style.pointerEvents=isActive?'auto':'none';
  if(forceLayout)layer.getBoundingClientRect();
  if(restoreTransition)layer.style.transition='';
 });
}
function settleTransition(){
 clearTransitionWork();
 applyLayerState(activeLayer);
 setTransitionHint(false);
 rotationState=manualSymbol?'manual':'idle';
 applyPendingLayerData();
 if(refreshDeferred&&!isPaused()&&!document.hidden){refreshDeferred=false;scheduleRefresh(0);}
}
function scheduleCycle(delay=CLEAR_MS){
 clearStateTimer();
 if(manualSymbol||document.hidden||isPaused()||queue.length<2)return;
 rotationState='clear';
 const token=++cycleToken;
 stateTimer=setTimeout(()=>{
  stateTimer=0;
  if(token===cycleToken&&rotationState==='clear'&&!document.hidden)beginTransition();
 },delay);
}
async function beginTransition(){
 if(manualSymbol||isTransitioning()||queue.length<2||document.hidden||isPaused())return;
 rotationState='preparing';
 const nextIndex=(currentIndex+1)%queue.length;
 const nextSymbol=queue[nextIndex],nextLayer=1-activeLayer,nextPeriod=periodFor(nextSymbol);
 const token=++cycleToken,outgoing=layers[activeLayer],incoming=layers[nextLayer];
 incoming.style.transition='none';incoming.style.opacity='0';incoming.style.filter='brightness(0.25)';
 incoming.classList.remove('is-active');
 const nextView=views[nextLayer];
 const preloaded=nextView.symbol===nextSymbol&&nextView.period===nextPeriod&&nextView.hasData&&Date.now()-nextView.dataAt<15000;
 let loaded=false;
 try{loaded=preloaded||await loadLayer(nextLayer,nextSymbol,nextPeriod)}catch{}
 if(token!==cycleToken||document.hidden||isPaused())return;
 if(!loaded||!views[nextLayer].hasData){
  incoming.style.transition='none';incoming.style.opacity='0';incoming.style.filter='brightness(0.25)';
  rotationState='idle';
  if(refreshDeferred&&!document.hidden){refreshDeferred=false;scheduleRefresh(0);}
  scheduleCycle(1000);return;
 }
 syncLayerView(views[activeLayer],views[nextLayer]);
 rotationState='transitioning';
 setTransitionHint(true);
 incoming.style.pointerEvents='none';
 incoming.style.transition='none';outgoing.style.transition='none';
 incoming.style.opacity='0';incoming.style.filter='brightness(0.25)';
 outgoing.style.opacity='1';outgoing.style.filter='brightness(1)';
 incoming.getBoundingClientRect();
 const transitionStyle=`opacity ${TRANSITION_MS}ms ease-in-out,filter ${TRANSITION_MS}ms ease-in-out`;
 incoming.style.transition=transitionStyle;outgoing.style.transition=transitionStyle;
 incoming.classList.add('is-active');outgoing.classList.remove('is-active');
 transitionRaf=requestAnimationFrame(()=>{
  transitionRaf=0;
  if(token!==cycleToken||rotationState!=='transitioning'||document.hidden)return;
  incoming.style.opacity='1';incoming.style.filter='brightness(1)';
  outgoing.style.opacity='0';outgoing.style.filter='brightness(0.25)';
 });
 currentIndex=nextIndex;
 setActive(nextLayer);
 stateTimer=setTimeout(()=>{
  stateTimer=0;
  if(token!==cycleToken||rotationState!=='transitioning'||document.hidden)return;
  settleTransition();
  preloadNext();
  scheduleCycle(CLEAR_MS);
 },TRANSITION_MS);
}
function setTransitionHint(enabled){
 layers.forEach(layer=>{layer.style.willChange=enabled?'opacity,filter':'auto'});
}
const activePointers=new Set();
function pauseForInteraction(event){
 if(event?.pointerId!==undefined)activePointers.add(event.pointerId);
 if(isPaused())return;
 rotationState='paused';++cycleToken;clearStateTimer();
 initialRevealDone=true;
 if(transitionRaf){cancelAnimationFrame(transitionRaf);transitionRaf=0;}
 const frozen=layers.map(layer=>{
  const style=getComputedStyle(layer);
  return{opacity:style.opacity,filter:style.filter};
 });
 layers.forEach((layer,index)=>{
  layer.style.transition='none';layer.style.opacity=frozen[index].opacity;layer.style.filter=frozen[index].filter;
 });
 setTransitionHint(false);
}
function resumeAfterInteraction(event){
 if(event?.pointerId!==undefined)activePointers.delete(event.pointerId);
 if(activePointers.size>0||!isPaused())return;
 settleTransition();
 if(manualSymbol)armManualReturn(manualSymbol);
 else scheduleCycle(CLEAR_MS);
}
root.addEventListener('pointerdown',pauseForInteraction,{capture:true,passive:true});
window.addEventListener('pointerup',resumeAfterInteraction,{capture:true,passive:true});
window.addEventListener('pointercancel',resumeAfterInteraction,{capture:true,passive:true});
window.addEventListener('blur',()=>{
 if(activePointers.size){activePointers.clear();resumeAfterInteraction();}
},{passive:true});
function armManualReturn(symbol){
 clearStateTimer();
 if(!symbol||manualSymbol!==symbol||document.hidden)return;
 rotationState='manual';
 stateTimer=setTimeout(()=>{
  stateTimer=0;
  if(manualSymbol!==symbol)return;
  manualSymbol='';
  const next=currentSymbol();
  if(!next){root.hidden=true;rotationState='hidden';return;}
  period=periodFor(next);
  setActive(activeLayer);
  scheduleCycle(0);
  scheduleRefresh();
 },CLEAR_MS);
}
function showManualSymbol(value){
 const symbol=String(value||'').trim().toUpperCase();
 if(!/^[A-Z0-9.]+$/.test(symbol))return false;
 manualSymbol=symbol;
 ++cycleToken;clearTransitionWork();rotationState='manual';
 settleTransition();
 root.hidden=false;scheduleChartResize();
 applyLayerState(activeLayer,true,false);
 title.textContent=symbol;status.textContent='正在切换行情…';error.hidden=true;
 period=periodFor(symbol);
 Promise.resolve(setActive(activeLayer)).then(loaded=>{
  if(!loaded||manualSymbol!==symbol||document.hidden)return;
  armManualReturn(symbol);
 });
 scheduleRefresh();
 return true;
}
window.VegasLayer5ShowSymbol=showManualSymbol;
function reconcile(symbols){
 const next=[...new Set((symbols||[]).map(value=>String(value||'').trim().toUpperCase()).filter(value=>/^[A-Z0-9.]+$/.test(value)))];
 if(queueInitialized&&next.length===queue.length&&next.every((symbol,index)=>symbol===queue[index]))return;
 queueInitialized=true;
 ++cycleToken;clearTransitionWork();
 const previous=currentSymbol();
 settleTransition();
 applyLayerState(activeLayer,true,true);
 queue=next;
 if(!next.length&&!manualSymbol){
  ++cycleToken;clearTimers();rotationState='hidden';
  root.hidden=true;currentIndex=0;
  views.forEach(view=>{view.request++;view.symbol='';view.hasData=false;});
  return;
 }
 root.hidden=false;scheduleChartResize();
 currentIndex=Math.max(0,queue.indexOf(previous));
 if(currentIndex>=queue.length)currentIndex=0;
 period=periodFor(currentSymbol());
 setActive(activeLayer);
 if(!manualSymbol){
  if(queue.length>1)preloadNext();
  if(initialRevealDone)scheduleCycle(CLEAR_MS);
 }
 scheduleRefresh();
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  ++cycleToken;clearTimers();clearTransitionWork();rotationState='hidden';setTransitionHint(false);
 }else{
  settleTransition();
  const symbol=currentSymbol();
  if(symbol){
   loadLayer(activeLayer,symbol,periodFor(symbol)).then(loaded=>{
    if(loaded&&manualSymbol===symbol)armManualReturn(symbol);
   });
  }
  if(initialRevealDone&&!manualSymbol)scheduleCycle(CLEAR_MS);
  scheduleRefresh();
 }
},{passive:true});
window.VegasLayer5SetAutoQueue=reconcile;
reconcile(window.VegasFormalSignalSymbols||[]);
getStockMap().catch(()=>{});
if(window.__VEGAS_PENDING_LAYER5_SYMBOL){
 const pending=window.__VEGAS_PENDING_LAYER5_SYMBOL;
 delete window.__VEGAS_PENDING_LAYER5_SYMBOL;
 showManualSymbol(pending);
}
})();