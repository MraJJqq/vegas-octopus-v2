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
let manualTimer=0;
let activeLayer=0,cycleTimer=0,transitionTimer=0,transitionRaf=0,transitioning=false,paused=false;
let cycleToken=0,hidden=document.hidden,refreshTimer=0,fadeState='idle',initialRevealDone=false,initialRevealTimer=0;
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
  endpoint:isStock?'/api/v3/market/history-candles':'/api/v2/mix/market/history-candles',
  params:isStock
   ?{category:'SPOT',symbol:mapped,interval:period,limit:'100'}
   :{symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:period,limit:'200'},
  pageLimit:isStock?100:200
 };
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
  const latest=await fetchCandlePage(context,timeframe,null);
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
function createChart(layer){
 const host=document.createElement('div');host.className='vr-chart';layer.append(host);
 const chart=LWC.createChart(host,{
  autoSize:true,attributionLogo:false,
  layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.72)',fontSize:11},
  grid:{vertLines:{visible:false},horzLines:{visible:false}},
  rightPriceScale:{visible:false,borderVisible:false,mode:LWC.PriceScaleMode.Logarithmic,scaleMargins:{top:.09,bottom:.08}},
  leftPriceScale:{visible:false,borderVisible:false},
  timeScale:{visible:false,borderVisible:false,rightOffset:3,barSpacing:5,minBarSpacing:.5,shiftVisibleRangeOnNewBar:false},
  crosshair:{vertLine:{visible:true,color:'rgba(120,190,230,.18)'},horzLine:{visible:true,color:'rgba(120,190,230,.18)'}},
  handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
  handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}
 });
 const candle=chart.addSeries(LWC.CandlestickSeries,{
  upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',
  wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',lastValueVisible:false,priceLineVisible:false
 });
 const lines=EMAS.map((length,index)=>chart.addSeries(LWC.LineSeries,{
  color:EMA_COLORS[index],lineWidth:index?2:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false
 }));
 return{layer,host,chart,candle,lines,symbol:'',period:'4H',request:0,hasData:false,dataAt:0};
}
const views=layers.map(createChart);
function setData(view,rows,preserveRange=false){
 const timeScale=view.chart.timeScale();
 const visibleRange=preserveRange?timeScale.getVisibleRange():null;
 view.candle.setData(rows);
 view.lines.forEach((series,index)=>series.setData(ema(rows,EMAS[index])));
 if(visibleRange){
  try{timeScale.setVisibleRange(visibleRange)}catch{}
 }
 view.hasData=true;
 view.dataAt=Date.now();
}
function resetDefaultVisibleRange(view,rows){
 if(!rows.length)return;
 const timeScale=view.chart.timeScale();
 const barSpacing=5,rightOffset=3;
 timeScale.applyOptions({barSpacing,rightOffset});
 const width=Math.max(1,view.host.clientWidth||window.innerWidth||1);
 const visibleBars=Math.max(30,Math.floor(width/barSpacing));
 const to=rows.length-1;
 const from=Math.max(0,to-visibleBars+1);
 timeScale.setVisibleLogicalRange({from,to});
}
function updateLayerStatus(index,symbol,rows){
 if(index!==activeLayer||symbol!==currentSymbol())return;
 status.textContent=rows.at(-1).close.toLocaleString('en-US',{maximumFractionDigits:5})+' · '+rows.length+'根K线';
 if(rows.length<676){error.textContent='历史K线不足676根，EMA576/EMA676红峰无法完整显示（当前'+rows.length+'根）';error.hidden=false;}
 else if(rows.length<1200){error.textContent='历史K线正在补齐：'+rows.length+'根';error.hidden=false;}
 else error.hidden=true;
}
async function loadLayer(index,symbol,timeframe){
 if(!symbol)return false;
 const view=views[index],token=++view.request;
 const identityChanged=view.symbol!==symbol||view.period!==timeframe;
 if(identityChanged){view.hasData=false;view.dataAt=0;}
 view.symbol=symbol;view.period=timeframe;
 try{
  /* 首屏只等待最近一页；先画出K线，再在后台补齐EMA所需历史。 */
  const firstRows=await getCandles(symbol,timeframe);
  if(token!==view.request)return false;
  setData(view,firstRows,!identityChanged);
  if(identityChanged)resetDefaultVisibleRange(view,firstRows);
  updateLayerStatus(index,symbol,firstRows);
  if(index===activeLayer&&!initialRevealDone&&!hidden){
   initialRevealDone=true;fadeState='initial-reveal';
   const layer=layers[index];
   layer.style.transition='none';layer.style.opacity='1';layer.style.filter='brightness(0.25)';
   layer.getBoundingClientRect();
   layer.style.transition=`filter ${INITIAL_REVEAL_MS}ms ease-out`;
   requestAnimationFrame(()=>{if(!hidden&&!paused&&index===activeLayer)layer.style.filter='brightness(1)'});
   clearTimeout(initialRevealTimer);
   initialRevealTimer=setTimeout(()=>{
    initialRevealTimer=0;layer.style.transition='';layer.style.filter='brightness(1)';
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
 }else loadLayer(index,symbol,period);
}
function clearTimers(){
 clearTimeout(cycleTimer);clearTimeout(refreshTimer);
 cycleTimer=refreshTimer=0;
}
function scheduleRefresh(){
 clearTimeout(refreshTimer);
 if(hidden||!currentSymbol())return;
 refreshTimer=setTimeout(async()=>{
  const symbol=currentSymbol();
  if(symbol)await loadLayer(activeLayer,symbol,periodFor(symbol));
  scheduleRefresh();
 },15000);
}
function preloadNext(){
 if(manualSymbol||queue.length<2||hidden)return;
 const nextIndex=(currentIndex+1)%queue.length;
 const symbol=queue[nextIndex],timeframe=periodFor(symbol),view=views[1-activeLayer];
 if(view.symbol===symbol&&view.period===timeframe&&view.hasData&&Date.now()-view.dataAt<15000)return;
 loadLayer(1-activeLayer,symbol,timeframe);
}
function clearTransitionWork(){
 clearTimeout(transitionTimer);transitionTimer=0;
 if(transitionRaf){cancelAnimationFrame(transitionRaf);transitionRaf=0;}
}
function applyLayerState(active=activeLayer){
 layers.forEach((layer,index)=>{
  layer.style.transition='none';
  layer.style.opacity=index===active?'1':'0';
  layer.style.filter=index===active?'brightness(1)':'brightness(0.25)';
  layer.classList.toggle('is-active',index===active);
  layer.style.pointerEvents=index===active?'auto':'none';
 });
}
function settleTransition(){
 clearTransitionWork();
 applyLayerState(activeLayer);
 setTransitionHint(false);
 transitioning=false;
 fadeState=paused?'paused':'idle';
}
function scheduleCycle(delay=CLEAR_MS){
 clearTimeout(cycleTimer);
 if(manualSymbol||hidden||paused||queue.length<2)return;
 fadeState='clear';
 const token=++cycleToken;
 cycleTimer=setTimeout(()=>{if(token===cycleToken&&!hidden&&!paused)beginTransition()},delay);
}
async function beginTransition(){
 if(manualSymbol||transitioning||queue.length<2||hidden||paused)return;
 transitioning=true;fadeState='preparing';
 const nextIndex=(currentIndex+1)%queue.length;
 const nextSymbol=queue[nextIndex];
 const nextLayer=1-activeLayer;
 const nextPeriod=periodFor(nextSymbol);
 const token=++cycleToken;
 const outgoing=layers[activeLayer],incoming=layers[nextLayer];
 incoming.style.transition='none';
 incoming.style.opacity='0';incoming.style.filter='brightness(0.25)';
 incoming.classList.remove('is-active');
 const nextView=views[nextLayer];
 const preloaded=nextView.symbol===nextSymbol&&nextView.period===nextPeriod&&nextView.hasData&&Date.now()-nextView.dataAt<15000;
 let loaded=false;
 try{loaded=preloaded||await loadLayer(nextLayer,nextSymbol,nextPeriod)}catch{}
 if(token!==cycleToken||hidden||paused){transitioning=false;fadeState=paused?'paused':'idle';return}
 if(!loaded||!views[nextLayer].hasData){
  incoming.style.transition='none';incoming.style.opacity='0';incoming.style.filter='brightness(0.25)';
  transitioning=false;fadeState='idle';scheduleCycle(1000);return;
 }
 fadeState='transitioning';
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
  if(token!==cycleToken||hidden||paused)return;
  incoming.style.opacity='1';incoming.style.filter='brightness(1)';
  outgoing.style.opacity='0';outgoing.style.filter='brightness(0.25)';
 });
 currentIndex=nextIndex;
 setActive(nextLayer);
 transitionTimer=setTimeout(()=>{
  transitionTimer=0;
  if(token!==cycleToken||hidden||paused)return;
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
 if(paused)return;
 paused=true;++cycleToken;clearTimeout(cycleTimer);cycleTimer=0;
 clearTimeout(initialRevealTimer);initialRevealTimer=0;initialRevealDone=true;
 clearTransitionWork();
 layers.forEach(layer=>{layer.style.transition='none';});
 setTransitionHint(false);
 paused=true;fadeState='paused';
}
function resumeAfterInteraction(event){
 if(event?.pointerId!==undefined)activePointers.delete(event.pointerId);
 if(activePointers.size>0||!paused)return;
 paused=false;settleTransition();
 scheduleCycle(CLEAR_MS);
}
root.addEventListener('pointerdown',pauseForInteraction,{capture:true,passive:true});
window.addEventListener('pointerup',resumeAfterInteraction,{capture:true,passive:true});
window.addEventListener('pointercancel',resumeAfterInteraction,{capture:true,passive:true});
window.addEventListener('blur',()=>{
 if(activePointers.size){activePointers.clear();resumeAfterInteraction()}
},{passive:true});
function showManualSymbol(value){
 const symbol=String(value||'').trim().toUpperCase();
 if(!/^[A-Z0-9.]+$/.test(symbol))return false;
 manualSymbol=symbol;
 clearTimeout(manualTimer);
 ++cycleToken;clearTimeout(cycleTimer);cycleTimer=0;clearTransitionWork();transitioning=false;paused=false;
 settleTransition();
 root.hidden=false;
 layers.forEach((layer,index)=>{
  layer.style.transition='none';
  layer.style.opacity=index===activeLayer?'1':'0';
  layer.style.filter=index===activeLayer?'brightness(1)':'brightness(0.25)';
  layer.classList.toggle('is-active',index===activeLayer);
  layer.style.pointerEvents=index===activeLayer?'auto':'none';
  layer.style.transition='';
 });
 /* 先更新界面反馈，再发起行情请求；不在点击路径中强制同步布局。 */
 title.textContent=symbol;
 status.textContent='正在切换行情…';
 error.hidden=true;
 period=periodFor(symbol);
 setActive(activeLayer);
 scheduleRefresh();
 manualTimer=setTimeout(()=>{
  manualTimer=0;
  manualSymbol='';
  if(!queue.length){
   ++cycleToken;clearTimers();transitioning=false;paused=false;
   root.hidden=true;
   views.forEach(view=>{view.request++;view.symbol='';});
   return;
  }
  currentIndex=Math.max(0,queue.indexOf(symbol));
  if(currentIndex>=queue.length)currentIndex=0;
  period=periodFor(currentSymbol());
  setActive(activeLayer);
  if(queue.length>1)preloadNext();
  scheduleCycle(CLEAR_MS);
  scheduleRefresh();
 },10000);
 return true;
}
window.VegasLayer5ShowSymbol=showManualSymbol;
function reconcile(symbols){
 const next=[...new Set((symbols||[]).map(value=>String(value||'').trim().toUpperCase()).filter(value=>/^[A-Z0-9.]+$/.test(value)))];
 if(queueInitialized&&next.length===queue.length&&next.every((symbol,index)=>symbol===queue[index]))return;
 queueInitialized=true;
 ++cycleToken;clearTimeout(cycleTimer);cycleTimer=0;clearTransitionWork();transitioning=false;
 settleTransition();
 layers.forEach((layer,index)=>{
  layer.style.transition='none';
  layer.style.opacity=index===activeLayer?'1':'0';
  layer.style.filter=index===activeLayer?'brightness(1)':'brightness(0.25)';
  layer.classList.toggle('is-active',index===activeLayer);
  layer.getBoundingClientRect();layer.style.transition='';
 });
 const previous=currentSymbol();
 queue=next;
 if(!next.length&&!manualSymbol){
  ++cycleToken;clearTimers();transitioning=false;paused=false;
  root.hidden=true;currentIndex=0;
  views.forEach(view=>{view.request++;view.symbol='';});
  return;
 }
 root.hidden=false;
 currentIndex=Math.max(0,queue.indexOf(previous));
 if(currentIndex>=queue.length)currentIndex=0;
 period=periodFor(currentSymbol());
 setActive(activeLayer);
 if(!manualSymbol){
  if(queue.length>1)preloadNext();
  if(initialRevealDone)scheduleCycle(CLEAR_MS);
 }else loadLayer(activeLayer,currentSymbol(),periodFor(currentSymbol()));
 scheduleRefresh();
}
document.addEventListener('visibilitychange',()=>{
 hidden=document.hidden;
 if(hidden){++cycleToken;clearTimers();clearTransitionWork();transitioning=false;fadeState='hidden';setTransitionHint(false)}
 else{
  settleTransition();
  const symbol=currentSymbol();
  if(symbol)loadLayer(activeLayer,symbol,periodFor(symbol));
  if(initialRevealDone)scheduleCycle(CLEAR_MS);
  scheduleRefresh();
 }
},{passive:true});
window.VegasLayer5SetAutoQueue=reconcile;
reconcile(window.VegasFormalSignalSymbols||[]);
/* 提前预热股票代码映射，避免首次点击美股卡片时才等待映射接口。 */
getStockMap().catch(()=>{});
if(window.__VEGAS_PENDING_LAYER5_SYMBOL){const pending=window.__VEGAS_PENDING_LAYER5_SYMBOL;delete window.__VEGAS_PENDING_LAYER5_SYMBOL;showManualSymbol(pending);}
})();
