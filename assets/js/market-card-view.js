/* Layer 3 view: card DOM, rendering and selection only. */
(function(){
'use strict';
function price(value){
 return value>=100?value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):value>=1?value.toFixed(3):value.toFixed(4);
}
function draw(item){
 const canvas=item.nodes.chart,ctx=canvas?.getContext('2d'),rows=item.candles||[];
 if(!ctx||!rows.length)return;
 const rect=canvas.getBoundingClientRect(),w=Math.max(1,canvas.clientWidth||rect.width),h=Math.max(1,canvas.clientHeight||rect.height),dpr=Math.min(2,window.devicePixelRatio||1);
 const width=Math.round(w*dpr),height=Math.round(h*dpr);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const data=rows.slice(-60),low=Math.min(...data.map(x=>x.low)),high=Math.max(...data.map(x=>x.high)),span=high-low||Math.max(Math.abs(high)*.001,1e-8);
 const y=v=>h-3-(v-low)/span*(h-6),step=w/data.length,body=Math.max(1,Math.min(4,step*.58));
 data.forEach((c,i)=>{
  const x=i*step+step/2,color=c.close>=c.open?'#00f5a0':'#ff3b6b';
  ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();
  ctx.fillStyle=color;ctx.fillRect(x-body/2,Math.min(y(c.open),y(c.close)),body,Math.max(1.2,Math.abs(y(c.close)-y(c.open))));
 });
}
function mount(root,instruments,onSelect){
 if(!root)throw Error('Layer 3 root missing');
 const items=instruments.map(item=>({...item,nodes:null,price:0,open:0,candles:[]}));
 const markup=item=>'<div class="mc-slot"><div class="mc-float" style="--d:'+(-item.index*.9)+'s"><div class="mc-card" id="mc-c'+item.index+'" data-symbol="'+item.symbol+'"><div class="mc-glow"></div><div class="mc-row"><div class="mc-sym"><span class="mc-ico">'+item.icon+'</span><span class="mc-name">'+item.symbol+'<small>'+item.subtitle+'</small></span></div><span class="mc-chg">--</span></div><div class="mc-price">加载中</div><canvas class="mc-chart" aria-hidden="true"></canvas><div class="mc-tag">LIVE MARKET</div></div></div><div class="mc-gshadow" style="--d:'+(-item.index*.9)+'s"></div></div>';
 root.replaceChildren();
 root.insertAdjacentHTML('beforeend',items.map(markup).join(''));
 items.forEach(item=>{
  const card=root.querySelector('#mc-c'+item.index);
  item.nodes={card,price:card.querySelector('.mc-price'),change:card.querySelector('.mc-chg'),chart:card.querySelector('.mc-chart')};
 });
 const resizeObserver='ResizeObserver'in window?new ResizeObserver(entries=>{
  entries.forEach(entry=>{
   const item=items.find(x=>x.nodes.chart===entry.target);
   if(item)draw(item);
  });
 }):null;
 items.forEach(item=>resizeObserver?.observe(item.nodes.chart));
 let touchTarget=null,touchX=0,touchY=0,lastTouchAt=0;
 function select(symbol){if(typeof onSelect==='function')onSelect(symbol);}
 function onClick(event){
  const card=event.target instanceof Element?event.target.closest('.mc-card[data-symbol]'):null;
  if(!card||!root.contains(card))return;
  if(Date.now()-lastTouchAt<700)return;
  select(card.dataset.symbol);
 }
 function onTouchStart(event){
  const touch=event.touches?.[0],target=event.target;
  touchTarget=target instanceof Element?target.closest('.mc-card[data-symbol]'):null;
  if(!touchTarget||!root.contains(touchTarget)){touchTarget=null;return;}
  touchX=touch.clientX;touchY=touch.clientY;
 }
 function onTouchEnd(event){
  const touch=event.changedTouches?.[0],card=touchTarget;touchTarget=null;
  if(!touch||!card?.isConnected||Math.hypot(touch.clientX-touchX,touch.clientY-touchY)>=8)return;
  lastTouchAt=Date.now();select(card.dataset.symbol);
 }
 function onTouchCancel(){touchTarget=null;}
 root.addEventListener('click',onClick,true);
 root.addEventListener('touchstart',onTouchStart,{capture:true,passive:true});
 root.addEventListener('touchend',onTouchEnd,{capture:true,passive:true});
 root.addEventListener('touchcancel',onTouchCancel,{capture:true,passive:true});
 let pointerRaf=0,pointerEvent=null;
 function onPointerMove(event){
  if(event.pointerType==='touch')return;
  const card=event.target instanceof Element?event.target.closest('.mc-card'):null;
  if(!card)return;
  pointerEvent=event;
  if(pointerRaf)return;
  pointerRaf=requestAnimationFrame(()=>{
   pointerRaf=0;if(!pointerEvent)return;
   const e=pointerEvent;pointerEvent=null;
   const target=e.target instanceof Element?e.target.closest('.mc-card'):null;
   if(!target)return;
   const rect=target.getBoundingClientRect(),x=(e.clientX-rect.left)/Math.max(1,rect.width),y=(e.clientY-rect.top)/Math.max(1,rect.height);
   target.style.setProperty('--ry',((x-.5)*24)+'deg');target.style.setProperty('--rx',((.5-y)*20)+'deg');
  });
 }
 function resetTilt(event){
  const card=event.target instanceof Element?event.target.closest('.mc-card'):null;
  if(card&&(!event.relatedTarget||!card.contains(event.relatedTarget))){card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg');}
 }
 root.addEventListener('pointermove',onPointerMove,{passive:true});
 root.addEventListener('pointerout',resetTilt,{passive:true});
 ['pointerleave','pointerup','pointercancel'].forEach(type=>root.addEventListener(type,resetTilt,{passive:true}));
 function update(snapshot){
  items.forEach(item=>{
   const data=snapshot.get(item.symbol);if(!data)return;
   item.price=data.price||item.price;item.open=data.open||item.open;
   const candlesChanged=!!data.candles&&data.candles!==item.candles;
   if(candlesChanged)item.candles=data.candles;
   if(item.price>0&&item.open>0){
    const up=item.price>=item.open,n=price(item.price),pct=(up?'+':'')+((item.price/item.open-1)*100).toFixed(2)+'%';
    item.nodes.card.classList.toggle('up',up);item.nodes.card.classList.toggle('dn',!up);
    item.nodes.card.style.setProperty('--mc-color',up?'#00f5a0':'#ff3b6b');
    if(item.nodes.price.textContent!==n)item.nodes.price.textContent=n;
    if(item.nodes.change.textContent!==pct)item.nodes.change.textContent=pct;
   }
   if(candlesChanged&&item.candles.length)draw(item);
  });
 }
 function setSignals(symbols){
  const set=new Set(symbols);
  items.forEach(item=>{
   const active=set.has(item.symbol);
   if(active)item.nodes.card.setAttribute('data-formal-signal','true');
   else item.nodes.card.removeAttribute('data-formal-signal');
  });
 }
 function destroy(){
  resizeObserver?.disconnect();
  root.removeEventListener('click',onClick,true);
  root.removeEventListener('touchstart',onTouchStart,true);
  root.removeEventListener('touchend',onTouchEnd,true);
  root.removeEventListener('touchcancel',onTouchCancel,true);
  root.removeEventListener('pointermove',onPointerMove);root.removeEventListener('pointerout',resetTilt);
  ['pointerleave','pointerup','pointercancel'].forEach(type=>root.removeEventListener(type,resetTilt));
  if(pointerRaf)cancelAnimationFrame(pointerRaf);
 }
 return{items,slots:()=>Array.from(root.querySelectorAll('.mc-slot')),update,setSignals,destroy};
}
window.VegasMarketCardView={mount};
})();