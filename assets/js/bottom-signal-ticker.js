/* 底部信号播报：按 Bark 模板展示两个分类，并连续横向循环。 */
(()=>{'use strict';
if(window.__VEGAS_BOTTOM_SIGNAL_TICKER__)return;
window.__VEGAS_BOTTOM_SIGNAL_TICKER__=true;
const root=document.getElementById('vegas-signal-ticker'),track=root&&root.querySelector('.vst-track');
if(!root||!track)return;
const GROUPS=[['v9Stocks','🔸 美股巨头'],['v9Core','🔸 核心能源']];
let lastSignature=null;
function readGroup(id){
 const source=document.getElementById(id);
 if(!source)return{ready:false,symbols:[]};
 const symbols=Array.from(source.querySelectorAll('.v9-symbol'))
  .map(node=>node.textContent.replace(/[▰]/g,'').trim()).filter(Boolean);
 const empty=source.querySelector('.v9-nochange');
 if(empty&&empty.textContent.trim()!=='▰ No change ▰')
  return{ready:false,message:empty.textContent.trim(),symbols:[]};
 if(!symbols.length&&!empty)return{ready:false,symbols:[]};
 return{ready:true,symbols};
}
function makeGroup(label,state){
 const group=document.createElement('div');group.className='vst-group';
 const heading=document.createElement('span');heading.className='vst-heading';heading.textContent=label;group.append(heading);
 const content=document.createElement('div');content.className='vst-content';
 if(state.symbols.length){
  state.symbols.forEach(symbol=>{
   const item=document.createElement('span');item.className='vst-item';item.textContent='▰ '+symbol+' ▰';content.append(item);
  });
 }else{
  const empty=document.createElement('span');empty.className='vst-nochange';empty.textContent='▰ No change ▰';content.append(empty);
 }
 group.append(content);return group;
}
function render(force=false){
 const states=GROUPS.map(([id])=>readGroup(id));
 const signature=states.map(s=>JSON.stringify(s)).join('|');
 if(!force&&signature===lastSignature)return;
 lastSignature=signature;
 track.replaceChildren();track.style.animation='none';track.style.transform='translateX(0)';
 if(states.some(s=>!s.ready)){
  const message=states.find(s=>s.message)?.message||'等待正式信号';
  const empty=document.createElement('span');empty.className='vst-empty';empty.textContent=message;track.append(empty);
  root.dataset.active='false';return;
 }
 const first=document.createElement('div');first.className='vst-cycle';
 GROUPS.forEach(([id,label],index)=>first.append(makeGroup(label,states[index])));
 track.append(first);
 const cycleWidth=first.getBoundingClientRect().width;
 if(cycleWidth<1){lastSignature=null;root.dataset.active='false';return;}
 const repeats=Math.max(2,Math.ceil((root.clientWidth*2)/cycleWidth));
 for(let i=1;i<repeats;i++)track.append(first.cloneNode(true));
 track.style.width='max-content';track.style.justifyContent='initial';
 track.style.setProperty('--vst-distance',cycleWidth+'px');
 track.style.setProperty('--vst-duration',Math.max(18,cycleWidth/36)+'s');
 track.style.animation='vst-marquee var(--vst-duration) linear infinite';
 root.dataset.active='true';
}
let queued=false,forceRender=false;
function schedule(force=false){
 if(queued){forceRender=forceRender||force;return;}
 queued=true;forceRender=force;
 requestAnimationFrame(()=>{queued=false;const force=forceRender;forceRender=false;render(force);});
}
const observer=new MutationObserver(()=>schedule());
['v9Stocks','v9Core'].forEach(id=>{const node=document.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true,characterData:true});});
window.addEventListener('resize',()=>schedule(true),{passive:true});
render(true);
})();