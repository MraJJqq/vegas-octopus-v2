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
  * 触屏只使用浏览器原生 click 作为唯一激活入口。
  * iPad 的 PointerEvent/touch 滚动接管可能导致 pointerup 与合成 click 时序不一致；
  * 不再在 pointerup 提前打开，避免一次轻触触发两条竞争路径。
  * 鼠标/触控笔仍在 pointerdown 即时打开。
  */
 document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch')return;
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