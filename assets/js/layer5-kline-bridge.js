/* 第五层点击桥接：使用唯一 click 入口，避免 pointerdown/click 双路径竞争。 */
(()=> {
 'use strict';
 let pending='',ready=false,status=null;
 function feedback(text){
  if(!status){
   status=document.createElement('div');status.id='vegas-layer5-bridge-status';
   status.style.cssText='position:fixed;z-index:10001;left:50%;bottom:56px;transform:translateX(-50%);padding:8px 12px;border:1px solid rgba(90,180,255,.35);border-radius:8px;background:rgba(2,8,20,.92);color:#d9edff;font:12px sans-serif;pointer-events:none';
   document.body.appendChild(status);
  }
  status.textContent=text;
 }
 function clearFeedback(){if(status){status.remove();status=null}}
 function activate(symbol){
  if(ready&&typeof window.VegasLayer5Open==='function'){
   clearFeedback();
   window.VegasLayer5Open(symbol);
  }else{
   pending=symbol;
   feedback('正在加载K线组件 · '+symbol);
  }
 }
 function findCard(event){
  const target=event.target;
  return target instanceof Element?target.closest('#market-cards-layer .mc-card[data-symbol]'):null;
 }
 function symbolOf(card){return String(card&&card.dataset.symbol||'').trim().toUpperCase()}
 /*
  * 鼠标、触控笔、触屏统一由原生 click 激活。
  * 不在 pointerdown 提前打开，也不阻止默认指针行为；
  * 这样不会因 pointerdown 与 click 两条路径重复触发而重置行情请求。
  */
 document.addEventListener('click',event=>{
  const card=findCard(event);
  if(!card)return;
  const symbol=symbolOf(card);
  if(!symbol)return;
  event.preventDefault();
  event.stopPropagation();
  activate(symbol);
 },true);
 window.VegasLayer5BridgeReady=()=>{
  ready=true;
  const symbol=pending;
  pending='';
  clearFeedback();
  if(symbol&&typeof window.VegasLayer5Open==='function')window.VegasLayer5Open(symbol);
 };
 window.VegasLayer5BridgeFailed=()=>{
  ready=false;
  feedback('K线组件加载失败，请检查网络后刷新页面');
 };
})();