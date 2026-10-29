/* 第五层：悬浮K线独立显示与交互层
 * 依赖 VegasFloatingKlineLogic；不修改第三层卡片模块。
 * 窗口拖动与图表平移/缩放分区处理，支持鼠标与触屏。
 */
(function(){
  'use strict';
  if(window.VegasFloatingKlineUI) return;
  const getLogic=()=>window.VegasFloatingKlineLogic;
  let panel=null,canvas=null,ctx=null,activeSymbol='',state=null,stopLive=null,resizeObserver=null;
  const BASE_VISIBLE_BARS=120,MIN_VISIBLE_BARS=20,MAX_VISIBLE_BARS=5000;
  let openRequestId=0,drawFrame=0;
  const view={scale:1,offset:0,minScale:1,maxScale:BASE_VISIBLE_BARS/MIN_VISIBLE_BARS,drag:null,chartPan:null,pointers:new Map(),pinch:null,baseWidth:0,baseHeight:0,gestureMoved:false,suppressChartClickUntil:0};
  const $=(root,sel)=>root.querySelector(sel);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const isReality=s=>!!(getLogic()&&getLogic().isRealitySymbol(s));
  function ensurePanel(){
    if(panel)return;
    const style=document.createElement('style');
    style.textContent=`
      #vegas-floating-kline{position:fixed;z-index:2147483647;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,calc(100vw - 16px));height:min(620px,calc(100dvh - 16px));max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);display:none;flex-direction:column;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;color:#e8f5ff;overflow:visible;touch-action:none}
      #vegas-floating-kline.vfk-open{display:flex}
      #vegas-floating-kline .vfk-head{position:absolute;z-index:6;left:0;right:0;top:0;height:32px;min-height:32px;display:flex;align-items:flex-start;gap:12px;padding:0;border:0;background:transparent;cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}
      #vegas-floating-kline .vfk-symbol-label{position:absolute;z-index:5;left:8px;top:8px;display:block;margin:0;padding:0;background:transparent;border:0;box-shadow:none;color:#e8f5ff;font:600 14px/1.2 system-ui,-apple-system,"PingFang SC",sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.7);pointer-events:none;user-select:none;-webkit-user-select:none}
      #vegas-floating-kline .vfk-title,#vegas-floating-kline .vfk-hint,#vegas-floating-kline button,#vegas-floating-kline .vfk-status{display:none!important}
      #vegas-floating-kline .vfk-chart-wrap{position:relative;flex:1;min-height:0;margin-top:32px;overflow:hidden;touch-action:none;background:transparent}
      #vegas-floating-kline canvas{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none}
    `;
    document.head.appendChild(style);
    panel=document.createElement('section');
    panel.id='vegas-floating-kline';
    panel.setAttribute('aria-label','悬浮K线图');
    panel.innerHTML='<span class="vfk-symbol-label" aria-live="polite"></span><header class="vfk-head"><span class="vfk-title">K线图</span><span class="vfk-hint">拖动标题栏移动窗口 · 图表双指缩放/单指平移</span><button type="button" data-act="reset">复位</button><button type="button" data-act="close" aria-label="关闭">关闭</button></header><div class="vfk-chart-wrap"><canvas aria-label="4小时K线与EMA指标"></canvas></div><div class="vfk-status">等待行情数据…</div>';
    document.body.appendChild(panel);
    canvas=$(panel,'canvas');ctx=canvas.getContext('2d');
    panel.addEventListener('click',e=>{
      const act=e.target.closest('button')?.dataset.act;
      if(act==='close')closePanel();
      if(act==='reset'){view.scale=1;view.offset=0;draw();}
    });
    const head=$(panel,'.vfk-head');
    head.addEventListener('pointerdown',startWindowDrag);
    head.addEventListener('pointermove',moveWindowDrag);
    head.addEventListener('pointerup',endWindowDrag);
    head.addEventListener('pointercancel',endWindowDrag);
    const wrap=$(panel,'.vfk-chart-wrap');
    wrap.addEventListener('pointerdown',chartPointerDown);
    wrap.addEventListener('pointermove',chartPointerMove);
    wrap.addEventListener('pointerup',chartPointerEnd);
    wrap.addEventListener('pointercancel',chartPointerEnd);
    wrap.addEventListener('wheel',chartWheel,{passive:false});
    resizeObserver=new ResizeObserver(()=>{fitPanelToViewport();draw();});
    resizeObserver.observe(wrap);
    window.addEventListener('resize',fitPanelToViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',fitPanelToViewport,{passive:true});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel();});
  }
  function setStatus(text){if(panel)$(panel,'.vfk-status').textContent=text;}
  function fitPanelToViewport(){
    if(!panel||!panel.classList.contains('vfk-open'))return;
    const viewport=window.visualViewport;
    const vw=Math.max(1,Math.floor(viewport?.width||document.documentElement.clientWidth||innerWidth));
    const vh=Math.max(1,Math.floor(viewport?.height||document.documentElement.clientHeight||innerHeight));
    panel.style.width=Math.min(900,Math.max(1,vw-16))+'px';
    panel.style.height=Math.min(620,Math.max(1,vh-16))+'px';
    const r=panel.getBoundingClientRect();
    if(panel.style.transform&&panel.style.transform!=='none')return;
    const left=clamp(r.left,0,Math.max(0,vw-r.width));
    const top=clamp(r.top,0,Math.max(0,vh-r.height));
    panel.style.left=left+'px';panel.style.top=top+'px';
  }
  function startWindowDrag(e){
    if(e.target.closest('button'))return;
    e.preventDefault();
    try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}
    const r=panel.getBoundingClientRect();
    // 先记录窗口实际坐标，再解除居中变换，避免拖动起点跳位。
    view.drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};
    panel.style.left=r.left+'px';
    panel.style.top=r.top+'px';
    panel.style.transform='translate3d(0,0,0)';
  }
  function moveWindowDrag(e){
    const d=view.drag;if(!d||d.id!==e.pointerId)return;
    e.preventDefault();
    if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)d.moved=true;
    const w=panel.offsetWidth,h=panel.offsetHeight;
    const viewport=window.visualViewport;
    const vw=Math.max(1,Math.floor(viewport?.width||document.documentElement.clientWidth||innerWidth));
    const vh=Math.max(1,Math.floor(viewport?.height||document.documentElement.clientHeight||innerHeight));
    const left=clamp(d.left+e.clientX-d.x,0,Math.max(0,vw-w));
    const top=clamp(d.top+e.clientY-d.y,0,Math.max(0,vh-h));
    panel.style.transform='translate3d('+(left-d.left)+'px,'+(top-d.top)+'px,0)';
  }
  function endWindowDrag(e){
    if(view.drag&&view.drag.id===e.pointerId){
      const d=view.drag,viewport=window.visualViewport;
      const vw=Math.max(1,Math.floor(viewport?.width||document.documentElement.clientWidth||innerWidth));
      const vh=Math.max(1,Math.floor(viewport?.height||document.documentElement.clientHeight||innerHeight));
      const left=clamp(d.left+e.clientX-d.x,0,Math.max(0,vw-panel.offsetWidth));
      const top=clamp(d.top+e.clientY-d.y,0,Math.max(0,vh-panel.offsetHeight));
      panel.style.left=left+'px';panel.style.top=top+'px';panel.style.transform='none';
      view.drag=null;
      if(d.moved)view.suppressChartClickUntil=Date.now()+800;
      try{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}catch(_){}
    }
  }
  function chartPointerDown(e){
    e.preventDefault();
    try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}
    view.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY});
    if(view.pointers.size===1)view.gestureMoved=false;
    else view.gestureMoved=true;
    if(view.pointers.size===1){
      // 图表内单指/鼠标拖动只平移行情，不移动整个悬浮窗口或左上角代码标签。
      view.chartPan={id:e.pointerId,startX:e.clientX,startOffset:view.offset,visible:visibleCount()};
      view.drag=null;
      view.pinch=null;
    }else if(view.pointers.size===2){
      view.chartPan=null;view.drag=null;
      const p=[...view.pointers.values()];
      const rect=canvas.getBoundingClientRect(),midX=(p[0].x+p[1].x)/2;
      view.pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),scale:view.scale,midX,anchor:clamp((midX-rect.left)/Math.max(1,rect.width),0,1),offset:view.offset,visible:visibleCount()};
    }
  }
  function chartPointerMove(e){
    if(!view.pointers.has(e.pointerId))return;
    e.preventDefault();
    const prior=view.pointers.get(e.pointerId);
    if(prior&&Math.hypot(e.clientX-prior.startX,e.clientY-prior.startY)>5)view.gestureMoved=true;
    view.pointers.set(e.pointerId,{...prior,x:e.clientX,y:e.clientY});
    if(view.pointers.size>=2&&view.pinch){
      const p=[...view.pointers.values()];
      const distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
      const total=state?.candles.length||1,limits=getScaleLimits(total);
      const next=clamp(view.pinch.scale*(distance/Math.max(1,view.pinch.distance)),limits.min,limits.max);
      const newVisible=visibleCountForScale(next,total);
      // 以手势起点中心对应的K线为锚点，保留小数偏移减少连续缩放误差。
      view.offset=clamp(view.pinch.offset+(view.pinch.visible-newVisible)*(1-view.pinch.anchor),0,Math.max(0,total-newVisible));
      view.scale=next;draw();
    }else if(view.chartPan&&view.chartPan.id===e.pointerId&&state?.candles?.length){
      const rect=canvas.getBoundingClientRect(),step=Math.max(1,rect.width/view.chartPan.visible);
      const total=state.candles.length;
      view.offset=clamp(view.chartPan.startOffset+((e.clientX-view.chartPan.startX)/step),0,Math.max(0,total-visibleCount()));
      scheduleDraw();
    }
  }
  function chartPointerEnd(e){
    if(view.gestureMoved)view.suppressChartClickUntil=Date.now()+800;
    view.pointers.delete(e.pointerId);
    if(view.chartPan&&view.chartPan.id===e.pointerId)view.chartPan=null;
    if(view.drag&&view.drag.id===e.pointerId){
      const d=view.drag,viewport=window.visualViewport;
      const vw=Math.max(1,Math.floor(viewport?.width||document.documentElement.clientWidth||innerWidth));
      const vh=Math.max(1,Math.floor(viewport?.height||document.documentElement.clientHeight||innerHeight));
      panel.style.left=clamp(d.left+e.clientX-d.x,0,Math.max(0,vw-panel.offsetWidth))+'px';
      panel.style.top=clamp(d.top+e.clientY-d.y,0,Math.max(0,vh-panel.offsetHeight))+'px';
      panel.style.transform='none';view.drag=null;
    }
    if(view.pointers.size<2)view.pinch=null;
    // 双指结束后若剩余一指，重新建立图表平移起点，避免位置跳跃。
    if(view.pointers.size===1){
      const [id,p]=[...view.pointers.entries()][0];
      view.chartPan={id,startX:p.x,startOffset:view.offset,visible:visibleCount()};
    }else view.chartPan=null;
  }
  function getScaleLimits(total){const bars=Math.max(1,Math.min(MAX_VISIBLE_BARS,total||1));return {min:Math.min(1,BASE_VISIBLE_BARS/bars),max:BASE_VISIBLE_BARS/MIN_VISIBLE_BARS};}
  function visibleCountForScale(scale,total=state?.candles?.length||1){const n=Math.max(1,Math.min(MAX_VISIBLE_BARS,total||1));return Math.max(1,Math.min(n,Math.round(BASE_VISIBLE_BARS/Math.max(.0001,scale))));}
  function visibleCount(){return visibleCountForScale(view.scale,state?.candles?.length||1);}
  function chartWheel(e){
    e.preventDefault();if(!state?.candles?.length)return;
    const total=state.candles.length,old=visibleCount(),oldOffset=view.offset,factor=e.deltaY<0?1.15:.87;
    const rect=canvas.getBoundingClientRect(),anchor=clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1),limits=getScaleLimits(total);
    view.scale=clamp(view.scale*factor,limits.min,limits.max);
    const next=visibleCount(),maxOffset=Math.max(0,total-next);
    view.offset=clamp(oldOffset+(old-next)*(1-anchor),0,maxOffset);
    scheduleDraw();
  }
  function scheduleDraw(){if(drawFrame)return;drawFrame=requestAnimationFrame(()=>{drawFrame=0;draw();});}
  // 绘图与点击命中共用同一价格范围算法，避免显示坐标与点击判定不一致。
  function getVisiblePriceRange(rows,ema,start,end){
    let min=Infinity,max=-Infinity;
    const include=value=>{if(Number.isFinite(value)){if(value<min)min=value;if(value>max)max=value;}};
    for(const candle of rows){include(candle.h);include(candle.l);}
    for(const series of ema){
      const values=series.values;
      for(let i=start;i<end;i++)include(values[i]);
    }
    if(!Number.isFinite(min)||!Number.isFinite(max))return null;
    const pad=(max-min)*.08||Math.abs(max)*.005||1;
    return {min,max,lo:min-pad,hi:max+pad};
  }
  function preserveRightEdge(oldCandles,newCandles){
    if(!Array.isArray(oldCandles)||!oldCandles.length||!Array.isArray(newCandles)||!newCandles.length)return;
    const oldEnd=oldCandles.length-Math.floor(view.offset),anchor=oldCandles[Math.max(0,Math.min(oldCandles.length-1,oldEnd-1))];if(!anchor)return;
    const index=newCandles.findIndex(c=>c.t===anchor.t);
    if(index>=0)view.offset=clamp(newCandles.length-1-index,0,Math.max(0,newCandles.length-visibleCountForScale(view.scale,newCandles.length)));
  }
  function updateEmaForLive(logic,oldCandles,newCandles,oldSeries){
    if(!oldCandles?.length||!newCandles?.length||!Array.isArray(oldSeries)||!oldSeries.length)return logic.buildEmaSeries(newCandles);
    const oldLast=oldCandles[oldCandles.length-1],newLast=newCandles[newCandles.length-1],sameLength=oldCandles.length===newCandles.length;
    // 只有最新一根K线被更新时才可增量更新EMA；若收到旧K线修正/乱序数据，必须完整重算。
    let prefixUnchanged=true;
    for(let i=0;i<oldCandles.length-1;i++){
      const a=oldCandles[i],b=newCandles[i];
      if(!b||a.t!==b.t||a.o!==b.o||a.h!==b.h||a.l!==b.l||a.c!==b.c){prefixUnchanged=false;break;}
    }
    const replaced=sameLength&&oldLast.t===newLast.t&&prefixUnchanged;
    const appended=newLast.t>oldLast.t&&(newCandles.length===oldCandles.length+1||(sameLength&&newCandles[0].t>oldCandles[0].t));
    if(!replaced&&!appended)return logic.buildEmaSeries(newCandles);
    const dropped=sameLength&&appended&&newCandles[0].t>oldCandles[0].t;
    // 达到历史上限并移除最老K线时，EMA预热起点改变，完整重算以保证指标精确。
    if(dropped)return logic.buildEmaSeries(newCandles);
    const closes=newCandles.map(c=>c.c),index=newCandles.length-1,output=[];
    for(const series of oldSeries){const period=series.period,values=series.values.slice(),k=2/(period+1);
      if(index<period-1)values[index]=null;
      else if(index===period-1){let sum=0;for(let i=0;i<period;i++)sum+=closes[i];values[index]=sum/period;}
      else{const previous=values[index-1];if(Number.isFinite(previous))values[index]=closes[index]*k+previous*(1-k);else return logic.buildEmaSeries(newCandles);}
      output.push({period,values});}
    return output;
  }
  function draw(){
    if(!canvas||!ctx||!state)return;
    const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    if(canvas.width!==Math.round(w*ratio))canvas.width=Math.round(w*ratio);
    if(canvas.height!==Math.round(h*ratio))canvas.height=Math.round(h*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
    const all=state.candles||[];if(!all.length)return;
    const count=visibleCount(),end=clamp(all.length-Math.floor(view.offset),1,all.length),start=Math.max(0,end-count),rows=all.slice(start,end);
    if(!rows.length)return;
    const ema=state.series||[],range=getVisiblePriceRange(rows,ema,start,end);if(!range)return;
    const {lo,hi}=range;
    const left=2,right=2,top=2,bottom=2,pw=Math.max(1,w-left-right),ph=Math.max(1,h-top-bottom),y=v=>top+(hi-v)/(hi-lo)*ph,step=pw/rows.length,bw=Math.max(1,step*.62);
    ctx.lineWidth=1;
    rows.forEach((c,i)=>{
      const x=left+(i+.5)*step,up=c.c>=c.o,color=up?'#2ee6a6':'#ff5c7c';
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y(c.h));ctx.lineTo(x,y(c.l));ctx.stroke();
      const yo=y(c.o),yc=y(c.c);ctx.fillRect(x-bw/2,Math.min(yo,yc),bw,Math.max(1,Math.abs(yc-yo)));
    });
    const colors=['#f4d35e','#63d7ff','#f78cde','#b7f34a','#ff9f43','#9d8cff','#ffffff'];
    ema.forEach((series,si)=>{
      ctx.beginPath();let begun=false;ctx.strokeStyle=colors[si%colors.length];ctx.lineWidth=1.15;
      series.values.slice(start,end).forEach((v,i)=>{if(!Number.isFinite(v)){begun=false;return}const x=left+(i+.5)*step,yy=y(v);if(!begun){ctx.moveTo(x,yy);begun=true}else ctx.lineTo(x,yy)});
      ctx.stroke();
    });
    setStatus('');
  }
  function formatPrice(v){return v>=1000?v.toLocaleString('en-US',{maximumFractionDigits:2}):v>=1?v.toFixed(3):v.toPrecision(4);}
  async function openPanel(symbol){
    const logic=getLogic();if(!logic){console.error('[悬浮K线] 数据逻辑未加载');return;}
    ensurePanel();closeLiveOnly();
    const requestId=++openRequestId;
    activeSymbol=String(symbol||'').toUpperCase();state=null;view.scale=1;view.offset=0;view.minScale=1;view.maxScale=BASE_VISIBLE_BARS/MIN_VISIBLE_BARS;view.drag=null;view.chartPan=null;view.pointers.clear();view.pinch=null;
    panel.classList.add('vfk-open');panel.style.left='50%';panel.style.top='50%';panel.style.transform='translate(-50%,-50%)';
    $(panel,'.vfk-symbol-label').textContent=activeSymbol;
    $(panel,'.vfk-title').textContent=activeSymbol+' · 4H';
    setStatus('正在加载历史行情…');ctx.clearRect(0,0,canvas.width,canvas.height);
    const requestedSymbol=activeSymbol;
    // 同步读取本地快速缓存，立即绘制；网络更新在后台进行。
    try{state=logic.getInstantHistory?.(requestedSymbol)||null;}catch(_){state=null;}
    if(state){draw();setStatus('');}
    try{
      const fastState=await logic.loadHistory(requestedSymbol,{isReality:isReality(requestedSymbol),fast:true});
      if(requestId!==openRequestId||activeSymbol!==requestedSymbol||!panel.classList.contains('vfk-open'))return;
      if(state&&state.candles?.length){const prior=state.candles;fastState.candles=logic.mergeCandles(fastState.candles,prior).slice(-logic.constants.maxCandles);preserveRightEdge(prior,fastState.candles);}
      state=fastState;
      state.series=logic.buildEmaSeries(state.candles);
      if(activeSymbol!==requestedSymbol||!panel.classList.contains('vfk-open'))return;
      draw();
      setStatus('');
      stopLive=logic.subscribeLive(state.apiSymbol,{isReality:state.isReality,onCandle:c=>{
        if(requestId!==openRequestId||!state||activeSymbol!==requestedSymbol||!panel.classList.contains('vfk-open'))return;
        const prior=state.candles,next=logic.mergeCandles(prior,[c]).slice(-logic.constants.maxCandles);
        if(view.offset>0)preserveRightEdge(prior,next);
        state.candles=next;state.series=updateEmaForLive(logic,prior,next,state.series);scheduleDraw();
      }});
      // 完整历史与长周期 EMA 在后台补齐，不阻塞首次显示。
      logic.loadHistory(requestedSymbol,{isReality:state.isReality,apiSymbol:state.apiSymbol}).then(fullState=>{
        if(requestId!==openRequestId||activeSymbol!==requestedSymbol||!panel.classList.contains('vfk-open'))return;
        const prior=state?.candles||[];fullState.candles=logic.mergeCandles(fullState.candles,prior).slice(-logic.constants.maxCandles);
        preserveRightEdge(prior,fullState.candles);fullState.series=logic.buildEmaSeries(fullState.candles);state=fullState;scheduleDraw();
      }).catch(err=>console.warn('[悬浮K线] 后台补齐历史失败，继续显示已有行情：',err));
    }catch(err){if(requestId===openRequestId&&activeSymbol===requestedSymbol&&panel.classList.contains('vfk-open'))setStatus('行情加载失败：'+(err?.message||String(err)));console.error('[悬浮K线]',err);}
  }
  function closeLiveOnly(){if(stopLive){try{stopLive()}catch(_){}stopLive=null;}}
  function closePanel(){
    openRequestId++;closeLiveOnly();
    view.pointers.clear();view.drag=null;view.chartPan=null;view.pinch=null;view.gestureMoved=false;
    if(panel)panel.classList.remove('vfk-open');
    if(drawFrame){cancelAnimationFrame(drawFrame);drawFrame=0;}
  }
  document.addEventListener('click',e=>{
    const card=e.target.closest('#market-cards-layer .mc-card[data-symbol]');
    if(!card||e.target.closest('button'))return;
    if(e.detail===0)return;
    openPanel(card.dataset.symbol);
  });
  function clickedOnKline(e){
    if(e.target!==canvas||!state?.candles?.length)return false;
    const rect=canvas.getBoundingClientRect();
    const px=e.clientX-rect.left,py=e.clientY-rect.top;
    const all=state.candles,count=visibleCount();
    const end=clamp(all.length-Math.floor(view.offset),1,all.length);
    const start=Math.max(0,end-count),rows=all.slice(start,end);
    if(!rows.length)return false;
    const ema=state.series||[],range=getVisiblePriceRange(rows,ema,start,end);
    if(!range)return false;
    const {lo,hi}=range;
    const w=rect.width,h=rect.height,pw=Math.max(1,w-4),ph=Math.max(1,h-4);
    const y=v=>2+(hi-v)/(hi-lo)*ph,step=pw/rows.length,bw=Math.max(1,step*.62);
    // 只将实际蜡烛（实体与影线）附近视为K线本身。
    for(let i=0;i<rows.length;i++){
      const c=rows[i],x=2+(i+.5)*step;
      if(Math.abs(px-x)<=bw/2+5&&py>=Math.min(y(c.h),y(c.l))-5&&py<=Math.max(y(c.h),y(c.l))+5)return true;
    }
    // EMA曲线也属于图表内容，点击线条附近不关闭。
    for(const series of ema){
      let prev=null;
      for(let i=start;i<end;i++){
        const v=series.values[i];
        if(!Number.isFinite(v)){prev=null;continue;}
        const point={x:2+(i-start+.5)*step,y:y(v)};
        if(prev){
          const dx=point.x-prev.x,dy=point.y-prev.y,len2=dx*dx+dy*dy;
          const t=len2?clamp(((px-prev.x)*dx+(py-prev.y)*dy)/len2,0,1):0;
          if(Math.hypot(px-(prev.x+t*dx),py-(prev.y+t*dy))<=5)return true;
        }
        prev=point;
      }
    }
    return false;
  }
  document.addEventListener('click',e=>{
    if(!panel||!panel.classList.contains('vfk-open'))return;
    // 指针捕获可能使合成 click 的目标落在图表容器而非 canvas；
    // 拖动/缩放结束后的短暂窗口内，屏蔽悬浮窗口内部的合成点击。
    if(Date.now()<view.suppressChartClickUntil&&e.target.closest('#vegas-floating-kline'))return;
    if(e.target.closest('#vegas-floating-kline .vfk-head'))return;
    if(e.target.closest('#vegas-floating-kline')&&!e.target.closest('.vfk-chart-wrap'))return;
    if(clickedOnKline(e))return;
    closePanel();
  },true);
  window.VegasFloatingKlineUI=Object.freeze({open:openPanel,close:closePanel});
  console.info('[悬浮K线界面] 独立显示与触控交互模块已加载。');
})();