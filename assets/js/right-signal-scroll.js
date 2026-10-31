/* Layer 5 composition root. Owns visibility, signal queue, rotation and manual selection. */
(function(){
'use strict';
if(window.__VEGAS_LAYER5_MOUNTED__)return;
const root=document.getElementById('vegas-right-scroll'),LWC=window.LightweightCharts,data=window.VegasKlineData;
if(!root||!LWC||!data||!window.VegasKlineChart){console.error('[Vegas Layer 5] required foundation module missing');return;}
window.__VEGAS_LAYER5_MOUNTED__=true;
const single=root.querySelector('.vr-single'),nav=root.querySelector('.vr-periods'),title=root.querySelector('.vr-symbol'),status=root.querySelector('.vr-status'),error=root.querySelector('.vr-error');
const layers=[0,1].map(index=>{
 const layer=document.createElement('div');layer.className='vr-fade-layer'+(index===0?' is-active':'');layer.dataset.layer=String(index);single.prepend(layer);return layer;
});
const CLEAR_MS=5000,TRANSITION_MS=5000,REVEAL_MS=1000,INITIAL_HOLD_MS=4000,REFRESH_MS=15000,MANUAL_HOLD_MS=5000;
let queue=[],currentIndex=0,manualSymbol='',active=0,period='4H',state='hidden',timer=0,refreshTimer=0,token=0,initialShown=false,refreshPending=false;
const activePointers=new Set();
const periodSettings=(()=>{try{const saved=JSON.parse(localStorage.getItem('vegas-right-track-v1')||'{}');return Object.fromEntries(Object.entries(saved).filter(([,v])=>data.periods.includes(v?.period)).map(([s,v])=>[s,v.period]));}catch{return{};}})();
const chart=window.VegasKlineChart.create(root,layers,LWC,()=>active);
const views=chart.views;
const current=()=>manualSymbol||queue[currentIndex]||'';
const periodFor=s=>periodSettings[s]||'4H';
function setPeriodButtons(){
 nav.replaceChildren();
 data.periods.forEach(value=>{
  const button=document.createElement('button');button.type='button';button.textContent=value;button.classList.toggle('active',value===period);
  button.addEventListener('click',()=>changePeriod(value));nav.append(button);
 });
}
function clearTimer(){if(timer){clearTimeout(timer);timer=0;}}
function clearRefresh(){if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=0;}}

function savePeriods(){try{localStorage.setItem('vegas-right-track-v1',JSON.stringify(Object.fromEntries(Object.entries(periodSettings).map(([s,p])=>[s,{period:p}]))));}catch{}}
function setLayerStyles(index,transition=false){
 layers.forEach((layer,i)=>{
  const activeLayer=i===index;layer.style.transition=transition?'opacity '+TRANSITION_MS+'ms ease-in-out,filter '+TRANSITION_MS+'ms ease-in-out':'none';
  layer.style.opacity=activeLayer?'1':'0';layer.style.filter=activeLayer?'brightness(1)':'brightness(.25)';
  layer.classList.toggle('is-active',activeLayer);layer.style.pointerEvents=activeLayer?'auto':'none';
 });
}
function showRoot(){
 root.hidden=false;requestAnimationFrame(()=>chart.resize());
}
function updateHeader(symbol,rows){
 title.textContent=symbol;
 if(rows?.length){
  status.textContent=rows.at(-1).close.toLocaleString('en-US',{maximumFractionDigits:5})+' · '+rows.length+'根K线';
  error.hidden=rows.length>=676;
  if(rows.length<676)error.textContent='历史K线不足676根，EMA576/EMA676红峰无法完整显示（当前'+rows.length+'根）';
 }else status.textContent='正在加载行情…';
}
async function loadLayer(index,symbol,timeframe){
 if(!symbol)return false;
 const view=views[index],requestId=(view.requestId||0)+1;view.requestId=requestId;
 const changed=view.symbol!==symbol||view.period!==timeframe;
 try{
  const first=await data.load(symbol,timeframe);
  if(view.requestId!==requestId)return false;
  chart.setData(index,first,symbol,timeframe,!changed);
  view.symbol=symbol;view.period=timeframe;view.hasData=true;view.dataAt=Date.now();
  if(index===active&&symbol===current())updateHeader(symbol,first);
  if(first.length<1200){
   data.complete(symbol,timeframe,first).then(rows=>{
    if(view.requestId!==requestId||view.symbol!==symbol||view.period!==timeframe)return;
    if(state==='transitioning'){view.pendingRows=rows;return;}
    chart.setData(index,rows,symbol,timeframe,true);
    if(index===active&&symbol===current())updateHeader(symbol,rows);
   }).catch(exception=>{
    if(index===active&&symbol===current()){error.textContent='历史数据补齐失败 · '+String(exception.message||exception).slice(0,42);error.hidden=false;}
   });
  }
  return true;
 }catch(exception){
  if(view.requestId===requestId&&index===active&&symbol===current()){
   status.textContent='数据异常';error.textContent='行情暂不可用 · '+String(exception.message||exception).slice(0,42);error.hidden=false;
  }
  return false;
 }
}
async function activate(index,symbol){
 active=index;period=periodFor(symbol);setPeriodButtons();title.textContent=symbol;
 layers.forEach((layer,i)=>{layer.classList.toggle('is-active',i===index);layer.style.pointerEvents=i===index?'auto':'none';});
 const view=views[index];
 if(view.symbol===symbol&&view.period===period&&view.hasData){updateHeader(symbol,view.rows);return true;}
 return loadLayer(index,symbol,period);
}
function scheduleRefresh(delay=REFRESH_MS){
 clearRefresh();if(document.hidden||!current()||state==='hidden')return;
 refreshTimer=setTimeout(async()=>{
  refreshTimer=0;
  if(state==='preparing'||state==='transitioning'||state==='paused'){refreshPending=true;return;}
  const symbol=current();await loadLayer(active,symbol,periodFor(symbol));scheduleRefresh();
 },delay);
}
function applyDeferredRefresh(){
 views.forEach((view,index)=>{if(view.pendingRows){const rows=view.pendingRows;view.pendingRows=null;chart.setData(index,rows,view.symbol,view.period,true);if(index===active&&view.symbol===current())updateHeader(view.symbol,rows);}});
 if(refreshPending){refreshPending=false;scheduleRefresh(0);}
}
function scheduleCycle(delay=CLEAR_MS){
 clearTimer();if(document.hidden||manualSymbol||queue.length<2||state==='paused'||state==='hidden')return;
 state='clear';const id=++token;
 timer=setTimeout(()=>{timer=0;if(id===token&&state==='clear')transition();},delay);
}
function transition(){
 if(document.hidden||manualSymbol||queue.length<2||state==='paused')return;
 state='preparing';
 const nextIndex=(currentIndex+1)%queue.length,symbol=queue[nextIndex],nextLayer=1-active,id=++token,view=views[nextLayer];
 const ready=view.symbol===symbol&&view.period===periodFor(symbol)&&view.hasData&&Date.now()-view.dataAt<15000;
 (ready?Promise.resolve(true):loadLayer(nextLayer,symbol,periodFor(symbol))).then(loaded=>{
  if(id!==token||document.hidden||state!=='preparing')return;
  if(!loaded||!views[nextLayer].hasData){state='idle';scheduleCycle(1000);return;}
  chart.sync(active,nextLayer);state='transitioning';
  layers.forEach(layer=>layer.style.willChange='opacity,filter');
  setLayerStyles(active,false);layers[nextLayer].style.opacity='0';layers[nextLayer].style.filter='brightness(.25)';
  layers[nextLayer].getBoundingClientRect();setLayerStyles(nextLayer,true);
  currentIndex=nextIndex;active=nextLayer;period=periodFor(symbol);setPeriodButtons();updateHeader(symbol,views[nextLayer].rows);
  timer=setTimeout(()=>{
   timer=0;if(id!==token||state!=='transitioning')return;
   layers.forEach(layer=>{layer.style.transition='';layer.style.willChange='auto';});
   state='idle';applyDeferredRefresh();preloadNext();scheduleCycle(CLEAR_MS);
  },TRANSITION_MS);
 });
}
function preloadNext(){
 if(manualSymbol||queue.length<2||document.hidden)return;
 const index=(currentIndex+1)%queue.length,symbol=queue[index],view=views[1-active],timeframe=periodFor(symbol);
 if(view.symbol===symbol&&view.period===timeframe&&view.hasData&&Date.now()-view.dataAt<15000)return;
 loadLayer(1-active,symbol,timeframe);
}
function beginReveal(){
 const layer=layers[active];state='revealing';layer.style.transition='none';layer.style.opacity='1';layer.style.filter='brightness(.25)';layer.getBoundingClientRect();
 layer.style.transition='filter '+REVEAL_MS+'ms ease-out';
 requestAnimationFrame(()=>{if(state==='revealing'&&!document.hidden)layer.style.filter='brightness(1)';});
 clearTimer();timer=setTimeout(()=>{
  timer=0;layer.style.transition='';layer.style.filter='brightness(1)';initialShown=true;state=manualSymbol?'manual':'idle';
  if(!manualSymbol)scheduleCycle(INITIAL_HOLD_MS);
 },REVEAL_MS);
}
function selectSymbol(value){
 const symbol=String(value||'').trim().toUpperCase();
 if(!/^[A-Z0-9.]+$/.test(symbol))return false;
 manualSymbol=symbol;++token;clearTimer();clearRefresh();state='manual';
 showRoot();setLayerStyles(active,false);title.textContent=symbol;error.hidden=true;
 period=periodFor(symbol);setPeriodButtons();
 loadLayer(active,symbol,period).then(loaded=>{
  if(!loaded||manualSymbol!==symbol||document.hidden)return;
  updateHeader(symbol,views[active].rows);armManualReturn(symbol);
 });
 scheduleRefresh();return true;
}
function armManualReturn(symbol){
 clearTimer();if(!symbol||manualSymbol!==symbol||document.hidden)return;
 state='manual';timer=setTimeout(()=>{
  timer=0;if(manualSymbol!==symbol)return;
  manualSymbol='';const next=current();
  if(!next){hide();return;}
  activate(active,next).then(()=>{state='idle';scheduleCycle(0);scheduleRefresh();});
 },MANUAL_HOLD_MS);
}
function changePeriod(value){
 if(!data.periods.includes(value)||value===period)return;
 const symbol=current();if(!symbol)return;
 chart.capture(views[active]);period=value;periodSettings[symbol]=value;savePeriods();setPeriodButtons();
 ++token;clearTimer();state=manualSymbol?'manual':'paused';
 loadLayer(active,symbol,value).then(ok=>{
  if(!ok){state=manualSymbol?'manual':'idle';if(!manualSymbol)scheduleCycle(CLEAR_MS);return;}
  state=manualSymbol?'manual':'idle';
  if(manualSymbol)armManualReturn(symbol);else scheduleCycle(CLEAR_MS);
  scheduleRefresh();
 });
}
function pause(event){
 if(event?.pointerId!==undefined)activePointers.add(event.pointerId);
 if(state==='paused'||state==='hidden')return;
 ++token;clearTimer();
 const frozen=layers.map(layer=>({opacity:getComputedStyle(layer).opacity,filter:getComputedStyle(layer).filter}));
 layers.forEach((layer,i)=>{layer.style.transition='none';layer.style.opacity=frozen[i].opacity;layer.style.filter=frozen[i].filter;});
 state='paused';
}
function resume(event){
 if(event?.pointerId!==undefined)activePointers.delete(event.pointerId);
 if(activePointers.size||state!=='paused')return;
 setLayerStyles(active,false);
 layers.forEach(layer=>{layer.style.transition='';layer.style.willChange='auto';});
 state=manualSymbol?'manual':'idle';
 applyDeferredRefresh();
 if(manualSymbol)armManualReturn(manualSymbol);else scheduleCycle(CLEAR_MS);
}
function hide(){
 ++token;clearTimer();clearRefresh();state='hidden';root.hidden=true;
 views.forEach(view=>{view.requestId=(view.requestId||0)+1;view.hasData=false;view.symbol='';});
}
function setQueue(values){
 const next=[...new Set((values||[]).map(x=>String(x||'').trim().toUpperCase()).filter(x=>/^[A-Z0-9.]+$/.test(x)))];
 if(next.length===queue.length&&next.every((s,i)=>s===queue[i]))return;
 const previous=current();++token;clearTimer();clearRefresh();
 views.forEach(view=>{view.pendingRows=null;});
 setLayerStyles(active,false);state='idle';
 queue=next;currentIndex=Math.max(0,queue.indexOf(previous));if(currentIndex>=queue.length)currentIndex=0;
 if(!queue.length&&!manualSymbol){hide();return;}
 showRoot();const symbol=current();
 activate(active,symbol).then(ok=>{
  if(!ok)return;
  if(!initialShown&&!manualSymbol)beginReveal();
  else if(!manualSymbol){state='idle';preloadNext();scheduleCycle(CLEAR_MS);}
  scheduleRefresh();
 });
}
function visibility(){
 if(document.hidden){++token;clearTimer();clearRefresh();views.forEach(view=>{view.requestId=(view.requestId||0)+1;});state='hidden';return;}
 const symbol=current();if(!symbol)return;
 setLayerStyles(active,false);showRoot();loadLayer(active,symbol,periodFor(symbol)).then(ok=>{
  if(!ok)return;
  state=manualSymbol?'manual':'idle';
  if(!initialShown&&!manualSymbol)beginReveal();
  else if(!manualSymbol)scheduleCycle(CLEAR_MS);
  if(manualSymbol)armManualReturn(symbol);
  scheduleRefresh();
 });
}
root.addEventListener('pointerdown',pause,{capture:true,passive:true});
window.addEventListener('pointerup',resume,{capture:true,passive:true});
window.addEventListener('pointercancel',resume,{capture:true,passive:true});
window.addEventListener('blur',()=>{if(activePointers.size){activePointers.clear();resume();}},{passive:true});
document.addEventListener('visibilitychange',visibility,{passive:true});
window.VegasLayer5ShowSymbol=selectSymbol;
window.VegasLayer5SetAutoQueue=setQueue;
setPeriodButtons();
const pendingQueue=window.__VEGAS_PENDING_LAYER5_QUEUE;
if(Array.isArray(pendingQueue)){delete window.__VEGAS_PENDING_LAYER5_QUEUE;setQueue(pendingQueue);}
else setQueue(window.VegasFormalSignalSymbols||[]);
if(window.__VEGAS_PENDING_LAYER5_SYMBOL){const pending=window.__VEGAS_PENDING_LAYER5_SYMBOL;delete window.__VEGAS_PENDING_LAYER5_SYMBOL;selectSymbol(pending);}
})();