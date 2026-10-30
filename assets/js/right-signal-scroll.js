/* 右滚动：单图轮播，仅展示当前正式信号品种。独立于冻结的左滚动。 */
(()=> {
'use strict';
if(window.__VEGAS_RIGHT_SCROLL_INIT__)return;
window.__VEGAS_RIGHT_SCROLL_INIT__=true;
const API='https://api.bitget.com';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['1H','4H','1D'], EMA_LINES=[12,36,43,144,169,576,676];
const EMA_COLORS=['#f5d76e','#f3f6ff','#f3f6ff','#f4d35e','#f4d35e','#ff4e5e','#ff4e5e'];
const ROTATE_MS=9000, REFRESH_MS=15000, MAX_REQUESTS=2;
const root=document.getElementById('vegas-right-scroll'), LWC=window.LightweightCharts;
if(!root||!LWC){console.error('[Vegas Right Scroll] missing host or chart library');return;}
const host=root.querySelector('.vr-chart'), title=root.querySelector('.vr-symbol'), status=root.querySelector('.vr-status');
const nav=root.querySelector('.vr-periods'), error=root.querySelector('.vr-error');
const cache=new Map(), settings=readSettings();
let queue=[],index=0,current='',period='4H',data=[],requestToken=0,rotationTimer=0,refreshTimer=0,interactionTimer=0;
let paused=false,hidden=false,activeRequests=0,requestQueue=[],transitionTimer=0;
let sharedVisibleRange=null,applyingData=false,pendingSnapshot=null,transitionCleanup=0;
function readSettings(){try{return JSON.parse(localStorage.getItem('vegas-right-single-v1')||'{}')}catch{return {}}}
function saveSettings(){try{localStorage.setItem('vegas-right-single-v1',JSON.stringify(settings))}catch{}}
function symbolSetting(s){if(!settings[s])settings[s]={period:'4H'};if(!PERIODS.includes(settings[s].period))settings[s].period='4H';return settings[s]}
function ema(values,n){const out=new Array(values.length).fill(null);if(values.length<n)return out;let sum=0;for(let i=0;i<n;i++)sum+=values[i];let p=sum/n;out[n-1]=p;const k=2/(n+1);for(let i=n;i<values.length;i++){p=values[i]*k+p*(1-k);out[i]=p}return out}
async function fetchJson(path){const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);try{const r=await fetch(API+path,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.code!=='00000'||!Array.isArray(j.data))throw Error(j.msg||'行情响应无效');return j.data}finally{clearTimeout(t)}}
let stockMap=null,stockMapAt=0,stockMapPromise=null;
async function stockSymbol(s){
 if(!stockMap||Date.now()-stockMapAt>300000){
  if(!stockMapPromise)stockMapPromise=(async()=>{const rows=await fetchJson('/api/v3/reality/market/stock-info');const next=new Map(rows.filter(x=>x&&x.code&&x.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));const sk=rows.find(x=>x&&x.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));if(sk)next.set('SKHYNIX',String(sk.symbol));stockMap=next;stockMapAt=Date.now()})().finally(()=>{stockMapPromise=null});
  await stockMapPromise;
 }
 const v=stockMap.get(s);if(!v)throw Error('无现货映射');return v;
}
async function getCandles(symbol,p){
 const key=symbol+'|'+p,hit=cache.get(key);if(hit&&Date.now()-hit.at<REFRESH_MS)return hit.data;
 let rows;
 if(STOCKS.has(symbol)){const mapped=await stockSymbol(symbol);rows=await fetchJson('/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol:mapped,interval:p,limit:'1000'}))}
 else rows=await fetchJson('/api/v2/mix/market/candles?'+new URLSearchParams({symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:p,limit:'1000'}));
 const result=rows.filter(r=>Array.isArray(r)&&r.slice(0,5).every(v=>Number.isFinite(Number(v))&&Number(v)>0)).map(r=>({time:Math.floor(Number(r[0])/1000),open:+r[1],high:+r[2],low:+r[3],close:+r[4]})).sort((a,b)=>a.time-b.time);
 const unique=[];for(const c of result){if(unique.length&&unique[unique.length-1].time===c.time)unique[unique.length-1]=c;else unique.push(c)}
 if(!unique.length)throw Error('没有有效K线');cache.set(key,{data:unique,at:Date.now()});while(cache.size>24)cache.delete(cache.keys().next().value);return unique;
}
function enqueue(task){requestQueue.push(task);pump()}
function pump(){while(activeRequests<MAX_REQUESTS&&requestQueue.length){const task=requestQueue.shift();activeRequests++;task().catch(()=>{}).finally(()=>{activeRequests--;pump()})}}
const chart=LWC.createChart(host,{autoSize:true,attributionLogo:false,
 layout:{background:{type:LWC.ColorType.Solid,color:'rgba(0,0,0,0)'},textColor:'rgba(210,232,255,.72)',fontSize:11,fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
 grid:{vertLines:{visible:false},horzLines:{visible:false}},rightPriceScale:{visible:false,borderVisible:false,scaleMargins:{top:.09,bottom:.08},autoScale:true},leftPriceScale:{visible:false,borderVisible:false,autoScale:true},
 timeScale:{visible:false,borderVisible:false,rightOffset:3,barSpacing:5,minBarSpacing:.5,shiftVisibleRangeOnNewBar:false,timeVisible:false,secondsVisible:false},
 crosshair:{vertLine:{visible:true,color:'rgba(120,190,230,.18)'},horzLine:{visible:true,color:'rgba(120,190,230,.18)'}},
 handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true,axisDoubleClickReset:true},kineticScroll:{touch:true,mouse:true}});
const candle=chart.addSeries(LWC.CandlestickSeries,{upColor:'rgba(0,0,0,0)',downColor:'#ff5c7c',borderUpColor:'#2ee6a6',borderDownColor:'#ff5c7c',wickUpColor:'#2ee6a6',wickDownColor:'#ff5c7c',lastValueVisible:false,priceLineVisible:false});
const lines=EMA_LINES.map((n,i)=>chart.addSeries(LWC.LineSeries,{color:EMA_COLORS[i],lineWidth:i===0?1:2,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false}));
function renderPeriodButtons(){nav.replaceChildren();PERIODS.forEach(p=>{const b=document.createElement('button');b.type='button';b.textContent=p;b.dataset.period=p;b.classList.toggle('active',p===period);b.addEventListener('click',()=>{if(p===period)return;period=p;symbolSetting(current).period=p;saveSettings();renderPeriodButtons();loadCurrent()});nav.appendChild(b)})}
function setChartData(rows){
 const previous=sharedVisibleRange;applyingData=true;data=rows;candle.setData(rows);const closes=rows.map(x=>x.close);
 lines.forEach((line,i)=>line.setData(ema(closes,EMA_LINES[i]).map((v,j)=>v==null?null:{time:rows[j].time,value:v}).filter(Boolean)));
 try{if(previous)chart.timeScale().setVisibleLogicalRange(previous);else{const initial={from:Math.max(0,rows.length-110),to:rows.length};chart.timeScale().setVisibleLogicalRange(initial);sharedVisibleRange=initial}}catch{}
 applyingData=false;const last=rows[rows.length-1];status.textContent=last.close.toLocaleString('en-US',{maximumFractionDigits:5});error.hidden=true;
}
chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(!applyingData&&range&&current&&data.length)sharedVisibleRange={from:range.from,to:range.to}});
function clearTimers(){if(rotationTimer)clearTimeout(rotationTimer);if(refreshTimer)clearTimeout(refreshTimer);rotationTimer=refreshTimer=0}
function scheduleRotation(){
 if(hidden||paused||!current||!queue.length)return;
 if(rotationTimer)clearTimeout(rotationTimer);
 rotationTimer=setTimeout(()=>{
  rotationTimer=0;
  if(hidden||paused||!current)return;
  if(queue.length>1)advance();
 },ROTATE_MS);
}
function advance(){
 if(hidden||paused||queue.length<2)return;
 index=(index+1)%queue.length;
 try{pendingSnapshot=chart.takeScreenshot()}catch{pendingSnapshot=null}
 showSymbol(queue[index]);
}
function playScrollTransition(){
 const old=root.querySelector('.vr-transition-snapshot');
 if(old)old.remove();
 if(transitionCleanup)clearTimeout(transitionCleanup);
 if(pendingSnapshot){
  const snapshot=document.createElement('canvas');
  snapshot.className='vr-transition-snapshot';
  snapshot.width=pendingSnapshot.width;snapshot.height=pendingSnapshot.height;
  snapshot.getContext('2d').drawImage(pendingSnapshot,0,0);
  root.querySelector('.vr-single').appendChild(snapshot);
 }
 pendingSnapshot=null;
 host.classList.remove('vr-chart-enter','vr-chart-enter-active');
 void host.offsetWidth;
 host.classList.add('vr-chart-enter');
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  host.classList.add('vr-chart-enter-active');
  const snapshot=root.querySelector('.vr-transition-snapshot');
  if(snapshot)snapshot.classList.add('vr-transition-out');
 }));
 transitionCleanup=setTimeout(()=>{
  host.classList.remove('vr-chart-enter','vr-chart-enter-active');
  const snapshot=root.querySelector('.vr-transition-snapshot');if(snapshot)snapshot.remove();
  transitionCleanup=0;
 },620);
}
function showSymbol(symbol){
 if(!symbol||hidden)return;root.classList.remove('vr-leave-up');current=symbol;period=symbolSetting(symbol).period;title.textContent=symbol;status.textContent='加载行情…';error.hidden=true;renderPeriodButtons();clearTimers();
 const token=++requestToken;enqueue(async()=>{try{const rows=await getCandles(symbol,period);if(token!==requestToken||current!==symbol)return;setChartData(rows);if(pendingSnapshot)playScrollTransition();scheduleRotation();scheduleRefresh()}catch(e){if(token!==requestToken)return;status.textContent='数据异常';error.textContent='行情暂不可用 · '+String(e.message||e).slice(0,48);error.hidden=false;scheduleRotation()}})
}
function scheduleRefresh(){if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadCurrent(false),REFRESH_MS)}
function loadCurrent(){if(!current||hidden)return;const symbol=current,p=period,token=++requestToken;enqueue(async()=>{try{const rows=await getCandles(symbol,p);if(token!==requestToken||current!==symbol||period!==p)return;setChartData(rows)}catch(e){if(token===requestToken){status.textContent='数据异常';error.textContent='行情暂不可用 · '+String(e.message||e).slice(0,48);error.hidden=false}}finally{if(!hidden&&current===symbol)scheduleRefresh()}})}
function resumeRotation(){if(interactionTimer)clearTimeout(interactionTimer);interactionTimer=setTimeout(()=>{interactionTimer=0;paused=false;scheduleRotation();scheduleRefresh()},1800)}
function pauseForInteraction(){paused=true;clearTimers();resumeRotation()}
['pointerdown','touchstart','wheel'].forEach(type=>host.addEventListener(type,pauseForInteraction,{passive:true}));
let swipeStart=null;
host.addEventListener('touchstart',e=>{const t=e.touches&&e.touches[0];if(t)swipeStart={x:t.clientX,y:t.clientY,at:performance.now()}},{passive:true});
host.addEventListener('touchend',e=>{if(!swipeStart)return;const t=e.changedTouches&&e.changedTouches[0];if(!t){swipeStart=null;return}const dy=t.clientY-swipeStart.y,dx=t.clientX-swipeStart.x,dt=performance.now()-swipeStart.at;swipeStart=null;if(dy<-58&&Math.abs(dy)>Math.abs(dx)*1.2&&dt<650&&queue.length>1){if(interactionTimer)clearTimeout(interactionTimer);paused=false;clearTimers();advance()}},{passive:true});
window.addEventListener('pointerup',()=>{if(paused){if(interactionTimer)clearTimeout(interactionTimer);resumeRotation()}},{passive:true});
window.addEventListener('pointercancel',()=>{if(paused){if(interactionTimer)clearTimeout(interactionTimer);resumeRotation()}},{passive:true});
function reconcile(symbols){
 const next=Array.from(new Set((symbols||[]).map(s=>String(s||'').trim().toUpperCase()).filter(s=>/^[A-Z0-9.]+$/.test(s))));
 const old=current;queue=next;
 if(!queue.length){current='';++requestToken;clearTimers();paused=true;pendingSnapshot=null;const snapshot=root.querySelector('.vr-transition-snapshot');if(snapshot)snapshot.remove();title.textContent='';status.textContent='';error.hidden=true;root.hidden=true;candle.setData([]);lines.forEach(x=>x.setData([]));data=[];return}
 root.hidden=false;paused=false;if(interactionTimer){clearTimeout(interactionTimer);interactionTimer=0}let keep=queue.indexOf(old);if(keep>=0)index=keep;else index=Math.min(index,queue.length-1);
 if(old!==queue[index])showSymbol(queue[index]);else if(!old)showSymbol(queue[index]);else scheduleRotation();
}
window.VegasLayer5SetAutoQueue=reconcile;
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(hidden){clearTimers();if(interactionTimer)clearTimeout(interactionTimer);}else if(current){loadCurrent();scheduleRotation()}},{passive:true});
window.addEventListener('pagehide',()=>{clearTimers();if(interactionTimer)clearTimeout(interactionTimer);});
reconcile(window.VegasFormalSignalSymbols||[]);
})();