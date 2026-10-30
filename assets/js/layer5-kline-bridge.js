/* 第五层点击桥接：独立于K线CDN，页面启动后立即接收卡片输入。 */
(()=> {
 'use strict';
 let pending='',ready=false,status=null,lastPointerOpen=null,lastTouchOpen=null,touchCandidate=null;
 function feedback(text){
  if(!status){status=document.createElement('div');status.id='vegas-layer5-bridge-status';status.style.cssText='position:fixed;z-index:10001;left:50%;bottom:56px;transform:translateX(-50%);padding:8px 12px;border:1px solid rgba(90,180,255,.35);border-radius:8px;background:rgba(2,8,20,.92);color:#d9edff;font:12px sans-serif;pointer-events:none';document.body.appendChild(status)}
  status.textContent=text;
 }
 function clearFeedback(){if(status){status.remove();status=null}}
 function activate(symbol){
  if(ready&&typeof window.VegasLayer5Open==='function'){clearFeedback();window.VegasLayer5Open(symbol)}
  else{pending=symbol;feedback('正在加载K线组件 · '+symbol)}
 }
 function findCard(event){
  return event.target instanceof Element?event.target.closest('#market-cards-layer .mc-card[data-symbol]'):null;
 }
 function symbolOf(card){return String(card&&card.dataset.symbol||'').trim().toUpperCase()}
 /*
  * 统一使用 Pointer Events 识别触屏点击，避免 touch/click 合成事件竞争。
  * 触屏在 pointerdown 记录原始卡片，在 pointerup 根据位移判定短按；
  * 滑动、长按和系统取消均不打开图表。
  */
 document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'){
   if(event.isPrimary===false)return;
   const card=findCard(event),symbol=symbolOf(card);
   touchCandidate=symbol?{pointerId:event.pointerId,symbol,x:event.clientX,y:event.clientY,at:Date.now()}:null;
   return;
  }
  if((event.pointerType!=='mouse'&&event.pointerType!=='pen')||event.button!==0||event.isPrimary===false)return;
  const card=findCard(event);if(!card)return;
  const symbol=symbolOf(card);if(!symbol)return;
  event.preventDefault();event.stopImmediatePropagation();
  lastPointerOpen={symbol,at:Date.now()};
  activate(symbol);
 },true);
 document.addEventListener('pointerup',event=>{
  if(event.pointerType!=='touch'||!touchCandidate||event.pointerId!==touchCandidate.pointerId)return;
  const candidate=touchCandidate;touchCandidate=null;
  const moved=Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y);
  const elapsed=Date.now()-candidate.at;
  if(moved>18||elapsed>1500)return;
  lastTouchOpen={symbol:candidate.symbol,at:Date.now()};
  activate(candidate.symbol);
 },true);
 document.addEventListener('pointercancel',event=>{
  if(touchCandidate&&event.pointerId===touchCandidate.pointerId)touchCandidate=null;
 },true);
 document.addEventListener('click',event=>{
  const card=findCard(event);if(!card)return;
  const symbol=symbolOf(card);if(!symbol)return;
  if(lastPointerOpen&&lastPointerOpen.symbol===symbol&&Date.now()-lastPointerOpen.at<1000){
   lastPointerOpen=null;event.preventDefault();event.stopImmediatePropagation();return;
  }
  if(lastTouchOpen&&lastTouchOpen.symbol===symbol&&Date.now()-lastTouchOpen.at<1200){
   lastTouchOpen=null;event.preventDefault();event.stopImmediatePropagation();return;
  }
  lastPointerOpen=null;
  event.preventDefault();event.stopImmediatePropagation();
  activate(symbol);
 },true);
 window.VegasLayer5BridgeReady=()=>{
  ready=true;const symbol=pending;pending='';clearFeedback();
  if(symbol&&typeof window.VegasLayer5Open==='function')window.VegasLayer5Open(symbol);
 };
 window.VegasLayer5BridgeFailed=()=>{ready=false;feedback('K线组件加载失败，请检查网络后刷新页面')};
})();