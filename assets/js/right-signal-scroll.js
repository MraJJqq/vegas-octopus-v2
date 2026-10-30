/* 第五层：正式信号K线渐变轮播，双图层交替渲染 */
(()=>{
'use strict';
if(window.__VEGAS_RIGHT_SCROLL_INIT__)return;
window.__VEGAS_RIGHT_SCROLL_INIT__=true;

const API='https://api.bitget.com';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['1H','4H','1D'];
const EMAS=[12,36,43,144,169,576,676];
const EMA_COLORS=['#f5d76e','#f3f6ff','#f3f6ff','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const PERIOD_KEY='vegas-right-track-v1';
const CLEAR_MS=5000,TRANSITION_MS=5000;
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

let queue=[],currentIndex=0,period='4H',periodSettings={};
let activeLayer=0,cycleTimer=0,transitioning=false,paused=false,resumeTimer=0;
let cycleToken=0,loadToken=0,hidden=document.hidden,refreshTimer=0;
let stockMap=null,stockMapAt=0,cache=new Map();

try{
 const saved=JSON.parse(localStorage.getItem(PERIOD_KEY)||'{}');
 periodSettings=Object.fromEntries(Object.entries(saved||{})
  .filter(([,v])=>PERIODS.includes(v?.period))
  .map(([symbol,v])=>[symbol,{period:v.period}]));
}catch{}
const currentSymbol=()=>queue[currentIndex]||'';
const periodFor=s=>PERIODS.includes(periodSettings[s]?.period)?periodSettings[s].period:'4H';
function savePeriods(){try{localStorage.setItem(PERIOD_KEY,JSON.stringify(periodSettings))}catch{}}
function renderPeriods(){
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
 const rows=await getJson('/api/v3/reality/market/stock-info');
 stockMap=new Map(rows.filter(x=>x?.code&&x?.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
 const special=rows.find(x=>x?.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
 if(special)stockMap.set('SKHYNIX',String(special.symbol));
 stockMapAt=Date.now();return stockMap;
}
async function getCandles(symbol,timeframe){
 const key=symbol+'|'+timeframe,cached=cache.get(key);
 if(cached&&Date.now()-cached.at<15000)return cached.rows;
 let rows;
 if(STOCKS.has(symbol)){
  const mapped=(await getStockMap()).get(symbol);
  if(!mapped)throw Error('无现货映射');
  rows=await getJson('/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol:mapped,interval:timeframe,limit:'1000'}));
 }else{
  rows=await getJson('/api/v2/mix/market/candles?'+new URLSearchParams({symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:timeframe,limit:'1000'}));
 }
 const normalized=rows.filter(row=>Array.isArray(row)&&row.slice(0,5).every(v=>Number.isFinite(+v)&&+v>0))
  .map(row=>({time:Math.floor(+row[0]/1000),open:+row[1],high:+row[2],low:+row[3],close:+row[4]}))
  .sort((a,b)=>a.time-b.time);
 if(!normalized.length)throw Error('没有有效K线');
 cache.set(key,{rows:normalized,at:Date.now()});
 while(cache.size>30)cache.delete(cache.keys().next().value);
 return normalized;
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
  rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.09,bottom:.08}},
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
 return{layer,host,chart,candle,lines,symbol:'',period:'4H',request:0};
}
const views=layers.map(createChart);
function setData(view,rows){
 view.candle.setData(rows);
 view.lines.forEach((series,index)=>series.setData(ema(rows,EMAS[index])));
}
async function loadLayer(index,symbol,timeframe){
 if(!symbol)return false;
 const view=views[index],token=++view.request;
 view.symbol=symbol;view.period=timeframe;
 try{
  const rows=await getCandles(symbol,timeframe);
  if(token!==view.request)return false;
  setData(view,rows);
  if(index===activeLayer&&symbol===currentSymbol()){
   status.textContent=rows.at(-1).close.toLocaleString('en-US',{maximumFractionDigits:5});
   error.hidden=true;
  }
  return true;
 }catch(exception){
  if(index===activeLayer&&symbol===currentSymbol()){
   status.textContent='数据异常';error.textContent='行情暂不可用 · '+String(exception.message||exception).slice(0,42);error.hidden=false;
  }
  return false;
 }
}
function setActive(index){
 activeLayer=index;
 layers.forEach((layer,i)=>{
  layer.classList.toggle('is-active',i===index);
  layer.classList.toggle('is-outgoing',i!==index&&transitioning);
  layer.style.pointerEvents=i===index?'auto':'none';
 });
 const symbol=currentSymbol();
 title.textContent=symbol;
 period=periodFor(symbol);
 renderPeriods();
 const view=views[index];
 if(view.symbol===symbol&&view.period===period){
  status.textContent='';error.hidden=true;
 }else loadLayer(index,symbol,period);
}
function clearTimers(){
 clearTimeout(cycleTimer);clearTimeout(refreshTimer);clearTimeout(resumeTimer);
 cycleTimer=refreshTimer=resumeTimer=0;
}
function scheduleCycle(delay=CLEAR_MS){
 clearTimeout(cycleTimer);
 if(hidden||paused||queue.length<2)return;
 const token=++cycleToken;
 cycleTimer=setTimeout(()=>{if(token===cycleToken&&!hidden&&!paused)beginTransition()},delay);
}
async function beginTransition(){
 if(transitioning||queue.length<2||hidden||paused)return;
 transitioning=true;
 const nextIndex=(currentIndex+1)%queue.length;
 const nextSymbol=queue[nextIndex];
 const nextLayer=1-activeLayer;
 const nextPeriod=periodFor(nextSymbol);
 const token=++cycleToken;
 const outgoing=layers[activeLayer],incoming=layers[nextLayer];
 incoming.style.transition='none';
 incoming.classList.remove('is-active','is-outgoing');
 incoming.style.opacity='0';
 incoming.style.filter='blur(12px)';
 await loadLayer(nextLayer,nextSymbol,nextPeriod);
 if(token!==cycleToken||hidden||paused){transitioning=false;return}
 incoming.style.pointerEvents='none';
 incoming.getBoundingClientRect();
 incoming.style.transition='';
 outgoing.style.transition='';
 incoming.classList.add('is-active');
 outgoing.classList.remove('is-active');
 incoming.style.opacity='1';incoming.style.filter='blur(0px)';
 outgoing.style.opacity='0';outgoing.style.filter='blur(12px)';
 currentIndex=nextIndex;
 setActive(nextLayer);
 setTimeout(()=>{
  if(token!==cycleToken)return;
  outgoing.style.transition='none';outgoing.style.opacity='0';outgoing.style.filter='blur(12px)';
  outgoing.classList.remove('is-outgoing');
  outgoing.getBoundingClientRect();outgoing.style.transition='';
  transitioning=false;
  scheduleCycle(CLEAR_MS);
 },TRANSITION_MS);
}
function pauseForInteraction(){
 if(paused)return;
 paused=true;++cycleToken;clearTimeout(cycleTimer);clearTimeout(resumeTimer);
 layers.forEach(layer=>{layer.style.transition='none';});
}
function resumeAfterInteraction(){
 clearTimeout(resumeTimer);
 resumeTimer=setTimeout(()=>{
  paused=false;transitioning=false;
  layers.forEach((layer,i)=>{
   layer.style.transition='none';
   layer.style.opacity=i===activeLayer?'1':'0';
   layer.style.filter=i===activeLayer?'blur(0px)':'blur(12px)';
   layer.classList.toggle('is-active',i===activeLayer);
   layer.getBoundingClientRect();layer.style.transition='';
  });
  scheduleCycle(CLEAR_MS);
 },5000);
}
layers.forEach(layer=>{
 layer.addEventListener('pointerdown',()=>{pauseForInteraction();resumeAfterInteraction()},{capture:true,passive:true});
 layer.addEventListener('wheel',()=>{pauseForInteraction();resumeAfterInteraction()},{capture:true,passive:true});
 layer.addEventListener('touchstart',()=>{pauseForInteraction();resumeAfterInteraction()},{capture:true,passive:true});
});
function reconcile(symbols){
 const next=[...new Set((symbols||[]).map(value=>String(value||'').trim().toUpperCase()).filter(value=>/^[A-Z0-9.]+$/.test(value)))];
 const previous=currentSymbol();
 queue=next;
 if(!next.length){
  ++cycleToken;++loadToken;clearTimers();transitioning=false;paused=false;
  root.hidden=true;currentIndex=0;
  views.forEach(view=>{view.request++;view.symbol='';});
  return;
 }
 root.hidden=false;
 currentIndex=Math.max(0,queue.indexOf(previous));
 if(currentIndex>=queue.length)currentIndex=0;
 period=periodFor(currentSymbol());
 setActive(activeLayer);
 const inactive=1-activeLayer;
 if(queue.length>1)loadLayer(inactive,queue[(currentIndex+1)%queue.length],periodFor(queue[(currentIndex+1)%queue.length]));
 scheduleCycle(CLEAR_MS);
}
document.addEventListener('visibilitychange',()=>{
 hidden=document.hidden;
 if(hidden){++cycleToken;clearTimers()}
 else{
  const symbol=currentSymbol();
  if(symbol)loadLayer(activeLayer,symbol,periodFor(symbol));
  scheduleCycle(CLEAR_MS);
 }
},{passive:true});
window.addEventListener('resize',()=>views.forEach(view=>view.chart.applyOptions({width:Math.max(1,view.host.clientWidth),height:Math.max(1,view.host.clientHeight)})),{passive:true});
if('ResizeObserver'in window){
 const observer=new ResizeObserver(()=>views.forEach(view=>view.chart.applyOptions({width:Math.max(1,view.host.clientWidth),height:Math.max(1,view.host.clientHeight)})));
 views.forEach(view=>observer.observe(view.host));
}
window.VegasLayer5SetAutoQueue=reconcile;
reconcile(window.VegasFormalSignalSymbols||[]);
})();
