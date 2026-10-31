/* Vegas 章鱼｜第三层滚动控制器
 * 单一 RAF：自动位移、滚轮缓动、触屏惯性与焦点效果共用同一帧循环。
 * 不创建卡片、不处理行情、不修改卡片模板或视觉尺寸。
 */
(function(){
'use strict';
window.VegasMarketCardScrollInit=function(left,initialSlots){
 if(!left||!Array.isArray(initialSlots)||!initialSlots.length){console.error('[Vegas Scroll] invalid initializer arguments');return;}
 if(left.dataset.mcScrollInitialized==='true')return;
 left.dataset.mcScrollInitialized='true';

 let slots=initialSlots.slice();
 let frameId=0,wakeTimer=0,lastFrameTime=0;
 let mode='auto',loopDirection=1,normalizing=false;
 let autoResumeAt=performance.now()+250,autoEngage=1,autoRemainder=0;
 let wheelTarget=left.scrollTop,wheelVelocity=0;
 let touchActive=false,touchDragging=false,touchStartY=0,touchLastY=0,touchLastTime=0,touchVelocity=0;
 let lastObservedScrollTop=left.scrollTop;
 let cachedGap=null,cachedStep=0,cachedCycleHeight=0,cachedScaleMax=null;
 let initializedFocus=false,lastFocusSlots=[];
 const focusStyleCache=new WeakMap();

 function invalidateGeometry(){
  cachedGap=null;cachedStep=0;cachedCycleHeight=0;cachedScaleMax=null;
 }
 function gap(){
  if(cachedGap!==null)return cachedGap;
  const value=parseFloat(getComputedStyle(left).rowGap);
  cachedGap=Number.isFinite(value)?Math.max(0,value):0;
  return cachedGap;
 }
 function stride(slot){return slot?Math.max(1,slot.offsetHeight+gap()):0;}
 function measureGeometry(){
  if(cachedStep>0&&cachedCycleHeight>0)return;
  const spacing=gap();
  cachedStep=slots[0]?Math.max(1,slots[0].offsetHeight+spacing):0;
  cachedCycleHeight=slots.reduce((sum,slot)=>sum+Math.max(1,slot.offsetHeight+spacing),0);
 }
 function scaleLimit(){
  if(cachedScaleMax!==null)return cachedScaleMax;
  const first=slots[0];
  if(!first)return 1;
  const card=first.querySelector('.mc-card');
  const cardWidth=Math.max(1,card?.offsetWidth||first.clientWidth);
  const style=getComputedStyle(first);
  const padding=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
  cachedScaleMax=Math.min(1.16,(first.clientWidth-padding-8)/cardWidth);
  return cachedScaleMax;
 }
 function resetFocus(slot){
  const old=focusStyleCache.get(slot);
  if(old?.scale==='1.000'&&old?.opacity==='0.025')return;
  slot.style.setProperty('--mc-focus-scale','1.000');
  slot.style.setProperty('--mc-page-opacity','0.025');
  focusStyleCache.set(slot,{scale:'1.000',opacity:'0.025'});
 }
 function updateFocus(){
  measureGeometry();
  const height=left.clientHeight,scrollTop=left.scrollTop,step=cachedStep;
  if(!height||!step||!slots.length)return;
  const firstIndex=Math.max(0,Math.floor(scrollTop/step)-2);
  const lastIndex=Math.min(slots.length,Math.ceil((scrollTop+height)/step)+3);
  if(!initializedFocus){
   for(let i=0;i<slots.length;i++)if(i<firstIndex||i>=lastIndex)resetFocus(slots[i]);
   initializedFocus=true;
  }
  const current=[];
  const center=scrollTop+height/2,range=Math.max(1,height*.58),fadeRange=Math.max(1,height*.50),maxScale=scaleLimit();
  for(let i=firstIndex;i<lastIndex;i++){
   const slot=slots[i];if(!slot)continue;
   current.push(slot);
   const top=slot.offsetTop,slotHeight=slot.offsetHeight,bottom=top+slotHeight;
   const distance=Math.abs(top+slotHeight/2-center);
   const t=Math.min(1,distance/range),ease=t*t*(3-2*t);
   const fadeT=Math.min(1,distance/fadeRange),fadeEase=fadeT*fadeT*(3-2*fadeT);
   const visible=Math.max(0,Math.min(bottom,scrollTop+height)-Math.max(top,scrollTop));
   const ratio=Math.min(1,visible/Math.max(1,slotHeight));
   const focused=distance<height*.23&&ratio>=.98;
   const scaleText=(1+(maxScale-1)*(1-ease)).toFixed(3);
   const opacityText=Math.max(.025,focused?1:(1-.72*fadeEase)*Math.min(1,ratio*1.8)).toFixed(3);
   let old=focusStyleCache.get(slot);
   if(!old){old={scale:'',opacity:''};focusStyleCache.set(slot,old);}
   if(old.scale!==scaleText){slot.style.setProperty('--mc-focus-scale',scaleText);old.scale=scaleText;}
   if(old.opacity!==opacityText){slot.style.setProperty('--mc-page-opacity',opacityText);old.opacity=opacityText;}
  }
  lastFocusSlots.forEach(slot=>{if(!current.includes(slot))resetFocus(slot);});
  lastFocusSlots=current;
 }
 function cancelWake(){if(wakeTimer){clearTimeout(wakeTimer);wakeTimer=0;}}
 function scheduleWake(){
  cancelWake();
  if(document.hidden||touchActive||mode!=='auto')return;
  const delay=Math.max(0,autoResumeAt-performance.now());
  if(delay>0){wakeTimer=setTimeout(()=>{wakeTimer=0;requestFrame();},delay);}
  else requestFrame();
 }
 function requestFrame(){
  if(document.hidden||frameId)return;
  frameId=requestAnimationFrame(runFrame);
 }
 function normalizeLoopPosition(direction){
  if(normalizing||slots.length<2)return 0;
  measureGeometry();
  normalizing=true;
  let top=left.scrollTop,shift=0,guard=0;
  if(direction<0){
   while(top<=0&&guard++<slots.length){
    const last=slots[slots.length-1],distance=stride(last);
    if(!last||distance<1)break;
    slots.pop();left.insertBefore(last,left.firstElementChild);slots.unshift(last);
    top+=distance;shift+=distance;
   }
  }else{
   while(guard++<slots.length){
    const first=slots[0],distance=stride(first);
    if(!first||distance<1||top<distance)break;
    slots.shift();left.appendChild(first);slots.push(first);
    top-=distance;shift-=distance;
   }
  }
  if(Math.abs(top-left.scrollTop)>.1)left.scrollTop=top;
  if(mode==='wheel'&&shift)wheelTarget+=shift;
  lastObservedScrollTop=left.scrollTop;
  normalizing=false;
  return shift;
 }
 function moveLoop(delta,direction){
  if(!Number.isFinite(delta)||Math.abs(delta)<.01)return;
  loopDirection=direction<0?-1:1;
  left.scrollTop+=delta;
  normalizeLoopPosition(loopDirection);
  lastObservedScrollTop=left.scrollTop;
 }
 function finishWheel(now){
  wheelTarget=left.scrollTop;wheelVelocity=0;mode='auto';
  autoResumeAt=Math.max(autoResumeAt,now+80);
  scheduleWake();
 }
 function runFrame(now){
  frameId=0;
  const dt=lastFrameTime?Math.min(40,Math.max(0,now-lastFrameTime)):16.67;
  lastFrameTime=now;
  try{
   if(mode==='wheel'){
    const diff=wheelTarget-left.scrollTop;
    moveLoop(diff*(1-Math.exp(-dt/30)),Math.sign(diff)||loopDirection);
    wheelVelocity*=Math.exp(-dt/180);
    if(!touchActive&&Math.abs(wheelVelocity)>.008)wheelTarget+=wheelVelocity*dt;
    else if(Math.abs(wheelVelocity)<=.008)wheelVelocity=0;
    if(Math.abs(wheelVelocity)<.025&&Math.abs(wheelTarget-left.scrollTop)<.5)finishWheel(now);
   }else if(mode==='inertia'){
    moveLoop(touchVelocity*dt,Math.sign(touchVelocity)||loopDirection);
    touchVelocity*=Math.exp(-dt/520);
    if(Math.abs(touchVelocity)<.025){
     touchVelocity=0;mode='auto';autoResumeAt=Math.max(autoResumeAt,now+100);
    }
   }else if(mode==='auto'&&!touchActive&&now>=autoResumeAt){
    autoEngage=Math.min(1,autoEngage+dt/1000);
    measureGeometry();
    if(slots.length>1&&cachedCycleHeight>0){
     const speed=cachedCycleHeight/120;
     autoRemainder+=speed*autoEngage*dt/1000;
     const movement=Math.floor(autoRemainder);
     if(movement>=1){autoRemainder-=movement;moveLoop(movement,1);}
    }
   }
   updateFocus();
  }catch(error){
   wheelVelocity=touchVelocity=0;wheelTarget=left.scrollTop;mode=touchActive?'touch':'auto';
   console.warn('[Vegas Octopus] scroll frame recovered:',error);
  }
  if(document.hidden||touchActive)return;
  if(mode==='auto'&&now<autoResumeAt){scheduleWake();return;}
  requestFrame();
 }
 function onWheel(event){
  if(Math.abs(event.deltaY)<.1)return;
  event.preventDefault();event.stopPropagation();
  const unit=event.deltaMode===1?16:event.deltaMode===2?left.clientHeight:1;
  const delta=event.deltaY*unit,now=performance.now();
  cancelWake();autoResumeAt=now+180;autoEngage=Math.min(autoEngage,.28);
  if(mode!=='wheel'){wheelTarget=left.scrollTop;wheelVelocity=0;}
  if(wheelVelocity&&Math.sign(wheelVelocity)!==Math.sign(delta)){
   wheelTarget=left.scrollTop+delta*1.12;wheelVelocity=delta*.018;
  }else{
   wheelTarget+=delta*1.28;
   wheelVelocity=Math.max(-1.2,Math.min(1.2,wheelVelocity+delta*.022));
  }
  mode='wheel';loopDirection=Math.sign(delta)||loopDirection;requestFrame();
 }
 function onTouchStart(event){
  const touch=event.touches[0];if(!touch)return;
  cancelWake();
  if(frameId){cancelAnimationFrame(frameId);frameId=0;}
  mode='touch';lastFrameTime=0;wheelVelocity=0;touchVelocity=0;
  touchStartY=touchLastY=touch.clientY;touchLastTime=performance.now();
  touchActive=true;touchDragging=false;autoResumeAt=performance.now()+1600;autoEngage=0;
 }
 function onTouchMove(event){
  const touch=event.touches[0];if(!touch||!touchActive)return;
  const now=performance.now(),y=touch.clientY,delta=touchLastY-y,elapsed=Math.max(1,now-touchLastTime);
  if(!touchDragging&&Math.abs(y-touchStartY)<8){touchLastY=y;touchLastTime=now;return;}
  touchDragging=true;event.preventDefault();
  if(Math.abs(delta)>.05){
   moveLoop(delta,Math.sign(delta));
   const instant=Math.max(-3.6,Math.min(3.6,delta/elapsed));
   touchVelocity=Math.max(-3.6,Math.min(3.6,touchVelocity*.35+instant*.65));
   autoResumeAt=now+1600;autoEngage=0;
  }
  touchLastY=y;touchLastTime=now;requestFrame();
 }
 function finishTouch(cancelled){
  touchActive=false;touchDragging=false;touchStartY=touchLastY=0;touchLastTime=0;
  if(!cancelled&&Math.abs(touchVelocity)>.035){
   touchVelocity=Math.max(-3.6,Math.min(3.6,touchVelocity*1.25));mode='inertia';lastFrameTime=0;requestFrame();
  }else{
   touchVelocity=0;mode='auto';autoResumeAt=performance.now()+1400;scheduleWake();
  }
 }
 left.addEventListener('wheel',onWheel,{passive:false});
 left.addEventListener('scroll',()=>{
  if(normalizing)return;
  const current=left.scrollTop,delta=current-lastObservedScrollTop;
  if(Math.abs(delta)>.5){
   lastObservedScrollTop=current;
   if(mode==='auto'&&!touchActive){
    loopDirection=delta<0?-1:1;normalizeLoopPosition(loopDirection);
    wheelTarget=left.scrollTop;wheelVelocity=0;autoResumeAt=performance.now()+250;
    scheduleWake();
   }
   requestFrame();
  }
 },{passive:true});
 left.addEventListener('touchstart',onTouchStart,{passive:true});
 left.addEventListener('touchmove',onTouchMove,{passive:false});
 left.addEventListener('touchend',()=>finishTouch(false),{passive:true});
 left.addEventListener('touchcancel',()=>finishTouch(true),{passive:true});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
   cancelWake();if(frameId){cancelAnimationFrame(frameId);frameId=0;}
   lastFrameTime=0;wheelVelocity=touchVelocity=0;touchActive=touchDragging=false;
   mode='auto';wheelTarget=left.scrollTop;lastObservedScrollTop=left.scrollTop;
  }else{
   lastFrameTime=0;autoResumeAt=performance.now()+250;requestFrame();
  }
 },{passive:true});
 window.addEventListener('resize',()=>{invalidateGeometry();requestFrame();},{passive:true});
 left.style.scrollBehavior='auto';
 if('ResizeObserver' in window){
  const geometryObserver=new ResizeObserver(()=>{invalidateGeometry();requestFrame();});
  geometryObserver.observe(left);slots.forEach(slot=>geometryObserver.observe(slot));
 }
 if('IntersectionObserver' in window){
  const motionObserver=new IntersectionObserver(entries=>{
   entries.forEach(entry=>entry.target.classList.toggle('mc-in-view',entry.isIntersecting));
  },{root:left,threshold:.01});
  slots.forEach(slot=>motionObserver.observe(slot));
 }else slots.forEach(slot=>slot.classList.add('mc-in-view'));
 updateFocus();requestFrame();
};
})();