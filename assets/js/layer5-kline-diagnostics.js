/* 第五层悬浮K线故障诊断：只监听、不接管手势、不参与绘制。 */
(()=> {
'use strict';
const root=document.getElementById('vegas-layer5-root');
const host=document.getElementById('vegas-layer5-chart');
if(!root||!host)return;
const KEY='vegas-layer5-diagnostics-v1';
const MAX=60;
let records=[];
let lastSize='';
let activePointers=new Map();
let lastPersist=0;
let longTaskTotal=0;
let longTaskCount=0;
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))records=saved.slice(-MAX)}catch{}
function persist(force=false){
 const now=Date.now();
 if(!force&&now-lastPersist<800)return;
 lastPersist=now;
 try{localStorage.setItem(KEY,JSON.stringify(records.slice(-MAX)))}catch{}
}
function record(type,detail={}){
 records.push({at:new Date().toISOString(),type,...detail});
 if(records.length>MAX)records.splice(0,records.length-MAX);
 persist(type!=='pointer-input');
 if(type==='canvas-context-lost'||type==='window-error'||type==='unhandled-rejection')console.warn('[Vegas Layer 5 diagnostic]',records[records.length-1]);
}
function memory(){
 const m=performance&&performance.memory;
 return m?{usedJSHeapSize:m.usedJSHeapSize,totalJSHeapSize:m.totalJSHeapSize,jsHeapSizeLimit:m.jsHeapSizeLimit}:undefined;
}
function dimensions(){
 const r=host.getBoundingClientRect();
 return {width:Math.round(r.width*10)/10,height:Math.round(r.height*10)/10,dpr:window.devicePixelRatio||1,canvas:[...host.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight}))};
}
function sizeCheck(){
 const d=dimensions(),key=JSON.stringify(d);
 if(key!==lastSize){lastSize=key;record('chart-size',d)}
}
function bindCanvas(canvas){
 if(canvas.dataset.vegasDiag==='1')return;
 canvas.dataset.vegasDiag='1';
 canvas.addEventListener('contextlost',e=>record('canvas-context-lost',{width:canvas.width,height:canvas.height,defaultPrevented:e.defaultPrevented}),false);
 canvas.addEventListener('contextrestored',()=>record('canvas-context-restored',{width:canvas.width,height:canvas.height}),false);
}
function scan(){host.querySelectorAll('canvas').forEach(bindCanvas)}
scan();
if(window.MutationObserver)new MutationObserver(scan).observe(host,{childList:true,subtree:true});
if(window.ResizeObserver)new ResizeObserver(sizeCheck).observe(host);
window.addEventListener('resize',sizeCheck,{passive:true});
['pointerdown','pointerup','pointercancel','lostpointercapture'].forEach(type=>host.addEventListener(type,e=>{
 if(type==='pointerdown')activePointers.set(e.pointerId,e.pointerType||'unknown');
 else activePointers.delete(e.pointerId);
 record('pointer-input',{event:type,pointerType:e.pointerType||'unknown',activePointers:activePointers.size,isPrimary:!!e.isPrimary,...(type==='pointerdown'?{memory:memory()}: {})});
},{capture:true,passive:true}));
document.addEventListener('visibilitychange',()=>record('visibility',{hidden:document.hidden}));
window.addEventListener('pagehide',()=>record('pagehide'));
window.addEventListener('pageshow',e=>record('pageshow',{persisted:!!e.persisted}));
window.addEventListener('error',e=>record('window-error',{message:String(e.message||'unknown').slice(0,160),source:String(e.filename||'').slice(-100),line:e.lineno||0}));
window.addEventListener('unhandledrejection',e=>record('unhandled-rejection',{reason:String(e.reason&&e.reason.message||e.reason||'unknown').slice(0,160)}));
if(window.PerformanceObserver){
 try{new PerformanceObserver(list=>{for(const item of list.getEntries()){longTaskCount++;longTaskTotal+=item.duration} }).observe({entryTypes:['longtask']})}catch{}
}
window.VegasLayer5Diagnostics={
 snapshot:()=>({records:records.slice(),longTaskCount,longTaskTotal:Math.round(longTaskTotal),dimensions:dimensions(),memory:memory()}),
 clear:()=>{records=[];longTaskCount=0;longTaskTotal=0;persist(true)},
 export:()=>JSON.stringify({records,longTaskCount,longTaskTotal,dimensions:dimensions(),memory:memory()},null,2)
};
record('diagnostics-start',{...dimensions(),userAgent:String(navigator.userAgent||'').slice(0,100)});
})();