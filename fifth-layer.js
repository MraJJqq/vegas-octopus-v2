/* 第五层：点击小卡片打开透明4H图表。独立实现，不依赖外部脚本文件。 */
(function () {
  'use strict';
  if (window.__VEGAS_FIFTH_LAYER_READY__) return;

  const CARD_SELECTOR = '#market-cards-layer .mc-card[data-symbol]';
  const STOCKS = new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
  const EMA = [
    {period:12,color:'#ffd84a',width:1.7},
    {period:36,color:'#f4f8ff',width:1.2},
    {period:43,color:'#78dcff',width:1.2},
    {period:144,color:'#ffd84a',width:1.2},
    {period:169,color:'#ffad42',width:1.2},
    {period:576,color:'#ff4c62',width:1.4},
    {period:676,color:'#ff4c62',width:1.4}
  ];
  const style = document.createElement('style');
  style.textContent = `
    #v5-chart-overlay[hidden]{display:none!important}
    #v5-chart-overlay{position:fixed;inset:0;z-index:2147483000;display:block;background:transparent;touch-action:none}
    #v5-chart-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:transparent;touch-action:none;cursor:crosshair}
    #v5-chart-status{position:absolute;top:clamp(12px,3vh,28px);left:clamp(12px,3vw,32px);max-width:80vw;color:rgba(220,240,255,.9);font:12px/1.5 Inter,-apple-system,BlinkMacSystemFont,sans-serif;text-shadow:0 0 8px #02040a;pointer-events:none;white-space:normal}
  `;
  document.head.appendChild(style);

  // 已移除临时诊断条，避免在正式界面显示调试文字。
  function diagnosticMessage(_message) {}

  const overlay = document.createElement('div');
  overlay.id = 'v5-chart-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<canvas id="v5-chart-canvas" aria-label="4小时K线与Vegas均线图"></canvas><div id="v5-chart-status" role="status" aria-live="polite"></div>';
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const status = overlay.querySelector('#v5-chart-status');
  const state = {
    symbol:'', name:'', stock:false, candles:[], series:[],
    startTime:null, endTime:null, viewCount:180,
    width:1,height:1,dpr:1, drag:null, request:0, timer:0, generation:0
  };

  function setStatus(message){ status.textContent = message; }
  function candlePath(symbol, stock) {
    const query = new URLSearchParams(stock
      ? {category:'SPOT',symbol,interval:'4H',limit:'1000'}
      : {symbol,productType:'USDT-FUTURES',granularity:'4H',limit:'1000'});
    return stock ? '/api/v3/market/candles?' + query : '/api/v2/mix/market/candles?' + query;
  }
  async function getJson(url) {
    const response = await fetch('https://api.bitget.com' + url, {cache:'no-store'});
    if (!response.ok) throw new Error('行情接口 HTTP ' + response.status);
    const json = await response.json();
    if (json.code !== '00000' || !Array.isArray(json.data)) throw new Error(json.msg || '行情数据格式异常');
    return json.data;
  }
  let stockInfoPromise = null;
  async function resolveStock(symbol) {
    if (!stockInfoPromise) stockInfoPromise = getJson('/api/v3/reality/market/stock-info').catch(error => { stockInfoPromise = null; throw error; });
    const rows = await stockInfoPromise;
    const wanted = symbol.toUpperCase();
    const found = rows.find(row => row && (
      String(row.code || '').toUpperCase() === wanted ||
      String(row.name || '').toUpperCase() === wanted ||
      (wanted === 'SKHYNIX' && /SK\s*HYNIX/i.test(String(row.name || '')))
    ));
    if (!found || !found.symbol) throw new Error('交易所未返回该股票的可用行情代码：' + symbol);
    return String(found.symbol);
  }
  function normalize(rows) {
    const byTime = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const c = {t:Number(row[0]),o:Number(row[1]),h:Number(row[2]),l:Number(row[3]),c:Number(row[4])};
      if (![c.t,c.o,c.h,c.l,c.c].every(Number.isFinite) || c.t <= 0 || c.o <= 0 || c.h <= 0 || c.l <= 0 || c.c <= 0) continue;
      byTime.set(c.t,c);
    }
    return Array.from(byTime.values()).sort((a,b)=>a.t-b.t);
  }
  function calcEma(values, period) {
    const result = Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let previous = null;
    for (let i=0;i<values.length;i++) {
      const value = values[i];
      if (!Number.isFinite(value)) continue;
      previous = previous === null ? value : value*k + previous*(1-k);
      result[i] = previous;
    }
    return result;
  }
  function rebuildSeries() {
    const closes = state.candles.map(c=>c.c);
    state.series = EMA.map(item=>({...item,values:calcEma(closes,item.period)}));
  }
  function visibleIndices() {
    const data=state.candles;
    if (!data.length) return {start:0,end:0};
    let start=state.startTime==null ? Math.max(0,data.length-state.viewCount) : data.findIndex(c=>c.t>=state.startTime);
    if(start<0) start=data.length-1;
    let end=state.endTime==null ? data.length : data.findIndex(c=>c.t>state.endTime);
    if(end<0) end=data.length;
    end=Math.max(start+1,Math.min(data.length,end));
    if(end-start<1) start=Math.max(0,end-state.viewCount);
    return {start,end};
  }
  function fitCanvas() {
    const rect=canvas.getBoundingClientRect();
    state.dpr=Math.max(1,window.devicePixelRatio||1);
    state.width=Math.max(1,rect.width); state.height=Math.max(1,rect.height);
    canvas.width=Math.round(state.width*state.dpr);
    canvas.height=Math.round(state.height*state.dpr);
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    draw();
  }
  function draw() {
    if (overlay.hidden) return;
    const W=state.width,H=state.height;
    ctx.clearRect(0,0,W,H);
    state.hitSegments=[];
    const data=state.candles;
    if(!data.length) return;
    const {start,end}=visibleIndices(), rows=data.slice(start,end);
    if(!rows.length) return;
    const pad={left:8,right:8,top:38,bottom:12};
    const plotW=Math.max(1,W-pad.left-pad.right), plotH=Math.max(1,H-pad.top-pad.bottom);
    const step=plotW/rows.length, bodyW=Math.max(1,Math.min(8,step*.62));
    let min=Infinity,max=-Infinity;
    rows.forEach(c=>{min=Math.min(min,c.l);max=Math.max(max,c.h);});
    state.series.forEach(s=>{for(let i=start;i<end;i++){const v=s.values[i];if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}});
    if(!Number.isFinite(min)||!Number.isFinite(max)) return;
    const margin=(max-min)*.055 || Math.max(max*.004,0.0001); min-=margin; max+=margin;
    const xAt=i=>pad.left+(i-start+.5)*step;
    const yAt=v=>pad.top+(max-v)/(max-min)*plotH;

    rows.forEach((c,j)=>{
      const i=start+j,x=xAt(i),up=c.c>=c.o,color=up?'#2ee6a6':'#ff5c7c';
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,Math.min(1.5,step*.18));
      ctx.beginPath();ctx.moveTo(x,yAt(c.h));ctx.lineTo(x,yAt(c.l));ctx.stroke();
      ctx.fillStyle=color;
      const y1=yAt(Math.max(c.o,c.c)),y2=yAt(Math.min(c.o,c.c));
      ctx.fillRect(x-bodyW/2,y1,bodyW,Math.max(1,y2-y1));
      state.hitSegments.push({x1:x,y1:yAt(c.h),x2:x,y2:yAt(c.l)});
      state.hitSegments.push({x1:x-bodyW/2,y1:y1,x2:x+bodyW/2,y2:y2});
    });
    state.series.forEach(s=>{
      ctx.strokeStyle=s.color;ctx.lineWidth=s.width;ctx.globalAlpha=.92;ctx.beginPath();
      let begun=false;
      for(let i=start;i<end;i++){
        const value=s.values[i];
        if(!Number.isFinite(value)){begun=false;continue;}
        const x=xAt(i),y=yAt(value);
        if(!begun){ctx.moveTo(x,y);begun=true;}else ctx.lineTo(x,y);
      }
      ctx.stroke();ctx.globalAlpha=1;
      let previous=null;
      for(let i=start;i<end;i++){
        const value=s.values[i];
        if(!Number.isFinite(value)){previous=null;continue;}
        const point={x:pad.left+(i-start+.5)*step,y:yAt(value)};
        if(previous) state.hitSegments.push({x1:previous.x,y1:previous.y,x2:point.x,y2:point.y});
        previous=point;
      }
    });
  }
  async function loadData(isRefresh) {
    const generation=++state.generation;
    setStatus(state.name+' · 4H · 正在加载交易所行情…');
    try {
      let apiSymbol=state.symbol;
      if(state.stock) apiSymbol=await resolveStock(state.symbol);
      const rows=normalize(await getJson(candlePath(apiSymbol,state.stock)));
      if(generation!==state.generation || overlay.hidden) return;
      if(rows.length<2) throw new Error('交易所返回的4H K线不足');
      if(isRefresh && state.candles.length) {
        // Merge new data while preserving the exact visible time window.
        const oldStart=state.startTime,oldEnd=state.endTime;
        state.candles=normalize(state.candles.concat(rows));
        rebuildSeries();
        state.startTime=oldStart;
        state.endTime=oldEnd;
      } else {
        state.candles=rows;
        state.viewCount=Math.min(180,rows.length);
        state.endTime=rows[rows.length-1].t;
        state.startTime=rows[Math.max(0,rows.length-state.viewCount)].t;
        rebuildSeries();
      }
      const range=visibleIndices();
      state.viewCount=Math.max(1,range.end-range.start);
      setStatus(state.name+' · 4H · '+state.candles.length+' 根K线 · EMA 12/36/43/144/169/576/676 · 点击留白退出');
      draw();
    } catch(error) {
      if(generation!==state.generation || overlay.hidden) return;
      setStatus(state.name+' · 加载失败：'+String(error&&error.message||error));
      diagnosticMessage('大卡片已打开，但行情请求失败：' + String(error&&error.message||error));
      console.error('[Vegas Fifth Layer]',error);
    }
  }
  function open(card) {
    if(!card || !card.dataset) return;
    const symbol=String(card.dataset.symbol||'').trim().toUpperCase();
    if(!symbol) return;
    state.symbol=symbol;
    state.name=(card.querySelector('.mc-sym')?.childNodes[0]?.textContent||symbol).trim();
    state.stock=STOCKS.has(symbol);
    state.candles=[];state.series=[];state.startTime=null;state.endTime=null;state.viewCount=180;state.drag=null;
    overlay.hidden=false;
    diagnosticMessage('已打开大卡片：' + symbol + '，正在请求行情');
    fitCanvas();
    loadData(false);
    if(state.timer) clearInterval(state.timer);
    state.timer=window.setInterval(()=>{if(!overlay.hidden)loadData(true);},60000);
  }
  function close() {
    overlay.hidden=true;state.drag=null;state.generation++;
    if(state.timer) clearInterval(state.timer);
    state.timer=0;
  }
  function changeZoom(delta) {
    if(!state.candles.length) return;
    const {start,end}=visibleIndices();
    const oldCount=end-start;
    const next=Math.max(12,Math.min(state.candles.length,Math.round(oldCount*(delta<0?.82:1.22))));
    if(next===oldCount) return;
    // Anchor zoom at the latest visible candles on the right edge.
    const anchorTime=state.candles[end-1].t;
    const anchorIndex=state.candles.findIndex(c=>c.t===anchorTime);
    const nextStart=Math.max(0,anchorIndex-next+1);
    state.startTime=state.candles[nextStart].t;
    state.endTime=anchorTime;
    state.viewCount=anchorIndex-nextStart+1;
    draw();
  }
  function pointerDown(e) {
    if(overlay.hidden || !state.candles.length) return;
    const range=visibleIndices();
    state.drag={x:e.clientX,y:e.clientY,startIndex:range.start,endIndex:range.end-1,count:range.end-range.start,moved:false};
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  }
  function pointerMove(e) {
    if(!state.drag || !state.candles.length) return;
    const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
    if(Math.hypot(dx,dy)>5) state.drag.moved=true;
    if(!state.drag.moved) return;
    const plotW=Math.max(1,state.width-16);
    const step=plotW/Math.max(1,state.drag.count);
    const shift=Math.round(-dx/Math.max(1,step));
    const maxStart=Math.max(0,state.candles.length-state.drag.count);
    const startIndex=Math.max(0,Math.min(maxStart,state.drag.startIndex+shift));
    const endIndex=Math.min(state.candles.length-1,startIndex+state.drag.count-1);
    state.startTime=state.candles[startIndex].t;
    state.endTime=state.candles[endIndex].t;
    state.viewCount=endIndex-startIndex+1;
    draw();
  }
  function pointDistance(p,s) {
    const dx=s.x2-s.x1,dy=s.y2-s.y1,len=dx*dx+dy*dy;
    const t=len?Math.max(0,Math.min(1,((p.x-s.x1)*dx+(p.y-s.y1)*dy)/len)):0;
    return Math.hypot(p.x-(s.x1+t*dx),p.y-(s.y1+t*dy));
  }
  function pointerUp(e) {
    if(!state.drag) return;
    const moved=state.drag.moved;state.drag=null;
    if(!moved) {
      const rect=canvas.getBoundingClientRect();
      const p={x:e.clientX-rect.left,y:e.clientY-rect.top};
      const nearest=state.hitSegments.reduce((best,s)=>Math.min(best,pointDistance(p,s)),Infinity);
      if(nearest>12) close();
    }
  }
  // Capture clicks before page-level handlers; pointer events also cover touch devices.
  function findCard(event) {
    const path=typeof event.composedPath==='function'?event.composedPath():[];
    for(const node of path) if(node&&node.matches&&node.matches(CARD_SELECTOR)) return node;
    const target=event.target;
    return target&&target.closest?target.closest(CARD_SELECTOR):null;
  }
  document.addEventListener('click',event=>{
    if(!overlay.hidden) return;
    const card=findCard(event);
    if(!card) {
      const target=event.target;
      if(target && target.closest && target.closest('#market-cards-layer')) {
        diagnosticMessage('收到卡片区域点击，但没有匹配到 .mc-card[data-symbol]');
      }
      return;
    }
    diagnosticMessage('已捕获点击：' + (card.dataset.symbol || '无品种代码') + '，正在打开大卡片');
    event.preventDefault();
    event.stopPropagation();
    open(card);
  },true);
  document.addEventListener('pointerup',event=>{
    if(!overlay.hidden) return;
    const card=findCard(event);
    if(!card) return;
    // iOS and touch browsers can suppress click after gesture handling.
    if(event.pointerType==='touch') open(card);
  },true);
  canvas.addEventListener('pointerdown',pointerDown);
  canvas.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerup',pointerUp);
  canvas.addEventListener('pointercancel',()=>{state.drag=null;});
  canvas.addEventListener('wheel',event=>{
    if(overlay.hidden) return;
    event.preventDefault();changeZoom(event.deltaY);
  },{passive:false});
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
  window.addEventListener('resize',fitCanvas,{passive:true});
  if(window.ResizeObserver) new ResizeObserver(fitCanvas).observe(canvas);
  window.VegasFifthLayer={open,close,refresh:()=>loadData(true),getState:()=>({symbol:state.symbol,visible:!overlay.hidden,candles:state.candles.length})};
  window.__VEGAS_FIFTH_LAYER_READY__=true;
  diagnosticMessage('脚本初始化成功，找到 ' + document.querySelectorAll(CARD_SELECTOR).length + ' 张小卡片，等待点击');
  console.info('[Vegas Fifth Layer] initialized');
})();