/* 右滚动：仅展示正式信号品种的多K线卡片。独立于冻结的左滚动。 */
(()=> {
'use strict';
if(window.__VEGAS_RIGHT_SCROLL_INIT__)return;
window.__VEGAS_RIGHT_SCROLL_INIT__=true;
const API='https://api.bitget.com';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['1H','4H','1D'];
const EMA_LINES=[12,36,43,144,169,576,676];
const EMA_COLORS=['#f5d76e','#54B8D0','#54B8D0','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const root=document.getElementById('vegas-right-scroll');
const LWC=window.LightweightCharts;
if(!root||!LWC){console.error('[Vegas Right Scroll] missing host or chart library');return;}
const list=root.querySelector('.vr-list');
const cache=new Map(),cards=new Map(),saved=readSaved();
let queue=[],requestQueue=[],activeRequests=0,autoFrame=0,lastFrame=0,paused=false,pauseUntil=0,refreshTimer=0;
const MAX_REQUESTS=2,REFRESH_MS=30000,AUTO_SPEED=7;
function readSaved(){try{return JSON.parse(localStorage.getItem('vegas-right-scroll-v1')||'{}')}catch{return {}}}
function persist(){try{localStorage.setItem('vegas-right-scroll-v1',JSON.stringify(saved))}catch{}}
function symbolFor(s){return s+'USDT'}
function ema(values,n){const out=new Array(values.length).fill(null);if(values.length<n)return out;let sum=0;for(let i=0;i<n;i++)sum+=values[i];let p=sum/n;out[n-1]=p;const k=2/(n+1);for(let i=n;i<values.length;i++){p=values[i]*k+p*(1-k);out[i]=p}return out}
async function fetchJson(path){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);
 try{const r=await fetch(API+path,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.code!=='00000'||!Array.isArray(j.data))throw Error(j.msg||'行情响应无效');return j.data}
 finally{clearTimeout(timer)}
}
let stockMap=null,stockMapAt=0,stockMapPromise=null;
async function stockSymbol(s){
 if(!stockMap||Date.now()-stockMapAt>300000){
  if(!stockMapPromise)stockMapPromise=(async()=>{
   const rows=await fetchJson('/api/v3/reality/market/stock-info');
   const next=new Map(rows.filter(x=>x&&x.code&&x.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
   const sk=rows.find(x=>x&&x.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
   if(sk)next.set('SKHYNIX',String(sk.symbol));stockMap=next;stockMapAt=Date.now();
  })().finally(()=>{stockMapPromise=null});
  await stockMapPromise;
 }
 const value=stockMap.get(s);if(!value)throw Error('无现货映射');return value;
}
async function getCandles(symbol,period){
 const key=symbol+'|'+period,hit=cache.get(key);
 if(hit&&Date.now()-hit.at<REFRESH_MS)return hit.data;
 let rows;
 if(STOCKS.has(symbol)){const mapped=await stockSymbol(symbol);rows=await fetchJson('/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol:mapped,interval:period,limit:'1000'}))}
 else rows=await fetchJson('/api/v2/mix/market/candles?'+new URLSearchParams({symbol:symbolFor(symbol),productType:'USDT-FUTURES',granularity:period,limit:'1000'}));
 const data=rows.filter(r=>Array.isArray(r)&&r.slice(0,5).every(v=>Number.isFinite(Number(v))&&Number(v)>0))
 .map(r=>({time:Math.floor(Number(r[0])/1000),open:+r[1],high:+r[2],low:+r[3],close:+r[4]})).sort((a,b)=>a.time-b.time);
 const unique=[];for(const c of data){if(unique.length&&unique[unique.length-1].time===c.time)unique[unique.length-1]=c;else unique.push(c)}
 if(!unique.length)throw Error('没有有效K线');cache.set(key,{data:unique,at:Date.now()});
 while(cache.size>24)cache.delete(cache.keys().next().value);
 return unique;
}
function enqueue(task){requestQueue.push(task);pump()}
function pump(){while(activeRequests<MAX_REQUESTS&&requestQueue.length){const task=requestQueue.shift();activeRequests++;task().catch(()=>{}).finally(()=>{activeRequests--;pump()})}}
function makeCard(symbol){
 const el=document.createElement('article');el.className='vr-card';el.dataset.symbol=symbol;
 el.innerHTML='<header class="vr-head"><strong></strong><span class="vr-status">加载行情…</span><nav class="vr-periods" aria-label="K线周期"></nav></header><div class="vr-chart"></div><div class="vr-error" hidden></div>';
 el.querySelector('strong').textContent=symbol;
 const nav=el.querySelector('.vr-periods');
 const view=saved[symbol]||{period:'4H'};if(!PERIODS.includes(view.period))view.period='4H';
 const chart=LWC.createChart(el.querySelector('.vr-chart'),{
  autoSize:true,attributionLogo:false,
  layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.68)',fontSize:10,fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
  grid:{vertLines:{visible:false},horzLines:{visible:false}},
  rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.08,bottom:.08}},leftPriceScale:{visible:false,borderVisible:false},
  timeScale:{visible:false,borderVisible:false,rightOffset:2,barSpacing:4,minBarSpacing:.5,shiftVisibleRangeOnNewBar:false},
  crosshair:{vertLine:{visible:false},horzLine:{visible:false}},
  handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
  handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:false,axisDoubleClickReset:false},
  kineticScroll:{touch:true,mouse:true}
 });
 const candle=chart.addSeries(LWC.CandlestickSeries,{upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',lastValueVisible:false,priceLineVisible:false});
 const lines=EMA_LINES.map((n,i)=>chart.addSeries(LWC.LineSeries,{color:EMA_COLORS[i],lineWidth:i===3||i===4?2:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}));
 const card={symbol,el,chart,candle,lines,period:view.period,data:[],timer:0,interaction:false,rangeSaved:null,disposed:false,refreshing:false};
 function setPeriod(p){if(!PERIODS.includes(p)||p===card.period)return;card.period=p;view.period=p;saved[symbol]=view;persist();nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.period===p));loadCard(card,true)}
 PERIODS.forEach(p=>{const b=document.createElement('button');b.type='button';b.textContent=p;b.dataset.period=p;b.classList.toggle('active',p===card.period);b.addEventListener('click',()=>setPeriod(p));nav.appendChild(b)});
 let pointerCount=0;
 el.querySelector('.vr-chart').addEventListener('pointerdown',()=>{pointerCount++;card.interaction=true;pauseScroll()},{passive:true});
 window.addEventListener('pointerup',()=>{if(pointerCount){pointerCount=0;card.interaction=false;resumeChart(card)}},{passive:true});
 window.addEventListener('pointercancel',()=>{pointerCount=0;card.interaction=false;resumeChart(card)},{passive:true});
 chart.timeScale().subscribeVisibleTimeRangeChange(range=>{if(!range||card.disposed||!card.data.length)return;card.rangeSaved=range;view.range=range;saved[symbol]=view;persist()});
 card.destroy=()=>{card.disposed=true;if(card.timer)clearTimeout(card.timer);chart.remove();};
 cards.set(symbol,card);return card;
}
function setData(card,data,initial=false){
 if(card.disposed)return;
 card.data=data;card.candle.setData(data);
 const closes=data.map(x=>x.close);
 card.lines.forEach((line,i)=>line.setData(ema(closes,EMA_LINES[i]).map((v,j)=>v==null?null:{time:data[j].time,value:v}).filter(Boolean)));
 const view=saved[card.symbol]||{};
 if(view.range&&!initial){try{card.chart.timeScale().setVisibleRange(view.range)}catch{card.chart.timeScale().fitContent()}}
 else card.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-100),to:data.length});
 const last=data[data.length-1];card.el.querySelector('.vr-status').textContent=last.close.toLocaleString('en-US',{maximumFractionDigits:5});
 card.el.querySelector('.vr-error').hidden=true;
}
function loadCard(card,force=false){
 if(card.disposed||card.refreshing||document.hidden)return;
 card.refreshing=true;
 enqueue(async()=>{
  if(card.disposed||document.hidden)return;
  try{const data=await getCandles(card.symbol,card.period);if(!card.disposed)setData(card,data,force)}
  catch(e){if(!card.disposed){const err=card.el.querySelector('.vr-error');err.hidden=false;err.textContent='行情暂不可用 · '+String(e.message||e).slice(0,36);card.el.querySelector('.vr-status').textContent='数据异常'}}
  finally{card.refreshing=false;if(!card.disposed){if(card.timer)clearTimeout(card.timer);card.timer=setTimeout(()=>loadCard(card),REFRESH_MS)}}
 });
}
function pauseScroll(){paused=true;if(autoFrame){cancelAnimationFrame(autoFrame);autoFrame=0}lastFrame=0}
function resumeChart(card){
 const data=card.data;if(!data.length)return;
 const ts=card.chart.timeScale(),targetFrom=Math.max(0,data.length-100),targetTo=data.length;
 let current;try{current=ts.getVisibleLogicalRange()}catch{}
 if(!current){ts.setVisibleLogicalRange({from:targetFrom,to:targetTo});return}
 const start=performance.now(),duration=1100,from=current.from,to=current.to;
 function step(now){if(card.disposed||card.interaction)return;const t=Math.min(1,(now-start)/duration),e=1-Math.pow(1-t,3);ts.setVisibleLogicalRange({from:from+(targetFrom-from)*e,to:to+(targetTo-to)*e});if(t<1)requestAnimationFrame(step)}
 requestAnimationFrame(step);
 pauseUntil=performance.now()+1200;paused=false;startScroll();
}
function startScroll(){if(document.hidden||autoFrame||paused)return;autoFrame=requestAnimationFrame(scrollStep)}
function scrollStep(now){autoFrame=0;if(document.hidden||paused)return;if(!lastFrame)lastFrame=now;const dt=Math.min(50,now-lastFrame);lastFrame=now;const first=list.firstElementChild;if(first&&list.children.length>1){list.scrollTop+=AUTO_SPEED*dt/1000;const gap=parseFloat(getComputedStyle(list).rowGap)||0;const step=first.getBoundingClientRect().height+gap;if(step>0&&list.scrollTop>=step){list.appendChild(first);list.scrollTop-=step}}startScroll()}
function syncLeftBoundary(){
 const left=document.querySelector('#market-cards-layer .mc-columns');if(!left)return;
 const apply=()=>{root.style.left=Math.round(left.getBoundingClientRect().right)+'px'};
 apply();if(window.ResizeObserver){const ro=new ResizeObserver(apply);ro.observe(left);ro.observe(document.documentElement)}
 window.addEventListener('resize',apply,{passive:true});
}
function reconcile(symbols){
 const next=Array.from(new Set((symbols||[]).map(s=>String(s||'').trim().toUpperCase()).filter(s=>/^[A-Z0-9.]+$/.test(s))));
 queue=next;
 for(const [symbol,card] of cards){if(!queue.includes(symbol)){card.destroy();cards.delete(symbol);card.el.remove();cache.forEach((v,k)=>{if(k.startsWith(symbol+'|'))cache.delete(k)})}}
 for(const symbol of queue){if(!cards.has(symbol)){const card=makeCard(symbol);list.appendChild(card.el);loadCard(card,true)}}
 root.hidden=queue.length===0;
 if(queue.length){startScroll()}else{pauseScroll();list.scrollTop=0}
}
window.VegasLayer5SetAutoQueue=reconcile;
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseScroll();cards.forEach(c=>{if(c.timer)clearTimeout(c.timer);c.timer=0})}else{cards.forEach(c=>loadCard(c,true));startScroll()}},{passive:true});
window.addEventListener('pagehide',()=>{pauseScroll();cards.forEach(c=>{if(c.timer)clearTimeout(c.timer);c.timer=0})});
syncLeftBoundary();
reconcile(window.VegasFormalSignalSymbols||[]);
})();
