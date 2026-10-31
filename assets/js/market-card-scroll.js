/* Layer 3 scroll engine. One owner for every scroll mode and animation frame. */
(function(){
'use strict';
function mount(root,slots){
 if(!root||!slots?.length)throw Error('Scroll engine requires root and card slots');
 const ordered=slots.slice();
 const state={mode:'auto',raf:0,lastTime:0,autoDelayUntil:performance.now()+250,
  wheelTarget:root.scrollTop,wheelSpeed:0,touching:false,dragging:false,
  touchY:0,touchTime:0,touchSpeed:0,lastScroll:root.scrollTop,looping:false};
 let gap=0,stride=0,totalHeight=0,scaleMax=1,geometryDirty=true,autoFraction=0,lastFocusRange='';
 const styleCache=new WeakMap();
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function measure(){
  if(!geometryDirty)return;
  gap=parseFloat(getComputedStyle(root).rowGap)||0;
  stride=ordered[0]?ordered[0].offsetHeight+gap:0;
  totalHeight=ordered.reduce((sum,node)=>sum+node.offsetHeight+gap,0);
  const first=ordered[0],card=first?.querySelector('.mc-card');
  if(first&&card){const cs=getComputedStyle(first),pad=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0);scaleMax=Math.min(1.16,Math.max(1,(first.clientWidth-pad-8)/Math.max(1,card.offsetWidth)));}
  geometryDirty=false;
 }
 function normalize(direction){
  if(state.looping||ordered.length<2)return;
  measure();state.looping=true;
  let top=root.scrollTop,guard=0,shift=0;
  if(direction>0){
   while(guard++<ordered.length&&ordered[0]&&top>=ordered[0].offsetHeight+gap){
    const first=ordered.shift(),distance=first.offsetHeight+gap;
    root.appendChild(first);ordered.push(first);top-=distance;shift-=distance;
   }
  }else{
   while(guard++<ordered.length&&top<=0&&ordered[ordered.length-1]){
    const last=ordered.pop(),distance=last.offsetHeight+gap;
    root.insertBefore(last,root.firstElementChild);ordered.unshift(last);top+=distance;shift+=distance;
   }
  }
  if(shift){root.scrollTop=top;state.lastScroll=top;lastFocusRange='';if(state.mode==='wheel')state.wheelTarget+=shift;}
  state.looping=false;
 }
 function setStyle(node,scale,opacity){
  const old=styleCache.get(node)||{};
  if(old.scale!==scale){node.style.setProperty('--mc-focus-scale',scale);old.scale=scale;}
  if(old.opacity!==opacity){node.style.setProperty('--mc-page-opacity',opacity);old.opacity=opacity;}
  styleCache.set(node,old);
 }
 function focus(){
  measure();
  const height=root.clientHeight;if(!height||!stride)return;
  const top=root.scrollTop,first=clamp(Math.floor(top/Math.max(1,stride))-2,0,ordered.length-1);
  const last=clamp(Math.ceil((top+height)/Math.max(1,stride))+2,0,ordered.length);
  const center=top+height/2;
  const range=Math.max(1,height*.58),fadeRange=Math.max(1,height*.5);
  const key=first+':'+last+':'+Math.round(top);
  if(key===lastFocusRange)return;
  lastFocusRange=key;
  for(let i=first;i<last;i++){
   const node=ordered[i],boxTop=node.offsetTop,boxHeight=node.offsetHeight,visible=Math.max(0,Math.min(boxTop+boxHeight,top+height)-Math.max(boxTop,top));
   const ratio=Math.min(1,visible/Math.max(1,boxHeight)),distance=Math.abs(boxTop+boxHeight/2-center);
   const t=clamp(distance/range,0,1),e=t*t*(3-2*t),ft=clamp(distance/fadeRange,0,1),fe=ft*ft*(3-2*ft);
   const scale=(1+(scaleMax-1)*(1-e)).toFixed(3);
   const opacity=Math.max(.025,distance<height*.23&&ratio>=.98?1:(1-.72*fe)*Math.min(1,ratio*1.8)).toFixed(3);
   setStyle(node,scale,opacity);
  }
 }
 function requestFrame(){if(!state.raf&&!document.hidden)state.raf=requestAnimationFrame(frame);}
 function cancelFrame(){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;state.lastTime=0;}
 function move(delta,direction){
  if(!Number.isFinite(delta)||Math.abs(delta)<.01)return;
  root.scrollTop+=delta;normalize(direction||Math.sign(delta));state.lastScroll=root.scrollTop;
 }
 function frame(now){
  state.raf=0;
  const dt=state.lastTime?clamp(now-state.lastTime,0,40):16.67;state.lastTime=now;
  if(state.mode==='wheel'){
   const diff=state.wheelTarget-root.scrollTop;
   move(diff*(1-Math.exp(-dt/32)),Math.sign(diff));
   state.wheelSpeed*=Math.exp(-dt/190);
   if(Math.abs(state.wheelSpeed)>.008)state.wheelTarget+=state.wheelSpeed*dt;
   if(Math.abs(state.wheelSpeed)<.025&&Math.abs(state.wheelTarget-root.scrollTop)<.6){
    state.mode='auto';state.wheelSpeed=0;state.autoDelayUntil=now+100;
   }
  }else if(state.mode==='inertia'){
   move(state.touchSpeed*dt,Math.sign(state.touchSpeed));
   state.touchSpeed*=Math.exp(-dt/520);
   if(Math.abs(state.touchSpeed)<.025){state.touchSpeed=0;state.mode='auto';state.autoDelayUntil=now+120;}
  }else if(state.mode==='auto'&&!state.touching&&now>=state.autoDelayUntil){
   measure();
   if(totalHeight>0&&ordered.length>1){
    autoFraction+=totalHeight/120*dt/1000;
    const pixels=Math.floor(autoFraction);
    if(pixels){autoFraction-=pixels;move(pixels,1);}
   }
  }
  focus();
  if(!document.hidden)requestFrame();
 }
 function onWheel(event){
  if(Math.abs(event.deltaY)<.1)return;
  event.preventDefault();
  const unit=event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1,delta=event.deltaY*unit;
  if(state.mode!=='wheel'){state.wheelTarget=root.scrollTop;state.wheelSpeed=0;}
  state.wheelTarget+=delta*1.28;
  state.wheelSpeed=clamp(state.wheelSpeed+delta*.022,-1.2,1.2);
  state.mode='wheel';state.autoDelayUntil=performance.now()+180;requestFrame();
 }
 function onTouchStart(event){
  const touch=event.touches[0];if(!touch)return;
  state.touching=true;state.dragging=false;state.mode='touch';state.touchY=touch.clientY;
  state.touchTime=performance.now();state.touchSpeed=0;cancelFrame();
 }
 function onTouchMove(event){
  const touch=event.touches[0];if(!touch||!state.touching)return;
  const now=performance.now(),delta=state.touchY-touch.clientY,elapsed=Math.max(1,now-state.touchTime);
  if(!state.dragging&&Math.abs(touch.clientY-state.touchY)<8)return;
  state.dragging=true;event.preventDefault();
  if(Math.abs(delta)>.05){
   move(delta,Math.sign(delta));
   state.touchSpeed=clamp(state.touchSpeed*.35+clamp(delta/elapsed,-3.6,3.6)*.65,-3.6,3.6);
  }
  state.touchY=touch.clientY;state.touchTime=now;requestFrame();
 }
 function endTouch(cancelled){
  if(!state.touching)return;
  state.touching=false;state.dragging=false;
  if(!cancelled&&Math.abs(state.touchSpeed)>.035){state.touchSpeed=clamp(state.touchSpeed*1.25,-3.6,3.6);state.mode='inertia';requestFrame();}
  else{state.touchSpeed=0;state.mode='auto';state.autoDelayUntil=performance.now()+1400;requestFrame();}
 }
 function onScroll(){
  if(state.looping)return;
  const current=root.scrollTop,delta=current-state.lastScroll;
  if(Math.abs(delta)<.5)return;
  state.lastScroll=current;
  if(state.mode==='auto'&&!state.touching){
   normalize(Math.sign(delta));state.wheelTarget=root.scrollTop;state.wheelSpeed=0;
   state.autoDelayUntil=performance.now()+250;
  }
  requestFrame();
 }
 function onVisibility(){
  if(document.hidden){cancelFrame();state.mode='auto';state.touching=false;state.touchSpeed=state.wheelSpeed=0;state.lastScroll=root.scrollTop;}
  else{state.autoDelayUntil=performance.now()+250;requestFrame();}
 }
 function onResize(){geometryDirty=true;lastFocusRange='';requestFrame();}
 root.style.scrollBehavior='auto';
 root.addEventListener('wheel',onWheel,{passive:false});
 root.addEventListener('scroll',onScroll,{passive:true});
 root.addEventListener('touchstart',onTouchStart,{passive:true});
 root.addEventListener('touchmove',onTouchMove,{passive:false});
 root.addEventListener('touchend',()=>endTouch(false),{passive:true});
 root.addEventListener('touchcancel',()=>endTouch(true),{passive:true});
 document.addEventListener('visibilitychange',onVisibility,{passive:true});
 window.addEventListener('resize',onResize,{passive:true});
 const observer='ResizeObserver'in window?new ResizeObserver(onResize):null;
 observer?.observe(root);ordered.forEach(node=>observer?.observe(node));
 const intersection='IntersectionObserver'in window?new IntersectionObserver(entries=>{
  entries.forEach(entry=>entry.target.classList.toggle('mc-in-view',entry.isIntersecting));
 },{root,threshold:.01}):null;
 ordered.forEach(node=>intersection?intersection.observe(node):node.classList.add('mc-in-view'));
 measure();focus();requestFrame();
 return{refresh:onResize,destroy(){
  cancelFrame();observer?.disconnect();intersection?.disconnect();
  root.removeEventListener('wheel',onWheel);root.removeEventListener('scroll',onScroll);
  root.removeEventListener('touchstart',onTouchStart);root.removeEventListener('touchmove',onTouchMove);
  document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('resize',onResize);
 }};
}
window.VegasMarketCardScroll={mount};
})();
