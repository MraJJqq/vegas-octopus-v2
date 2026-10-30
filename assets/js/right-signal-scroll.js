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
root.querySelector('.vr-single').append(track);
const host=document.createElement('div');
host.className='vr-chart';

const nav=root.querySelector('.vr-periods');
const title=root.querySelector('.vr-symbol');
const status=root.querySelector('.vr-status');
const error=root.querySelector('.vr-error');

let queue=[],panels=[],current='',period='4H',data=[],sharedRange=null;
let periodSettings={},cache=new Map(),stockMap=null,stockMapAt=0;
let requestId=0,raf=0,lastFrame=0,offset=0,paused=false;
let hidden=document.hidden,refreshTimer=0,resumeTimer=0,wheelDelta=0,touchStart=null;
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
 }
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

function stopAnimation(){
 if(raf)cancelAnimationFrame(raf);
 raf=0;
}
function startAnimation(){
 if(hidden||paused||queue.length<2||raf)return;
 lastFrame=0;
 raf=requestAnimationFrame(tick);
}
function pauseAnimation(){
 paused=true;
 stopAnimation();
 clearTimeout(resumeTimer);
 resumeTimer=setTimeout(()=>{
  paused=false;
  startAnimation();
 },1800);
}
function rotate(direction){
 if(panels.length<2)return;
 const panel=direction>0?panels.shift():panels.pop();
 if(direction>0){
  track.append(panel.element);
  panels.push(panel);
 }else{
  track.prepend(panel.element);
  panels.unshift(panel);
 }
 offset=0;
 track.style.transform='translate3d(0,0,0)';
 focus(panels[0].symbol);
}
function manualMove(direction){
 if(panels.length<2)return;
 pauseAnimation();
 rotate(direction>0?1:-1);
}
function tick(now){
 raf=0;
 if(hidden||paused||queue.length<2)return;
 if(!lastFrame)lastFrame=now;
 const elapsed=Math.min(40,now-lastFrame);
 lastFrame=now;
 offset+=elapsed*.00022*innerHeight;
 if(offset>=innerHeight){
  offset-=innerHeight;
  const first=panels.shift();
  track.append(first.element);
  panels.push(first);
  track.style.transform='translate3d(0,0,0)';
  focus(panels[0].symbol);
 }else{
  track.style.transform='translate3d(0,'+(-offset)+'px,0)';
 }
 raf=requestAnimationFrame(tick);
}

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
  root.hidden=true;
  current='';
  panels=[];
  track.replaceChildren();
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
 startAnimation();
}

host.addEventListener('pointerdown',event=>{
 pauseAnimation();
 if(event.pointerType==='touch')touchStart={x:event.clientX,y:event.clientY};
},{passive:true});
host.addEventListener('pointerup',event=>{
 if(!touchStart)return;
 const deltaY=event.clientY-touchStart.y;
 const deltaX=event.clientX-touchStart.x;
 touchStart=null;
 if(Math.abs(deltaY)>45&&Math.abs(deltaY)>Math.abs(deltaX)*1.2){
  manualMove(deltaY<0?1:-1);
 }
},{passive:true});
host.addEventListener('wheel',event=>{
 if(Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
 event.preventDefault();
 pauseAnimation();
 wheelDelta+=event.deltaY;
 if(Math.abs(wheelDelta)>=55){
  manualMove(wheelDelta>0?1:-1);
  wheelDelta=0;
 }
},{passive:false});
window.addEventListener('pointerup',()=>{
 if(!paused)return;
 clearTimeout(resumeTimer);
 resumeTimer=setTimeout(()=>{
  paused=false;
  startAnimation();
 },1800);
},{passive:true});
document.addEventListener('visibilitychange',()=>{
 hidden=document.hidden;
 if(hidden){
  stopAnimation();
  clearTimeout(refreshTimer);
 }else{
  loadActive();
  startAnimation();
 }
});
window.addEventListener('resize',()=>{
 if(host.isConnected){
  chart.applyOptions({
   width:Math.max(1,host.clientWidth),
   height:Math.max(1,host.clientHeight)
  });
 }
},{passive:true});

window.VegasLayer5SetAutoQueue=reconcile;
reconcile(window.VegasFormalSignalSymbols||[]);
})();