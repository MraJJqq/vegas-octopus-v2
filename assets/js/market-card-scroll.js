/* Vegas 章鱼｜第三层独立滚动引擎
 * 仅负责卡片列表的自动/手动/触屏滚动、循环校正、焦点缩放与视口动画观察。
 * 不创建卡片、不处理行情数据、不修改卡片模板或视觉 CSS。
 */
(function(){
'use strict';
window.VegasMarketCardScrollInit=function(left,initialFocusSlots){
 if(!left||!Array.isArray(initialFocusSlots)){console.error('[Vegas Scroll] invalid initializer arguments');return;}
/* 统一滚动控制器：自动、滚轮、触屏共用唯一位移与循环校正入口。
   卡片 DOM、悬浮层结构、尺寸和视觉样式保持不变。 */
let cachedCardStep=0,cachedCardGap=null,cachedScaleMax=null;
function invalidateCardGeometry(){cachedCardStep=0;cachedCardGap=null;cachedScaleMax=null;}
function cardGap(){
 if(cachedCardGap!==null)return cachedCardGap;
 const value=parseFloat(getComputedStyle(left).rowGap);
 cachedCardGap=Number.isFinite(value)?Math.max(0,value):0;
 return cachedCardGap;
}
function slotStride(slot){
 return slot?Math.max(1,slot.offsetHeight+cardGap()):0;
}
function cardStep(){
 if(cachedCardStep>0)return cachedCardStep;
 cachedCardStep=slotStride(left.firstElementChild);
 return cachedCardStep;
}
let focusSlots=initialFocusSlots;
let focusFrame=0;
const focusStyleCache=new WeakMap();
function updateFocusScale(){
 focusFrame=0;
 const height=left.clientHeight,scrollTop=left.scrollTop,center=scrollTop+height/2,range=Math.max(1,height*.58),fadeRange=Math.max(1,height*.50);
 const first=focusSlots[0],step=cardStep();
 if(!first||!step)return;
 if(cachedScaleMax===null){
  const firstCard=first.querySelector('.mc-card'),cardWidth=Math.max(1,firstCard?.offsetWidth||first.clientWidth);
  const firstStyle=getComputedStyle(first),padX=(parseFloat(firstStyle.paddingLeft)||0)+(parseFloat(firstStyle.paddingRight)||0);
  const available=Math.max(1,first.clientWidth-padX-8);
  cachedScaleMax=Math.min(1.16,available/cardWidth);
 }
 const scaleMax=cachedScaleMax;
 const firstIndex=Math.max(0,Math.floor(scrollTop/step)-2);
 const lastIndex=Math.min(focusSlots.length,Math.ceil((scrollTop+height)/step)+3);
 for(let index=0;index<focusSlots.length;index++){
  const slot=focusSlots[index];
  let previous=focusStyleCache.get(slot);
  if(!previous){previous={scale:'',opacity:''};focusStyleCache.set(slot,previous)}
  if(index<firstIndex||index>=lastIndex){
   if(previous.scale!=='1.000'){slot.style.setProperty('--mc-focus-scale','1.000');previous.scale='1.000'}
   if(previous.opacity!=='0.025'){slot.style.setProperty('--mc-page-opacity','0.025');previous.opacity='0.025'}
   continue;
  }
  const top=slot.offsetTop,slotHeight=slot.offsetHeight,bottom=top+slotHeight,distance=Math.abs((top+slotHeight/2)-center);
  const t=Math.min(1,distance/range),ease=t*t*(3-2*t),fadeT=Math.min(1,distance/fadeRange),fadeEase=fadeT*fadeT*(3-2*fadeT);
  const visible=Math.max(0,Math.min(bottom,scrollTop+height)-Math.max(top,scrollTop)),ratio=Math.min(1,visible/Math.max(1,slotHeight)),focused=distance<height*.23&&ratio>=.98;
  const scale=1+(scaleMax-1)*(1-ease),opacity=focused?1:(1-.72*fadeEase)*Math.min(1,ratio*1.8);
  const scaleText=scale.toFixed(3),opacityText=Math.max(.025,opacity).toFixed(3);
  if(previous.scale!==scaleText){slot.style.setProperty('--mc-focus-scale',scaleText);previous.scale=scaleText}
  if(previous.opacity!==opacityText){slot.style.setProperty('--mc-page-opacity',opacityText);previous.opacity=opacityText}
 }
}
function queueFocusScale(){if(!focusFrame)focusFrame=requestAnimationFrame(updateFocusScale)}
let manualTarget=left.scrollTop,manualVelocity=0,manualFrame=0,manualLastTime=0;
let autoResumeAt=0,touchActive=false,touchDragging=false,touchStartY=0,touchLastY=0,touchLastTime=0,touchVelocity=0;
let autoLastTime=0,autoEngageLastTime=0,autoEngage=1,autoRemainder=0;
let autoFrame=0,autoTimer=0,loopDirection=1,lastObservedScrollTop=left.scrollTop;
let normalizing=false;
function normalizeLoopPosition(direction){
 if(normalizing||focusSlots.length<2)return 0;
 const step=cardStep();if(step<1)return 0;
 normalizing=true;
 let top=left.scrollTop,shift=0,guard=0;
 if(direction<0){
  while(top<=0&&guard++<focusSlots.length){
   const last=focusSlots[focusSlots.length-1],distance=slotStride(last);
   if(!last||distance<1)break;
   focusSlots.pop();left.insertBefore(last,left.firstElementChild);focusSlots.unshift(last);
   top+=distance;shift+=distance;
  }
 }else{
  while(guard++<focusSlots.length){
   const first=focusSlots[0],distance=slotStride(first);
   if(!first||distance<1||top<distance)break;
   focusSlots.shift();left.appendChild(first);focusSlots.push(first);
   top-=distance;shift-=distance;
  }
 }
 if(Math.abs(top-left.scrollTop)>.1)left.scrollTop=top;
 if(manualFrame&&shift)manualTarget+=shift;
 lastObservedScrollTop=left.scrollTop;
 normalizing=false;
 return shift;
}
function moveLoop(delta,direction,source){
 if(!Number.isFinite(delta)||Math.abs(delta)<.01)return;
 loopDirection=direction<0?-1:1;
 left.scrollTop+=delta;
 normalizeLoopPosition(loopDirection);
 if(source==='manual')manualTarget=left.scrollTop;
 lastObservedScrollTop=left.scrollTop;
 queueFocusScale();
}
function scheduleAutoScroll(){
 if(document.hidden||autoFrame||autoTimer)return;
 autoTimer=window.setTimeout(()=>{
  autoTimer=0;
  if(!document.hidden)autoFrame=requestAnimationFrame(runAutoScroll);
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
   const step=cardStep();
   if(focusSlots.length>1&&step>0){
    const speed=Math.max(.1,step*focusSlots.length/120);
    autoRemainder+=speed*autoEngage*dt;
    const movement=Math.floor(autoRemainder);
    if(movement>=1){autoRemainder-=movement;moveLoop(movement,1,'auto')}
   }
  }
 }catch(error){console.warn('[Vegas Octopus] unified auto-scroll recovered:',error)}
 finally{scheduleAutoScroll()}
}
function pauseAutoScroll(){
 if(autoFrame){cancelAnimationFrame(autoFrame);autoFrame=0}
 if(autoTimer){clearTimeout(autoTimer);autoTimer=0}
 autoLastTime=0;autoEngageLastTime=0;
}
function applyWheelDelta(delta){
 if(Math.abs(delta)<.1)return;
 const now=performance.now();
 autoResumeAt=now+180;
 autoEngage=Math.min(autoEngage,.28);autoEngageLastTime=now;
 const direction=delta<0?-1:1;
 if(!manualFrame){manualTarget=left.scrollTop;manualVelocity=0;manualLastTime=0}
 const reversing=manualVelocity!==0&&Math.sign(manualVelocity)!==Math.sign(delta);
 if(reversing){
  manualTarget=left.scrollTop+delta*1.12;manualVelocity=delta*.018;
 }else{
  manualTarget+=delta*1.28;manualVelocity=Math.max(-1.2,Math.min(1.2,manualVelocity+delta*.022));
 }
 loopDirection=direction;
 if(!manualFrame)manualFrame=requestAnimationFrame(runManualScroll);
}
function runManualScroll(now){
 try{
  if(!manualLastTime)manualLastTime=now;
  const dt=Math.min(32,Math.max(1,now-manualLastTime));manualLastTime=now;
  const current=left.scrollTop,diff=manualTarget-current,ease=1-Math.exp(-dt/30);
  moveLoop(diff*ease,Math.sign(diff)||loopDirection,'manual');
  manualVelocity*=Math.exp(-dt/180);
  if(!touchActive&&Math.abs(manualVelocity)>.008)manualTarget+=manualVelocity*dt;
  else if(Math.abs(manualVelocity)<=.008)manualVelocity=0;
  if(Math.abs(manualVelocity)<.025&&Math.abs(manualTarget-left.scrollTop)<.5){
   manualTarget=left.scrollTop;manualVelocity=0;manualFrame=0;manualLastTime=0;
   autoResumeAt=Math.max(autoResumeAt,now+(touchActive?1400:80));
   return;
  }
  manualFrame=requestAnimationFrame(runManualScroll);
 }catch(error){
  manualTarget=left.scrollTop;manualVelocity=0;manualFrame=0;manualLastTime=0;
  autoResumeAt=performance.now()+120;
  console.warn('[Vegas Octopus] manual-scroll frame recovered:',error);
  queueFocusScale();
 }
}
left.addEventListener('wheel',e=>{
 if(Math.abs(e.deltaY)<.1)return;
 e.preventDefault();e.stopPropagation();
 const unit=e.deltaMode===1?16:e.deltaMode===2?left.clientHeight:1;
 applyWheelDelta(e.deltaY*unit);
},{passive:false});
left.addEventListener('scroll',()=>{
 if(normalizing)return;
 const current=left.scrollTop,delta=current-lastObservedScrollTop;
 if(!manualFrame&&!touchActive&&Math.abs(delta)>.5){
  loopDirection=delta<0?-1:1;
  normalizeLoopPosition(loopDirection);
  manualTarget=left.scrollTop;manualVelocity=0;
 }
 lastObservedScrollTop=left.scrollTop;
 queueFocusScale();
},{passive:true});
/* 触摸拖动直接映射手指位移；松手后独立执行高质量惯性衰减。 */
function runTouchInertia(now){
 try{
  if(!manualLastTime)manualLastTime=now;
  const dt=Math.min(32,Math.max(1,now-manualLastTime));manualLastTime=now;
  moveLoop(touchVelocity*dt,Math.sign(touchVelocity)||loopDirection,'manual');
  touchVelocity*=Math.exp(-dt/520);
  if(Math.abs(touchVelocity)<.025){
   touchVelocity=0;manualFrame=0;manualLastTime=0;manualTarget=left.scrollTop;
   autoResumeAt=Math.max(autoResumeAt,now+100);
   return;
  }
  manualFrame=requestAnimationFrame(runTouchInertia);
 }catch(error){
  touchVelocity=0;manualFrame=0;manualLastTime=0;manualTarget=left.scrollTop;
  autoResumeAt=performance.now()+120;
  console.warn('[Vegas Octopus] touch inertia recovered:',error);
  queueFocusScale();
 }
}
left.addEventListener('touchstart',e=>{
 const touch=e.touches[0];if(!touch)return;
 if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
 manualLastTime=0;manualVelocity=0;touchVelocity=0;
 touchStartY=touchLastY=touch.clientY;touchLastTime=performance.now();
 touchActive=true;touchDragging=false;
 manualTarget=left.scrollTop;autoResumeAt=performance.now()+1600;autoEngage=0;
},{passive:true});
left.addEventListener('touchmove',e=>{
 const touch=e.touches[0];if(!touch||!touchActive)return;
 const now=performance.now(),y=touch.clientY,delta=touchLastY-y,dt=Math.max(1,now-touchLastTime);
 if(!touchDragging&&Math.abs(y-touchStartY)<8){touchLastY=y;touchLastTime=now;return}
 touchDragging=true;e.preventDefault();
 if(Math.abs(delta)>.05){
  /* 拖动阶段不做追赶缓动：一帧内完成与手指等量位移。 */
  moveLoop(delta,Math.sign(delta),'manual');
  const instant=Math.max(-3.6,Math.min(3.6,delta/dt));
  touchVelocity=Math.max(-3.6,Math.min(3.6,touchVelocity*.35+instant*.65));
  manualTarget=left.scrollTop;
  autoResumeAt=now+1600;autoEngage=Math.min(autoEngage,.0);
 }
 touchLastY=y;touchLastTime=now;
},{passive:false});
function finishTouch(cancelled){
 touchActive=false;touchDragging=false;touchStartY=touchLastY=0;touchLastTime=0;
 if(!cancelled&&Math.abs(touchVelocity)>.035){
  /* 适度放大释放速度，520ms时间常数带来更长、更连贯的滑行。 */
  touchVelocity=Math.max(-3.6,Math.min(3.6,touchVelocity*1.25));
  manualLastTime=0;
  if(!manualFrame)manualFrame=requestAnimationFrame(runTouchInertia);
 }else touchVelocity=0;
 autoResumeAt=performance.now()+1400;
}
left.addEventListener('touchend',()=>finishTouch(false),{passive:true});
left.addEventListener('touchcancel',()=>finishTouch(true),{passive:true});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){
  pauseAutoScroll();
  if(manualFrame){cancelAnimationFrame(manualFrame);manualFrame=0}
  manualLastTime=0;manualVelocity=0;manualTarget=left.scrollTop;
  /* 页面切后台时可能收不到 touchend；强制释放触摸门控，避免恢复后自动滚动永久暂停。 */
  touchActive=false;touchDragging=false;touchVelocity=0;
  touchStartY=touchLastY=0;touchLastTime=0;
 }else{
  autoLastTime=0;autoEngageLastTime=0;autoResumeAt=performance.now()+250;
  scheduleAutoScroll();
 }
},{passive:true});
window.addEventListener('resize',()=>{
 invalidateCardGeometry();queueFocusScale();
},{passive:true});
left.style.scrollBehavior='auto';
if('ResizeObserver' in window){
 const stepObserver=new ResizeObserver(()=>{invalidateCardGeometry();queueFocusScale()});
 stepObserver.observe(left);
 focusSlots.forEach(slot=>stepObserver.observe(slot));
}
queueFocusScale();
scheduleAutoScroll();
/* 统一控制器已完成尺寸监听与焦点初始化。 */
/* 只让视口附近的卡片运行浮动与阴影动画，减少平板 GPU 合成开销。 */
if('IntersectionObserver' in window){
 const cardMotionObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>entry.target.classList.toggle('mc-in-view',entry.isIntersecting));
 },{root:left,threshold:0.01});
 focusSlots.forEach(slot=>cardMotionObserver.observe(slot));
}else{
 focusSlots.forEach(slot=>slot.classList.add('mc-in-view'));
}

};
})();
