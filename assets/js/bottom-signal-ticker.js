/* 底部正式信号滚动条：只呈现一行，信号源沿用最新事件模块。 */
(()=>{'use strict';
if(window.__VEGAS_BOTTOM_SIGNAL_TICKER__)return;window.__VEGAS_BOTTOM_SIGNAL_TICKER__=true;
const root=document.getElementById('vegas-signal-ticker'),track=root&&root.querySelector('.vst-track');
if(!root||!track)return;
const normalize=el=>Array.from(el?el.querySelectorAll('.v9-symbol'):[]).map(x=>x.textContent.replace(/[▰]/g,'').trim()).filter(Boolean);
function render(){
 const items=[...normalize(document.getElementById('v9Stocks')),...normalize(document.getElementById('v9Core'))];
 const unique=[...new Set(items)];
 track.replaceChildren();
 if(!unique.length){const empty=document.createElement('span');empty.className='vst-empty';empty.textContent='等待正式信号';track.appendChild(empty);root.dataset.active='false';return}
 const group=document.createElement('div');group.className='vst-group';
 unique.forEach((label,i)=>{const item=document.createElement('span');item.className='vst-item';item.textContent=label;group.appendChild(item);if(i<unique.length-1){const sep=document.createElement('span');sep.className='vst-sep';sep.textContent='◆';group.appendChild(sep)}});
 track.appendChild(group);
 const clone=group.cloneNode(true);clone.setAttribute('aria-hidden','true');track.appendChild(clone);
 const width=group.getBoundingClientRect().width;
 track.style.setProperty('--vst-distance',Math.max(width,1)+'px');
 track.style.setProperty('--vst-duration',Math.max(18,width/36)+'s');
 root.dataset.active='true';
}
const obs=new MutationObserver(render);
['v9Stocks','v9Core'].forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el,{childList:true,subtree:true,characterData:true})});
window.addEventListener('resize',render,{passive:true});
render();
})();