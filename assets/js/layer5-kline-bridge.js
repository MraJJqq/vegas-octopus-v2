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
  * iPad/iPhone：不用合成 click 作为主要触发条件。
  * touchstart 记录卡片，touchend 在位移很小的短按时打开；
  * 有明显位移的手势仍交给卡片列表滚动逻辑。
  */
 document.addEventListener('touchstart',event=>{
  const touch=event.changedTouches&&event.changedTouches[0];
  const card=findCard(event);
  if(!touch||!card){touchCandidate=null;return}
  touchCandidate={identifier:touch.identifier,x:touch.clientX,y:touch.clientY,symbol:symbolOf(card),at:Date.now()};
 },{capture:true,passive:true});
 document.addEventListener('touchend',event=>{
  if(!touchCandidate)return;
  const candidate=touchCandidate;touchCandidate=null;
  const touch=Array.from(event.changedTouches||[]).find(item=>item.identifier===candidate.identifier);
  if(!touch||!candidate.symbol||Date.now()-candidate.at>1200)return;
  const moved=Math.hypot(touch.clientX-candidate.x,touch.clientY-candidate.y);
  if(moved>10)return;
  lastTouchOpen={symbol:candidate.symbol,at:Date.now()};
  activate(candidate.symbol);
 },{capture:true,passive:true});
 document.addEventListener('touchcancel',()=>{touchCandidate=null},{capture:true,passive:true});
 /*
  * 鼠标/触控笔在 pointerdown 阶段立即打开。
  * 不再等待 click：卡片有 3D 倾斜与浮动变换，按下到抬起期间命中目标可能变化，
  * 浏览器因此可能不派发目标卡片的 click，表现为需要连续点击。
  * 触屏仍沿用 click，避免手指开始滚动时误打开图表。
  */
 document.addEventListener('pointerdown',event=>{
  if((event.pointerType!=='mouse'&&event.pointerType!=='pen')||event.button!==0||event.isPrimary===false)return;
  const card=findCard(event);if(!card)return;
  const symbol=symbolOf(card);if(!symbol)return;
  event.preventDefault();event.stopImmediatePropagation();
  lastPointerOpen={symbol,at:Date.now()};
  activate(symbol);
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