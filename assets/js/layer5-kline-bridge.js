/* 第五层点击桥接：独立于K线CDN，页面启动后立即接收卡片点击。 */
(()=> {
 'use strict';
 let pending='',ready=false,status=null;
 function feedback(text){
  if(!status){status=document.createElement('div');status.id='vegas-layer5-bridge-status';status.style.cssText='position:fixed;z-index:10001;left:50%;bottom:56px;transform:translateX(-50%);padding:8px 12px;border:1px solid rgba(90,180,255,.35);border-radius:8px;background:rgba(2,8,20,.92);color:#d9edff;font:12px sans-serif;pointer-events:none';document.body.appendChild(status)}
  status.textContent=text;
 }
 function clearFeedback(){if(status){status.remove();status=null}}
 document.addEventListener('click',event=>{
  const card=event.target instanceof Element?event.target.closest('#market-cards-layer .mc-card[data-symbol]'):null;
  if(!card)return;
  const symbol=String(card.dataset.symbol||'').trim().toUpperCase();if(!symbol)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(ready&&typeof window.VegasLayer5Open==='function'){clearFeedback();window.VegasLayer5Open(symbol)}
  else{pending=symbol;feedback('正在加载K线组件 · '+symbol)}
 },true);
 window.VegasLayer5BridgeReady=()=>{
  ready=true;const symbol=pending;pending='';clearFeedback();
  if(symbol&&typeof window.VegasLayer5Open==='function')window.VegasLayer5Open(symbol);
 };
 window.VegasLayer5BridgeFailed=()=>{ready=false;feedback('K线组件加载失败，请检查网络后刷新页面')};
})();