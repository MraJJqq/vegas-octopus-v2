/* 底部正式信号播报：正式信号有内容时始终连续横向循环。 */
(()=>{'use strict';
if(window.__VEGAS_BOTTOM_SIGNAL_TICKER__)return;
window.__VEGAS_BOTTOM_SIGNAL_TICKER__=true;
const root=document.getElementById('vegas-signal-ticker'),track=root&&root.querySelector('.vst-track');
if(!root||!track)return;
const normalize=el=>Array.from(el?el.querySelectorAll('.v9-symbol'):[]).map(x=>x.textContent.replace(/[▰]/g,'').trim()).filter(Boolean);
let lastSignature=null;
function render(force=false){
 const unique=[...new Set([...normalize(document.getElementById('v9Stocks')),...normalize(document.getElementById('v9Core'))])];
 const signature=unique.join('|');
 if(!force&&signature===lastSignature)return;
 lastSignature=signature;
 track.replaceChildren();track.style.animation='none';track.style.transform='translateX(0)';
 if(!unique.length){const e=document.createElement('span');e.className='vst-empty';e.textContent='等待正式信号';track.append(e);root.dataset.active='false';return}
 const makeGroup=()=>{const g=document.createElement('div');g.className='vst-group';unique.forEach((label,i)=>{const item=document.createElement('span');item.className='vst-item';item.textContent=label;g.append(item);if(i<unique.length-1){const sep=document.createElement('span');sep.className='vst-sep';sep.textContent='▰';g.append(sep)}});return g};
 const first=makeGroup();track.append(first);
 const width=()=>first.getBoundingClientRect().width;
 let cycleWidth=width();
 if(cycleWidth<1){lastSignature=null;root.dataset.active='false';return}
 const repeats=Math.max(2,Math.ceil((root.clientWidth*2)/cycleWidth));
 for(let i=1;i<repeats;i++)track.append(makeGroup());
 track.style.width='max-content';track.style.justifyContent='initial';
 track.style.setProperty('--vst-distance',cycleWidth+'px');
 track.style.setProperty('--vst-duration',Math.max(18,cycleWidth/36)+'s');
 track.style.animation='vst-marquee var(--vst-duration) linear infinite';
 root.dataset.active='true';
}
let queued=false,forceRender=false;
function schedule(force=false){
 if(queued){forceRender=forceRender||force;return}
 queued=true;forceRender=force;
 requestAnimationFrame(()=>{queued=false;const force=forceRender;forceRender=false;render(force)});
}
const observer=new MutationObserver(()=>schedule());
['v9Stocks','v9Core'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,subtree:true,characterData:true})});
window.addEventListener('resize',()=>schedule(true),{passive:true});render(true);
})();