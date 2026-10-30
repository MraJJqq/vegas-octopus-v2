/* 底部正式信号板块：复用最新事件模块的数据，不独立判断或制造信号。 */
(()=>{'use strict';
if(window.__VEGAS_BOTTOM_SIGNAL_TICKER__)return;
window.__VEGAS_BOTTOM_SIGNAL_TICKER__=true;
const root=document.getElementById('vegas-signal-ticker');
const track=root&&root.querySelector('.vst-track');
if(!root||!track)return;
const normalize=el=>Array.from(el?el.querySelectorAll('.v9-symbol'):[])
 .map(x=>x.textContent.replace(/[▰]/g,'').trim()).filter(Boolean);
function render(){
 const unique=[...new Set([
  ...normalize(document.getElementById('v9Stocks')),
  ...normalize(document.getElementById('v9Core'))
 ])];
 track.replaceChildren();
 if(!unique.length){
  const empty=document.createElement('span');empty.className='vst-empty';
  empty.textContent='等待正式信号';track.appendChild(empty);
  root.dataset.active='false';return;
 }
 const group=document.createElement('div');group.className='vst-group';
 unique.forEach((label,i)=>{
  const item=document.createElement('span');item.className='vst-item';item.textContent=label;group.appendChild(item);
  if(i<unique.length-1){const sep=document.createElement('span');sep.className='vst-sep';sep.textContent='◆';group.appendChild(sep)}
 });
 track.appendChild(group);
 const width=group.getBoundingClientRect().width;
 if(width<=root.clientWidth){
  track.style.width='100%';track.style.justifyContent='center';
  track.style.animation='none';root.dataset.active='false';return;
 }
 const clone=group.cloneNode(true);clone.setAttribute('aria-hidden','true');track.appendChild(clone);
 track.style.width='max-content';track.style.justifyContent='initial';
 track.style.setProperty('--vst-duration',Math.max(18,width/36)+'s');
 track.style.animation='';root.dataset.active='true';
}
const observer=new MutationObserver(render);
['v9Stocks','v9Core'].forEach(id=>{
 const el=document.getElementById(id);
 if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});
});
window.addEventListener('resize',render,{passive:true});
render();
})();