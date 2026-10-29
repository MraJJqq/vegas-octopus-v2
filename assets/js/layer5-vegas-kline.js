/* 第五层：Vegas K线悬浮图。独立模块，不修改其他层级逻辑。 */
(()=> {
'use strict';
const API='https://api.bitget.com';
const STORAGE_KEY='vegas-octopus-layer5-kline-v1';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const PERIODS=['15m','30m','1H','2H','4H','6H','12H','1D','1W'];
const STOCK_PERIODS=['15m','30m','1H','4H','6H','12H','1D','1W'];
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
const state={open:false,symbol:'',period:'2H',candles:[],loading:false,frame:0,raf:0,fetchAt:0,rotateTimer:0,pointers:new Map(),drag:null,resize:null,view:{count:120,end:0},saved:{}};
const readSaved=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {}}};
state.saved=readSaved();
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({geometry:state.geometry||savedGeometry||null,perSymbol:state.saved}))}catch{}}
const oldSave=state.saved;state.saved=oldSave.perSymbol||oldSave;
const savedGeometry=oldSave.geometry||null;
const root=document.createElement('div');root.id='vegas-layer5-root';
root.innerHTML=`<section id="vegas-layer5-window" aria-label="Vegas K线悬浮图">
<header id="vegas-layer5-head"><span id="vegas-layer5-title">VEGAS · KLINE</span><button id="vegas-layer5-prev" class="vegas-l5-nav" type="button" aria-label="上一个正式信号">‹</button><button id="vegas-layer5-next" class="vegas-l5-nav" type="button" aria-label="下一个正式信号">›</button><span id="vegas-layer5-status" aria-live="polite"></span><select id="vegas-layer5-period" aria-label="K线周期"></select><button id="vegas-layer5-close" type="button" aria-label="关闭K线">×</button></header>
<div id="vegas-layer5-chart-wrap"><canvas id="vegas-layer5-canvas" aria-label="K线与Vegas均线图"></canvas><div id="vegas-layer5-message">等待行情</div></div>
<div id="vegas-layer5-resize" aria-label="调整窗口大小"></div><i class="vegas-l5-edge" data-edge="n"></i><i class="vegas-l5-edge" data-edge="s"></i><i class="vegas-l5-edge" data-edge="e"></i><i class="vegas-l5-edge" data-edge="w"></i><i class="vegas-l5-edge" data-edge="ne"></i><i class="vegas-l5-edge" data-edge="nw"></i><i class="vegas-l5-edge" data-edge="se"></i><i class="vegas-l5-edge" data-edge="sw"></i>
</section>`;
document.body.appendChild(root);
const win=root.querySelector('#vegas-layer5-window'),head=root.querySelector('#vegas-layer5-head'),canvas=root.querySelector('#vegas-layer5-canvas'),ctx=canvas.getContext('2d'),title=root.querySelector('#vegas-layer5-title'),status=root.querySelector('#vegas-layer5-status'),periodSelect=root.querySelector('#vegas-layer5-period'),message=root.querySelector('#vegas-layer5-message');
periodSelect.innerHTML=PERIODS.map(p=>`<option value="${p}">${p}</option>`).join('');
function key(symbol){return symbol+'|'+(state.saved[symbol]?.period|| (STOCKS.has(symbol)?'1H':'2H'))}
function currentSaved(){if(!state.saved[state.symbol])state.saved[state.symbol]={};return state.saved[state.symbol]}
function currentPeriod(){return state.period}
function symbolFor(symbol){return symbol+'USDT'}
async function getJson(path){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);
 try{const r=await fetch(API+path,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.code!=='00000'||!Array.isArray(j.data))throw Error(j.msg||'行情响应无效');return j.data}
 finally{clearTimeout(t)}
}
let stockDirectory=null,stockDirectoryAt=0;
async function getStockSymbol(symbol){
 if(!stockDirectory||Date.now()-stockDirectoryAt>300000){
  const rows=await getJson('/api/v3/reality/market/stock-info');
  stockDirectory=new Map(rows.filter(x=>x&&x.code&&x.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
  const sk=rows.find(x=>x&&x.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
  if(sk)stockDirectory.set('SKHYNIX',String(sk.symbol));
  stockDirectoryAt=Date.now();
 }
 const s=stockDirectory.get(symbol);
 if(!s)throw Error('交易所未提供该品种的现货映射');
 return s;
}
function intervalFor(symbol,period){
 return period;
}
async function loadCandles(force=false){
 if(!state.open||!state.symbol)return;
 if(state.loading){if(!force)return;requestVersion++}
 if(!force&&Date.now()-state.fetchAt<25000)return;
 state.loading=true;const requestId=++requestVersion;const symbolAtRequest=state.symbol;message.hidden=false;message.textContent=state.candles.length?'更新行情…':'读取历史行情…';
 try{
  const stock=STOCKS.has(symbolAtRequest),period=currentPeriod(),interval=intervalFor(symbolAtRequest,period);
  let rows;
  if(stock){
   const sym=await getStockSymbol(symbolAtRequest);
   rows=await getJson('/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol:sym,interval,limit:'1000'}));
  }else{
   rows=await getJson('/api/v2/mix/market/candles?'+new URLSearchParams({symbol:symbolFor(symbolAtRequest),productType:'USDT-FUTURES',granularity:interval,limit:'1000'}));
  }
  if(requestId!==requestVersion||symbolAtRequest!==state.symbol)return;
  const data=rows.filter(r=>Array.isArray(r)&&Number(r[0])>0&&Number(r[1])>0&&Number(r[2])>0&&Number(r[3])>0&&Number(r[4])>0)
   .map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5]||0)}))
   .sort((a,b)=>a.time-b.time);
  const unique=[];for(const c of data){if(unique.length&&unique[unique.length-1].time===c.time)unique[unique.length-1]=c;else unique.push(c)}
  if(!unique.length)throw Error('交易所未返回有效K线');
  state.candles=unique;state.fetchAt=Date.now();message.hidden=true;
  const saved=currentSaved();if(saved.count)state.view.count=saved.count;if(saved.end)state.view.end=saved.end;
  draw();
 }catch(e){if(requestId===requestVersion){message.hidden=false;message.textContent='行情读取失败 · '+String(e.message||e).slice(0,48);status.textContent='数据异常';console.warn('[Vegas Layer 5] candle load failed',e)}}
 finally{if(requestId===requestVersion)state.loading=false}
}
function ema(values,n){
 const out=new Array(values.length).fill(null);if(values.length<n)return out;
 let sum=0;for(let i=0;i<n;i++)sum+=values[i];
 let prev=sum/n;out[n-1]=prev;const k=2/(n+1);
 for(let i=n;i<values.length;i++){prev=values[i]*k+prev*(1-k);out[i]=prev}
 return out;
}
function draw(){
 if(!state.open)return;
 const rect=canvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),dpr=Math.min(2,window.devicePixelRatio||1);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const all=state.candles;if(!all.length)return;
 const end=Math.max(0,Math.min(all.length,state.view.end||all.length)),count=Math.max(12,Math.min(600,state.view.count||120)),start=Math.max(0,end-count),rows=all.slice(start,end);
 if(!rows.length)return;
 const closes=all.map(c=>c.close),emas=EMA_LINES.map(line=>({...line,values:ema(closes,line.n).slice(start,end)}));
 let lo=Infinity,hi=-Infinity;
 rows.forEach(c=>{lo=Math.min(lo,c.low);hi=Math.max(hi,c.high)});
 emas.forEach(line=>line.values.forEach(v=>{if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v)}}));
 if(!Number.isFinite(lo)||!Number.isFinite(hi))return;
 const pad=(hi-lo||hi*.01)*.06;lo-=pad;hi+=pad;
 const y=v=>h-6-(v-lo)/(hi-lo)*(h-12),step=w/rows.length,bw=Math.max(1,Math.min(12,step*.64));
 rows.forEach((c,i)=>{
  const x=i*step+step/2,up=c.close>=c.open,col=up?'#2ee6a6':'#ff5c7c';
  ctx.globalAlpha=.96;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=Math.max(1,Math.min(1.4,step*.14));
  ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();
  const top=y(Math.max(c.open,c.close)),bottom=y(Math.min(c.open,c.close));
  ctx.fillRect(x-bw/2,top,bw,Math.max(1,bottom-top));
 });
 ctx.globalAlpha=1;
 for(const line of emas){
  ctx.beginPath();ctx.strokeStyle=line.color;ctx.lineWidth=line.width;ctx.globalAlpha=.92;let begun=false;
  line.values.forEach((v,i)=>{if(!Number.isFinite(v)){begun=false;return}const x=i*step+step/2,yy=y(v);if(!begun){ctx.moveTo(x,yy);begun=true}else ctx.lineTo(x,yy)});
  ctx.stroke();
 }
 ctx.globalAlpha=1;
 const last=rows[rows.length-1];title.textContent=state.symbol+' · '+currentPeriod()+' · VEGAS';
 status.textContent=last.close.toLocaleString('en-US',{maximumFractionDigits:6})+'  '+new Date(last.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function saveView(){const s=currentSaved();s.period=state.period;s.count=state.view.count;s.end=state.view.end;save()}
function clampGeometry(){
 const pad=8,vw=window.innerWidth,vh=window.innerHeight,r=win.getBoundingClientRect();
 const width=Math.min(Math.max(220,r.width),vw-pad*2),height=Math.min(Math.max(160,r.height),vh-pad*2);
 let left=parseFloat(win.style.left)||Math.max(pad,(vw-width)/2),top=parseFloat(win.style.top)||Math.max(pad,(vh-height)/2);
 left=Math.min(Math.max(pad,left),Math.max(pad,vw-width-pad));top=Math.min(Math.max(pad,top),Math.max(pad,vh-height-pad));
 win.style.width=width+'px';win.style.height=height+'px';win.style.left=left+'px';win.style.top=top+'px';
}
function applyGeometry(){
 const g=state.geometry||savedGeometry;
 if(g){win.style.left=g.left+'px';win.style.top=g.top+'px';win.style.width=g.width+'px';win.style.height=g.height+'px'}
 else{win.style.width=Math.min(900,Math.max(300,window.innerWidth*.72))+'px';win.style.height=Math.min(560,Math.max(260,window.innerHeight*.62))+'px';win.style.left=Math.max(8,(window.innerWidth-Math.min(900,Math.max(300,window.innerWidth*.72)))/2)+'px';win.style.top=Math.max(8,(window.innerHeight-Math.min(560,Math.max(260,window.innerHeight*.62)))/2)+'px'}
 clampGeometry();
}
function persistGeometry(){const r=win.getBoundingClientRect();state.geometry={left:r.left,top:r.top,width:r.width,height:r.height};save()}
function openSymbol(symbol){
 if(!symbol)return;
 if(state.rotateTimer)clearTimeout(state.rotateTimer);
 state.rotateTimer=0;
 state.open=true;state.symbol=symbol;
 const saved=state.saved[symbol]||{};
 state.period=saved.period||(STOCKS.has(symbol)?'1H':'2H');
 state.view={count:saved.count||120,end:saved.end||0};
 state.candles=[];state.fetchAt=0;state.loading=false;requestVersion++;
 if(STOCKS.has(symbol)&&!STOCK_PERIODS.includes(state.period))state.period='1H';
 periodSelect.replaceChildren(...(STOCKS.has(symbol)?STOCK_PERIODS:PERIODS).map(p=>{const o=document.createElement('option');o.value=p;o.textContent=p;return o}));
 periodSelect.value=state.period;win.classList.add('is-open');applyGeometry();
 message.hidden=false;message.textContent='读取历史行情…';
 loadCandles(true);
 scheduleAutoRotate();
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
function close(){state.open=false;requestVersion++;state.loading=false;state.symbol='';state.candles=[];if(state.rotateTimer)clearTimeout(state.rotateTimer);state.rotateTimer=0;win.classList.remove('is-open');}
root.querySelector('#vegas-layer5-close').addEventListener('click',close);
periodSelect.addEventListener('change',()=>{if(!state.symbol)return;state.period=periodSelect.value;state.view.end=0;state.fetchAt=0;state.candles=[];saveView();loadCandles(true)});
document.addEventListener('click',e=>{
 const card=e.target.closest&&e.target.closest('#market-cards-layer .mc-card[data-symbol]');
 if(!card)return;
 const symbol=String(card.dataset.symbol||'').toUpperCase();
 if(!symbol)return;
 e.preventDefault();e.stopPropagation();openSymbol(symbol);
},true);
head.addEventListener('pointerdown',e=>{
 if(e.target.closest('button,select'))return;
 if(e.pointerType==='touch'&&e.isPrimary===false)return;
 state.drag={x:e.clientX,y:e.clientY,left:win.offsetLeft,top:win.offsetTop,id:e.pointerId};
 try{head.setPointerCapture(e.pointerId)}catch{}
});
head.addEventListener('pointermove',e=>{if(!state.drag||state.drag.id!==e.pointerId)return;win.style.left=(state.drag.left+e.clientX-state.drag.x)+'px';win.style.top=(state.drag.top+e.clientY-state.drag.y)+'px';clampGeometry()});
function endDrag(e){if(state.drag&&state.drag.id===e.pointerId){state.drag=null;persistGeometry()}}
head.addEventListener('pointerup',endDrag);head.addEventListener('pointercancel',endDrag);
const resizeHandles=[...root.querySelectorAll('#vegas-layer5-resize,.vegas-l5-edge')];
resizeHandles.forEach(handle=>{
 const edge=handle.dataset.edge||'se';
 handle.addEventListener('pointerdown',e=>{const r=win.getBoundingClientRect();state.resize={edge,x:e.clientX,y:e.clientY,left:r.left,top:r.top,width:r.width,height:r.height,id:e.pointerId};e.preventDefault();try{handle.setPointerCapture(e.pointerId)}catch{}});
 handle.addEventListener('pointermove',e=>{const z=state.resize;if(!z||z.id!==e.pointerId)return;const dx=e.clientX-z.x,dy=e.clientY-z.y;let left=z.left,top=z.top,width=z.width,height=z.height;
  if(z.edge.includes('e'))width=z.width+dx;if(z.edge.includes('s'))height=z.height+dy;
  if(z.edge.includes('w')){width=z.width-dx;left=z.left+dx}if(z.edge.includes('n')){height=z.height-dy;top=z.top+dy}
  win.style.left=left+'px';win.style.top=top+'px';win.style.width=width+'px';win.style.height=height+'px';clampGeometry();draw();
 });
 function done(e){if(state.resize&&state.resize.id===e.pointerId){state.resize=null;persistGeometry();draw()}}
 handle.addEventListener('pointerup',done);handle.addEventListener('pointercancel',done);
});
const pointers=new Map();
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)state.drag={kind:'pan',x:e.clientX,y:e.clientY,count:state.view.count,end:state.view.end||state.candles.length,id:e.pointerId};else if(pointers.size===2){state.drag={kind:'pinch',distance:distancePointers(),count:state.view.count,end:state.view.end||state.candles.length}}});
function distancePointers(){const a=[...pointers.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size>=2&&state.drag?.kind==='pinch'){
  const dist=distancePointers();if(state.drag.distance>0){const ratio=state.drag.distance/Math.max(1,dist);state.view.count=Math.max(20,Math.min(600,Math.round(state.drag.count*ratio)));draw()}return;
 }
 if(state.drag?.kind==='pan'&&state.drag.id===e.pointerId){
  const dx=e.clientX-state.drag.x,step=canvas.clientWidth/Math.max(1,state.view.count);
  const delta=Math.round(dx/Math.max(1,step));
  state.view.end=Math.max(Math.max(20,state.view.count),Math.min(state.candles.length,state.drag.end-delta));draw();
 }
});
function releasePointer(e){pointers.delete(e.pointerId);if(!pointers.size){if(state.drag?.kind==='pan'||state.drag?.kind==='pinch'){state.drag=null;saveView()}}else if(pointers.size===1){const p=[...pointers.entries()][0];state.drag={kind:'pan',x:p[1].x,y:p[1].y,count:state.view.count,end:state.view.end||state.candles.length,id:p[0]}}}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('wheel',e=>{e.preventDefault();const factor=e.deltaY>0?1.12:.89;state.view.count=Math.max(20,Math.min(600,Math.round(state.view.count*factor)));draw();saveView()},{passive:false});
window.addEventListener('resize',()=>{if(state.open){clampGeometry();draw();persistGeometry()}},{passive:true});
setInterval(()=>{if(state.open&&!document.hidden)loadCandles(false)},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.open)loadCandles(true)});
})();