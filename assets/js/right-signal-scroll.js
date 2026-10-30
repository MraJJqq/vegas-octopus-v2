/* 右滚动：单图表实例、纵向信号队列、全局共享视窗 */
(()=>{
'use strict';
if(window.__VEGAS_RIGHT_SCROLL_INIT__)return;
window.__VEGAS_RIGHT_SCROLL_INIT__=true;

const API='https://api.bitget.com';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['1H','4H','1D'];
const EMAS=[12,36,43,144,169,576,676];
const EMA_COLORS=['#f5d76e','#f3f6ff','#f3f6ff','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const RANGE_KEY='vegas-right-global-range-v1';
const PERIOD_KEY='vegas-right-track-v1';
const root=document.getElementById('vegas-right-scroll');
const LWC=window.LightweightCharts;
if(!root||!LWC)return;

const track=document.createElement('div');
track.className='vr-track';
track.style.scrollBehavior='auto';
root.querySelector('.vr-single').append(track);
const host=document.createElement('div');
host.className='vr-chart';

const nav=root.querySelector('.vr-periods');
const title=root.querySelector('.vr-symbol');
const status=root.querySelector('.vr-status');
const error=root.querySelector('.vr-error');

let queue=[],panels=[],current='',period='4H',data=[],sharedRange=null;
let periodSettings={},cache=new Map(),stockMap=null,stockMapAt=0;
let requestId=0;
let hidden=document.hidden,refreshTimer=0;
let applyingRange=false,rangeApplyFrame=0;

try{
 const saved=JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}');
 periodSettings=Object.fromEntries(Object.entries(saved||{})
  .filter(([,v])=>PERIODS.includes(v?.period))
  .map(([symbol,v])=>[symbol,{period:v.period}]));
}catch{}
try{sharedRange=JSON.parse(localStorage.getItem(RANGE_KEY)||'null')}catch{}

const periodFor=s=>PERIODS.includes(periodSettings[s]?.period)?periodSettings[s].period:'4H';
function savePeriods(){
 try{localStorage.setItem(PERIOD_KEY,JSON.stringify(periodSettings))}catch{}
}
function saveRange(){
 try{localStorage.setItem(RANGE_KEY,JSON.stringify(sharedRange))}catch{}
}
function renderPeriods(){
 nav.replaceChildren();
 PERIODS.forEach(value=>{
  const button=document.createElement('button');
  button.type='button';
  button.textContent=value;
  button.classList.toggle('active',value===period);
  button.addEventListener('click',()=>{
   if(value===period)return;
   period=value;
   if(current){periodSettings[current]={period};savePeriods()}
   renderPeriods();
   loadActive();
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
 const rows=await getJson('/api/v3/reality/market/stock-info');
 stockMap=new Map(rows.filter(x=>x?.code&&x?.symbol)
  .map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
 const special=rows.find(x=>x?.symbol&&(
  /SKHYNIX/i.test(String(x.code||''))||
  /SK\s*HYNIX/i.test(String(x.name||''))||
  /RSKHYUSDT/i.test(String(x.symbol||''))));
 if(special)stockMap.set('SKHYNIX',String(special.symbol));
 stockMapAt=Date.now();
 return stockMap;
}
async function getCandles(symbol,timeframe){
 const key=symbol+'|'+timeframe;
 const cached=cache.get(key);
 if(cached&&Date.now()-cached.at<15000)return cached.rows;
 let rows;
 if(STOCKS.has(symbol)){
  const map=await getStockMap();
  const mapped=map.get(symbol);
  if(!mapped)throw Error('无现货映射');
  rows=await getJson('/api/v3/market/candles?'+new URLSearchParams({
   category:'SPOT',symbol:mapped,interval:timeframe,limit:'1000'
  }));
 }else{
  rows=await getJson('/api/v2/mix/market/candles?'+new URLSearchParams({
   symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:timeframe,limit:'1000'
  }));
 }
 const normalized=rows
  .filter(row=>Array.isArray(row)&&row.slice(0,5).every(v=>Number.isFinite(+v)&&+v>0))
  .map(row=>({
   time:Math.floor(+row[0]/1000),open:+row[1],high:+row[2],
   low:+row[3],close:+row[4]
  }))
  .sort((a,b)=>a.time-b.time);
 if(!normalized.length)throw Error('没有有效K线');
 cache.set(key,{rows:normalized,at:Date.now()});
 while(cache.size>30)cache.delete(cache.keys().next().value);
 return normalized;
}

function ema(periodLength){
 if(data.length<periodLength)return[];
 let value=data.slice(0,periodLength).reduce((sum,row)=>sum+row.close,0)/periodLength;
 const result=[{time:data[periodLength-1].time,value}];
 const factor=2/(periodLength+1);
 for(let i=periodLength;i<data.length;i++){
  value=data[i].close*factor+value*(1-factor);
  result.push({time:data[i].time,value});
 }
 return result;
}

const chart=LWC.createChart(host,{
 autoSize:true,attributionLogo:false,
 layout:{
  background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},
  textColor:'rgba(210,232,255,.72)',fontSize:11
 },
 grid:{vertLines:{visible:false},horzLines:{visible:false}},
 rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.09,bottom:.08}},
 leftPriceScale:{visible:false,borderVisible:false},
 timeScale:{
  visible:false,borderVisible:false,rightOffset:3,barSpacing:5,
  minBarSpacing:.5,shiftVisibleRangeOnNewBar:false
 },
 crosshair:{
  vertLine:{visible:true,color:'rgba(120,190,230,.18)'},
  horzLine:{visible:true,color:'rgba(120,190,230,.18)'}
 },
 handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},
 handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true}
});
const candle=chart.addSeries(LWC.CandlestickSeries,{
 upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',
 borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',
 wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',
 lastValueVisible:false,priceLineVisible:false
});
const emaSeries=EMAS.map((length,index)=>chart.addSeries(LWC.LineSeries,{
 color:EMA_COLORS[index],lineWidth:index?2:1,
 lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false
}));

function applySharedRange(){
 if(!data.length)return;
 const bars=Math.max(5,Math.min(data.length,Number(sharedRange?.bars)||110));
 const fromEnd=Math.max(0,Math.min(data.length-1,Number(sharedRange?.fromEnd)||0));
 const to=Math.max(1,data.length-fromEnd);
 const from=Math.max(0,to-bars);
 applyingRange=true;
 try{chart.timeScale().setVisibleLogicalRange({from,to})}catch{}
 if(rangeApplyFrame)cancelAnimationFrame(rangeApplyFrame);
 rangeApplyFrame=requestAnimationFrame(()=>{
  applyingRange=false;
  rangeApplyFrame=0;
 });
}
chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{
 if(!range||applyingRange||!data.length)return;
 sharedRange={
  bars:Math.max(5,Math.min(data.length,Math.round(range.to-range.from))),
  fromEnd:Math.max(0,Math.round(data.length-range.to))
 };
 saveRange();
});
function setChart(rows){
 data=rows;
 candle.setData(rows);
 emaSeries.forEach((series,index)=>series.setData(ema(EMAS[index])));
 if(!sharedRange)sharedRange={bars:Math.min(110,rows.length),fromEnd:0};
 applySharedRange();
}

function createPanel(symbol){
 const element=document.createElement('section');
 element.className='vr-panel';
 element.dataset.symbol=symbol;
 return{symbol,element};
}
function mountChart(){
 const panel=panels.find(item=>item.symbol===current);
 if(!panel)return;
 panel.element.append(host);
 requestAnimationFrame(()=>{
  chart.applyOptions({
   width:Math.max(1,host.clientWidth),
   height:Math.max(1,host.clientHeight)
  });
 });
}
function buildTrack(){
 track.replaceChildren();
 panels=queue.map(createPanel);
 panels.forEach(item=>track.append(item.element));
 track.scrollTop=0;cachedPanelStep=0;lastObservedScrollTop=0;
 mountChart();
}
function focus(symbol){
 if(!symbol||symbol===current)return;
 current=symbol;
 period=periodFor(symbol);
 title.textContent=symbol;
 renderPeriods();
 mountChart();
 loadActive();
}
async function loadActive(){
 const symbol=current,timeframe=period,id=++requestId;
 if(!symbol)return;
 status.textContent='加载行情…';
 error.hidden=true;
 try{
  const rows=await getCandles(symbol,timeframe);
  if(id!==requestId||symbol!==current||timeframe!==period)return;
  setChart(rows);
  status.textContent=rows.at(-1).close.toLocaleString('en-US',{maximumFractionDigits:5});
 }catch(exception){
  if(id===requestId){
   status.textContent='数据异常';
   error.textContent='行情暂不可用 · '+String(exception.message||exception).slice(0,42);
   error.hidden=false;
  }
 }finally{
  clearTimeout(refreshTimer);
  if(!hidden&&current===symbol)refreshTimer=setTimeout(loadActive,15000);
 }
}

/* 左滚动控制器移植：原生 scrollTop、连续触屏、滚轮、缓动与循环校正 */
let cachedPanelStep=0,autoFrame=0,manualTarget=0,manualVelocity=0,manualFrame=0,manualLastTime=0;
let autoResumeAt=0,touchActive=false,touchDragging=false,touchStartY=0,touchLastY=0;
let autoLastTime=0,autoEngageLastTime=0,autoEngage=1,autoRemainder=0,autoTimer=0;
let lastObservedScrollTop=0,normalizing=false,loopDirection=1;
function panelStep(){
 if(cachedPanelStep>0)return cachedPanelStep;
 const first=panels[0]?.element,second=panels[1]?.element;
 cachedPanelStep=first?(second?Math.max(0,second.offsetTop-first.offsetTop):first.offsetHeight):0;
 return cachedPanelStep||innerHeight;
}
function stopAnimation(){
 if(autoFrame){cancelAnimationFrame(autoFrame);autoFrame=0}
 if(autoTimer){clearTimeout(autoTimer);autoTimer=0}
 autoLastTime=0;autoEngageLastTime=0;
}
function normalizeLoopPosition(direction){
 if(normalizing||panels.length<2)return 0;
 const step=panelStep();if(step<1)return 0;
 normalizing=true;
 let top=track.scrollTop,shift=0,guard=0;
 if(direction<0){
  while(top<=0&&guard++<panels.length){
   const last=panels.pop();track.insertBefore(last.element,track.firstChild);panels.unshift(last);
   top+=step;shift+=step;
  }
 }else{
  while(top>=step&&guard++<panels.length){
   const first=panels.shift();track.append(first.element);panels.push(first);
   top-=step;shift-=step;
  }
 }
 if(Math.abs(top-track.scrollTop)>.1)track.scrollTop=top;
 if(manualFrame&&shift)manualTarget+=shift;
 lastObservedScrollTop=track.scrollTop;
 normalizing=false;
 if(shift&&panels[0]?.symbol)focus(panels[0].symbol);
 return shift;
}
function moveLoop(delta,direction,source){
 if(!Number.isFinite(delta)||Math.abs(delta)<.01)return;
 loopDirection=direction<0?-1:1;
 track.scrollTop+=delta;
 normalizeLoopPosition(loopDirection);
 if(source==='manual')manualTarget=track.scrollTop;
 lastObservedScrollTop=track.scrollTop;
}
function scheduleAutoScroll(){
 if(hidden||autoFrame||autoTimer)return;
 autoTimer=setTimeout(()=>{
  autoTimer=0;
  if(!hidden)autoFrame=requestAnimationFrame(runAutoScroll);
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
   const step=panelStep();
   if(panels.length>1&&step>0){
    const speed=Math.max(.1,step*panels.length/120);
    autoRemainder+=speed*autoEngage*dt;
    const movement=Math.floor(autoRemainder);
    if(movement>=1){autoRemainder-=movement;moveLoop(movement,1,'auto')}
   }
  }
 }catch(exception){console.warn('[Vegas Right Scroll] auto-scroll recovered:',exception)}
 finally{scheduleAutoScroll()}
}
function applyManualDelta(delta,source){
 if(Math.abs(delta)<.1)return;
 const now=performance.now();
 autoResumeAt=now+(source==='touch'?1600:180);
 autoEngage=Math.min(autoEngage,.28);autoEngageLastTime=now;
 const direction=delta<0?-1:1;
 if(!manualFrame){manualTarget=track.scrollTop;manualVelocity=0;manualLastTime=0}
 const reversing=manualVelocity!==0&&Math.sign(manualVelocity)!==Math.sign(delta);
 if(reversing){manualTarget=track.scrollTop+delta*1.12;manualVelocity=delta*.018}
 else{manualTarget+=delta*1.28;manualVelocity=Math.max(-1.2,Math.min(1.2,manualVelocity+delta*.022))}
 loopDirection=direction;
 if(!manualFrame)manualFrame=requestAnimationFrame(runManualScroll);
}
function runManualScroll(now){
 try{
  if(!manualLastTime)manualLastTime=now;
  const dt=Math.min(32,Math.max(1,now-manualLastTime));manualLastTime=now;
  const current=track.scrollTop,diff=manualTarget-current,ease=1-Math.exp(-dt/72);
  moveLoop(diff*ease,Math.sign(diff)||loopDirection,'manual');
  manualVelocity*=Math.exp(-dt/180);
  if(Math.abs(manualVelocity)>.008)manualTarget+=manualVelocity*dt;
  else manualVelocity=0;
  if(Math.abs(manualVelocity)<.025&&Math.abs(manualTarget-track.scrollTop)<.5){
   manualTarget=track.scrollTop;manualVelocity=0;manualFrame=0;manualLastTime=0;
   autoResumeAt=Math.max(autoResumeAt,now+(touchActive?1400:80));
   return;
  }
  manualFrame=requestAnimationFrame(runManualScroll);
 }catch(exception){
  manualTarget=track.scrollTop;manualVelocity=0;manualFrame=0;manualLastTime=0;
  autoResumeAt=performance.now()+120;
  console.warn('[Vegas Right Scroll] manual-scroll recovered:',exception);
 }
}
track.addEventListener('wheel',event=>{
 if(Math.abs(event.deltaY)<.1)return;
 event.preventDefault();event.stopPropagation();
 const unit=event.deltaMode===1?16:event.deltaMode===2?track.clientHeight:1;
 applyManualDelta(event.deltaY*unit,'wheel');
},{passive:false,capture:true});
track.addEventListener('touchstart',event=>{
 if(event.touches.length!==1)return;
 const touch=event.touches[0];
 if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
 manualLastTime=0;manualVelocity=0;
 touchStartY=touchLastY=touch.clientY;touchActive=true;touchDragging=false;
 manualTarget=track.scrollTop;autoResumeAt=performance.now()+1600;autoEngage=0;
},{passive:true});
track.addEventListener('touchmove',event=>{
 if(event.touches.length!==1||!touchActive)return;
 const y=event.touches[0].clientY,delta=touchLastY-y;
 if(!touchDragging&&Math.abs(y-touchStartY)<3){touchLastY=y;return}
 touchDragging=true;event.preventDefault();
 if(Math.abs(delta)>.1){touchLastY=y;applyManualDelta(delta,'touch')}else touchLastY=y;
},{passive:false});
function finishTouch(){
 touchActive=false;touchDragging=false;touchStartY=touchLastY=0;
 autoResumeAt=performance.now()+1400;
}
track.addEventListener('touchend',finishTouch,{passive:true});
track.addEventListener('touchcancel',finishTouch,{passive:true});
document.addEventListener('visibilitychange',()=>{
 hidden=document.hidden;
 if(hidden){
  stopAnimation();clearTimeout(refreshTimer);
  if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
  manualLastTime=0;manualVelocity=0;manualTarget=track.scrollTop;
 }else{
  loadActive();autoLastTime=0;autoEngageLastTime=0;
  autoResumeAt=performance.now()+250;scheduleAutoScroll();
 }
},{passive:true});
window.addEventListener('resize',()=>{
 cachedPanelStep=0;
 if(host.isConnected&&chart)requestAnimationFrame(()=>chart.applyOptions({
  width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)
 }));
},{passive:true});
if('ResizeObserver' in window){
 const rightResizeObserver=new ResizeObserver(()=>{
  cachedPanelStep=0;
  if(host.isConnected&&chart)chart.applyOptions({
   width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)
  });
 });
 rightResizeObserver.observe(track);
 rightResizeObserver.observe(root);
}
track.addEventListener('scroll',()=>{
 if(normalizing)return;
 const current=track.scrollTop,delta=current-lastObservedScrollTop;
 if(!manualFrame&&!touchActive&&Math.abs(delta)>.5){
  loopDirection=delta<0?-1:1;
  normalizeLoopPosition(loopDirection);
  manualTarget=track.scrollTop;manualVelocity=0;
 }
 lastObservedScrollTop=track.scrollTop;
},{passive:true});
function reconcile(symbols){
 const next=[...new Set((symbols||[])
  .map(value=>String(value||'').trim().toUpperCase())
  .filter(value=>/^[A-Z0-9.]+$/.test(value)))];
 const previous=current;
 queue=next;
 if(!next.length){
  requestId++;
  clearTimeout(refreshTimer);
  stopAnimation();
  if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
  root.hidden=true;
  current='';
  panels=[];
  track.replaceChildren();track.scrollTop=0;cachedPanelStep=0;lastObservedScrollTop=0;
  return;
 }
 root.hidden=false;
 if(!queue.includes(previous)){
  current=queue[0];
  period=periodFor(current);
 }else{
  current=previous;
 }
 title.textContent=current;
 renderPeriods();
 buildTrack();
 loadActive();
 scheduleAutoScroll();
}

window.VegasLayer5SetAutoQueue=reconcile;
reconcile(window.VegasFormalSignalSymbols||[]);
scheduleAutoScroll();
})();