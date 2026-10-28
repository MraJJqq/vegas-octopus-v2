/* 第五层：Bitget 原生 4H K 线悬浮图表；Reality 美股使用现货 rToken，其他品种使用 U 本位合约。 */
(function () {
  'use strict';
  if (window.__VEGAS_FIFTH_LAYER_READY__) return;

  const CARD_SELECTOR = '#market-cards-layer .mc-card[data-symbol]';
  // 先使用与卡片名称完全对应的合约；别名仅作为交易所实际代码不一致时的后备。
  const REALITY_STOCKS = new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
  const CONTRACT_ALIASES={SKHYNIX:['SKHYNIXUSDT','SKHYUSDT']};
  const CONTRACT_CANDIDATES=symbol=>{const name=String(symbol||'').trim().toUpperCase();return [...(CONTRACT_ALIASES[name]||[]),name.endsWith('USDT')?name:name+'USDT'].filter((value,index,list)=>value&&list.indexOf(value)===index);};
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
    #vegas-chart-overlay[hidden]{display:none!important}
    /* 全屏透明悬浮层：K线始终处于最高层，底层场景仍透出。 */
    body>#vegas-chart-overlay{
      position:fixed!important;
      inset:0!important;
      width:100vw!important;
      height:100vh!important;
      height:100dvh!important;
      margin:0!important;padding:0!important;
      transform:none!important;
      z-index:2147483647!important;
      isolation:isolate;display:block;
      background:transparent!important;
      pointer-events:none;
      touch-action:none;overscroll-behavior:contain;
    }
    #vegas-chart-canvas{
      position:absolute;inset:0;width:100%;height:100%;
      display:block;background:transparent;
      pointer-events:auto;touch-action:none;cursor:grab;
    }
    #vegas-chart-canvas:active{cursor:grabbing}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'vegas-chart-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<canvas id="vegas-chart-canvas" aria-label="4小时K线与Vegas均线图"></canvas>';
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const state = {
    symbol:'', contractSymbol:'', candles:[], series:[], ws:null, wsReconnect:0, wsHeartbeat:0, pendingDraw:false,
    startTime:null, endTime:null, viewCount:720,
    width:1,height:1,dpr:1, drag:null, timer:0, generation:0, dataRequest:0, pendingRefresh:false, priceShift:0, panX:0, error:''
  };

  const EMA_WARMUP_BARS = 1400;
  const MAX_CANDLE_BARS = 1600;
  const PREWARM_CACHE = new Map();
  const PREWARM_MAX_AGE = 4 * 60 * 60 * 1000;
  const INITIAL_HISTORY_MS = 90 * 24 * 60 * 60 * 1000;

  function candlePath(symbol,endTime,isReality=false){
    if(isReality){const q=new URLSearchParams({category:'SPOT',symbol,interval:'4H',limit:'1000',...(Number.isFinite(endTime)?{endTime:String(endTime)}:{})});return '/api/v3/market/candles?'+q;}
    const q=new URLSearchParams({productType:'USDT-FUTURES',symbol,granularity:'4H',limit:'1000',...(Number.isFinite(endTime)?{endTime:String(endTime)}:{})});return '/api/v2/mix/market/candles?'+q;
  }
  function historyCandlePath(symbol,endTime,isReality=false){
    if(isReality){const q=new URLSearchParams({category:'SPOT',symbol,interval:'4H',limit:'200',endTime:String(endTime)});return '/api/v3/market/history-candles?'+q;}
    const q=new URLSearchParams({productType:'USDT-FUTURES',symbol,granularity:'4H',limit:'200',endTime:String(endTime)});return '/api/v2/mix/market/history-candles?'+q;
  }

  async function loadCandlesWithWarmup(apiSymbol,isReality=false) {
    const latest = normalize(await getJson(candlePath(apiSymbol,undefined,isReality)));
    if (latest.length < 2) throw new Error('交易所返回的4H K线不足');

    // EMA_WARMUP_BARS 是总目标根数，不是额外追加的历史根数。
    // 最新接口已返回的 K 线计入目标，减少不必要的历史请求和限频风险。
    let combined = latest;
    let pages = 0;
    const maxPages = Math.ceil(EMA_WARMUP_BARS / 200) + 1;
    while (combined.length < EMA_WARMUP_BARS && pages < maxPages) {
      const oldest = combined[0];
      if (!oldest || !Number.isFinite(oldest.t)) break;
      let rawPage;
      try {
        rawPage = await getJson(historyCandlePath(apiSymbol, oldest.t - 1,isReality));
      } catch (error) {
        // 历史预热属于可选增强；历史端点失败时仍使用已经成功取得的原生4H K线。
        console.warn('[Vegas Fifth Layer] 历史预热请求失败，继续使用已有4H K线：' + apiSymbol, error);
        break;
      }
      pages++;
      const page = normalize(rawPage);
      if (!page.length) break;
      const next = normalize(page.concat(combined));
      if (next.length <= combined.length || next[0].t >= oldest.t) break;
      combined = next;
      if (page.length < 200) break;
    }
    if (combined.length < EMA_WARMUP_BARS) {
      console.warn('[Vegas Fifth Layer] EMA历史预热不足：' + apiSymbol +
        '，已取得 ' + combined.length + '/' + EMA_WARMUP_BARS + ' 根总K线');
    }
    return combined.slice(-MAX_CANDLE_BARS);
  }
  async function getJson(url) {
    const response = await fetch('https://api.bitget.com' + url, {cache:'no-store'});
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.text()).slice(0,240); } catch (_) {}
      throw new Error('行情接口 HTTP ' + response.status + ' · ' + url + (detail ? ' · ' + detail : ''));
    }
    const json = await response.json();
    if (json.code !== '00000' || !Array.isArray(json.data)) throw new Error((json.msg || '行情数据格式异常') + ' · ' + url);
    return json.data;
  }
  let contractInfoPromise=null;
  let realityInfoPromise=null;
  async function resolveRealitySymbol(symbol){
    if(!realityInfoPromise)realityInfoPromise=getJson('/api/v3/reality/market/stock-info').catch(error=>{realityInfoPromise=null;throw error;});
    const rows=await realityInfoPromise;
    let found=rows.find(row=>row&&String(row.code||'').trim().toUpperCase()===symbol);
    if(symbol==='SKHYNIX'&&!found)found=rows.find(row=>row&&(/SK\\s*HYNIX/i.test(String(row.name||''))||/RSKHYUSDT/i.test(String(row.symbol||''))));
    if(!found||!found.symbol)throw new Error('Bitget Reality 未返回该股票的交易所代码：'+symbol);
    return String(found.symbol).trim();
  }
  async function resolveContract(symbol){if(!contractInfoPromise)contractInfoPromise=getJson('/api/v2/mix/market/contracts?productType=USDT-FUTURES').catch(e=>{contractInfoPromise=null;throw e;});const rows=await contractInfoPromise,candidates=CONTRACT_CANDIDATES(symbol);const found=rows.find(row=>{if(!row||!candidates.includes(String(row.symbol||'').toUpperCase()))return false;const status=String(row.symbolStatus||row.status||'').toLowerCase();return !status||['normal','online','listed'].includes(status);});if(!found)throw new Error('Bitget 无对应的在线 USDT 本位合约：'+symbol);return String(found.symbol).toUpperCase();}
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
    if (!Number.isInteger(period) || period < 1 || values.length < period) return result;
    const k = 2 / (period + 1);

    // Seed EMA with a full-period SMA. Earlier points remain null instead of
    // displaying a long-period line before enough valid closes exist.
    let seedSum = 0;
    for (let i = 0; i < period; i++) {
      if (!Number.isFinite(values[i])) return result;
      seedSum += values[i];
    }
    let previous = seedSum / period;
    result[period - 1] = previous;

    for (let i = period; i < values.length; i++) {
      const value = values[i];
      if (!Number.isFinite(value)) {
        previous = null;
        continue;
      }
      if (previous === null) {
        let sum = 0;
        let valid = true;
        for (let j = i - period + 1; j <= i; j++) {
          if (!Number.isFinite(values[j])) { valid = false; break; }
          sum += values[j];
        }
        if (!valid) continue;
        previous = sum / period;
        result[i] = previous;
        continue;
      }
      previous = value * k + previous * (1 - k);
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
    const length=data.length;
    if(!length) return {start:0,end:0};
    const count=Math.max(1,Math.min(length,Math.round(state.viewCount||180)));
    const first=data[0].t,last=data[length-1].t;
    if(state.startTime==null || state.endTime==null) {
      return {start:Math.max(0,length-count),end:length};
    }
    // When a time window is explicitly set, honor it exactly. Do not let a
    // stale viewCount silently truncate the initial 90-day historical range.
    if(state.endTime<first) return {start:0,end:Math.min(length,count)};
    if(state.startTime>last) return {start:Math.max(0,length-count),end:length};
    let start=data.findIndex(c=>c.t>=state.startTime);
    if(start<0) start=0;
    let end=data.findIndex(c=>c.t>state.endTime);
    if(end<0) end=length;
    start=Math.max(0,Math.min(length-1,start));
    end=Math.max(start+1,Math.min(length,end));
    return {start,end};
  }
  function fitCanvas() {
    const rect=canvas.getBoundingClientRect();
    const oldWidth=state.width,oldHeight=state.height;
    state.dpr=Math.max(1,window.devicePixelRatio||1);
    state.width=Math.max(1,rect.width); state.height=Math.max(1,rect.height);
    // Keep the chart proportions responsive while preserving the user's pan position.
    if(oldWidth>1) state.panX*=state.width/oldWidth;
    if(oldHeight>1) state.priceShift*=state.height/oldHeight;
    // Resize must not reset the user's historical viewport or zoom level.
    const pixelW=Math.round(state.width*state.dpr),pixelH=Math.round(state.height*state.dpr);
    if(canvas.width!==pixelW) canvas.width=pixelW;
    if(canvas.height!==pixelH) canvas.height=pixelH;
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    draw();
  }
  function draw() {
    if (overlay.hidden) return;
    const W=state.width,H=state.height;
    ctx.clearRect(0,0,W,H);
    const data=state.candles;
    if(!data.length) {
      ctx.fillStyle='rgba(225,238,255,.82)';
      ctx.font='14px system-ui,-apple-system,sans-serif';
      ctx.textAlign='center';
      ctx.fillText(state.error || '正在加载4H行情…',W/2,H/2);
      return;
    }
    const {start,end}=visibleIndices(), rows=data.slice(start,end);
    if(!rows.length) return;
    const pad={left:8,right:8,top:38,bottom:12};
    const plotW=Math.max(1,(W-pad.left-pad.right)*0.86), plotH=Math.max(1,H-pad.top-pad.bottom); // 默认右侧保留约14%空白，避免最新K线贴边
    const step=plotW/rows.length, bodyW=Math.max(1,Math.min(8,step*.62));
    let min=Infinity,max=-Infinity;
    rows.forEach(c=>{min=Math.min(min,c.l);max=Math.max(max,c.h);});
    state.series.forEach(s=>{for(let i=start;i<end;i++){const v=s.values[i];if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}});
    if(!Number.isFinite(min)||!Number.isFinite(max)) return;
    const margin=(max-min)*.055 || Math.max(max*.004,0.0001); min-=margin; max+=margin;
    const xAt=i=>pad.left+(i-start+.5)*step+state.panX;
    // Preserve the full vertical drag distance so diagonal and vertical pans follow the pointer.
    const yAt=v=>pad.top+(max-v)/(max-min)*plotH+state.priceShift;

    rows.forEach((c,j)=>{
      const i=start+j,x=xAt(i),up=c.c>=c.o,color=up?'#2ee6a6':'#ff5c7c';
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,Math.min(1.5,step*.18));
      ctx.beginPath();ctx.moveTo(x,yAt(c.h));ctx.lineTo(x,yAt(c.l));ctx.stroke();
      ctx.fillStyle=color;
      const y1=yAt(Math.max(c.o,c.c)),y2=yAt(Math.min(c.o,c.c));
      ctx.fillRect(x-bodyW/2,y1,bodyW,Math.max(1,y2-y1));
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
    });
  }
  async function loadData(isRefresh) {
    const generation=state.generation;
    const request=++state.dataRequest;
    try {
      const isReality=REALITY_STOCKS.has(state.symbol);
      let apiSymbol=state.contractSymbol;
      let rows;
      if(!isRefresh){
        let cached=PREWARM_CACHE.get(state.symbol);
        if(cached && typeof cached.then==='function') cached=await cached;
        if(cached && Date.now()-cached.createdAt<PREWARM_MAX_AGE){
          apiSymbol=cached.apiSymbol;
          rows=cached.rows;
        }
      }
      if(!apiSymbol) apiSymbol=isReality?await resolveRealitySymbol(state.symbol):await resolveContract(state.symbol);
      state.contractSymbol=apiSymbol;
      if(!rows) rows=isRefresh?normalize(await getJson(candlePath(apiSymbol,undefined,isReality))):await loadCandlesWithWarmup(apiSymbol,isReality);
      if(generation!==state.generation || request!==state.dataRequest || overlay.hidden) return;
      // A request may have started just before the user began dragging.
      // Never let its response replace/redraw candles during an active gesture.
      if(state.drag) {
        state.pendingRefresh=true;
        return;
      }
      if(rows.length<2) throw new Error('交易所返回的4H K线不足');
      state.error='';
      if(isRefresh && state.candles.length) {
        const oldStart=state.startTime,oldEnd=state.endTime;
        const oldLast=state.candles[state.candles.length-1].t;
        const oldRange=visibleIndices();
        const oldCount=Math.max(1,oldRange.end-oldRange.start);
        const followLatest=Number.isFinite(oldEnd) && oldEnd>=oldLast-4*60*60*1000;
        state.candles=normalize(state.candles.concat(rows)).slice(-MAX_CANDLE_BARS);
        rebuildSeries();
        if(followLatest) {
          const lastIndex=state.candles.length-1;
          const firstIndex=Math.max(0,lastIndex-oldCount+1);
          state.startTime=state.candles[firstIndex].t;
          state.endTime=state.candles[lastIndex].t;
        } else {
          state.startTime=oldStart;
          state.endTime=oldEnd;
        }
      } else {
        state.candles=rows;
        // The 90-day window is based on candle timestamps, not on the
        // current request/cache size. Include the newest candle in the range.
        state.endTime=rows[rows.length-1].t;
        state.startTime=state.endTime-INITIAL_HISTORY_MS;
        const firstVisible=rows.findIndex(c=>c.t>=state.startTime);
        state.viewCount=Math.max(1,rows.length-(firstVisible<0?Math.max(0,rows.length-540):firstVisible));
        rebuildSeries();
      }

      const range=visibleIndices();
      if(range.end>range.start) state.viewCount=range.end-range.start;
      draw();
      if(state.contractSymbol && (!state.ws || state.ws.readyState===WebSocket.CLOSED)) connectKline(state.contractSymbol,REALITY_STOCKS.has(state.symbol));
    } catch(error) {
      if(generation!==state.generation || request!==state.dataRequest || overlay.hidden) return;
      if(!state.candles.length) {
        state.error=(REALITY_STOCKS.has(state.symbol)?'Bitget Reality 4H股票行情加载失败：':'Bitget 4H行情加载失败：')+String(error&&error.message||error).slice(0,90);
        draw();
      }
      console.error('[Vegas Fifth Layer]',error);
    }
  }
  function stopContractKline(){if(state.wsReconnect)clearTimeout(state.wsReconnect);if(state.wsHeartbeat)clearInterval(state.wsHeartbeat);state.wsReconnect=0;state.wsHeartbeat=0;const w=state.ws;state.ws=null;if(w){try{w.onclose=null;w.close();}catch(_){}}}
  function applyLiveCandle(row){
    const candle=normalize([row])[0];
    if(!candle||!state.candles.length)return;
    const candles=state.candles;
    const index=candles.findIndex(item=>item.t===candle.t);
    if(index>=0)candles[index]=candle;
    else{candles.push(candle);candles.sort((a,b)=>a.t-b.t);}
    if(candles.length>MAX_CANDLE_BARS)candles.splice(0,candles.length-MAX_CANDLE_BARS);
    rebuildSeries();
    if(state.drag){state.pendingDraw=true;return;}
    draw();
  }
  function connectKline(symbol,isReality=false){stopContractKline();if(overlay.hidden||!symbol||!('WebSocket'in window))return;const gen=state.generation;let w;try{w=new WebSocket('wss://ws.bitget.com/v2/ws/public');}catch(e){console.warn('[Vegas Fifth Layer] WebSocket连接失败',e);return;}state.ws=w;
    const instType=isReality?'SPOT':'USDT-FUTURES';
    w.onopen=()=>{if(gen!==state.generation||overlay.hidden||state.ws!==w){w.close();return;}w.send(JSON.stringify({op:'subscribe',args:[{instType,channel:'candle4H',instId:symbol}]}));state.wsHeartbeat=setInterval(()=>{if(w.readyState===WebSocket.OPEN)w.send('ping');},25000);};
    w.onmessage=e=>{if(gen!==state.generation||state.ws!==w||overlay.hidden||e.data==='pong')return;let m;try{m=JSON.parse(e.data);}catch(_){return;}if(m.event==='error'){console.warn('[Vegas Fifth Layer] Bitget K线订阅失败',m.code,m.msg);return;}if(m.arg&&m.arg.instId===symbol&&m.arg.channel==='candle4H'&&Array.isArray(m.data))m.data.forEach(applyLiveCandle);};
    w.onerror=()=>{try{w.close();}catch(_){}};
    w.onclose=()=>{if(state.ws===w){state.ws=null;if(state.wsHeartbeat)clearInterval(state.wsHeartbeat);state.wsHeartbeat=0;}if(!overlay.hidden&&gen===state.generation&&state.contractSymbol===symbol)state.wsReconnect=setTimeout(()=>connectKline(symbol,isReality),3000);};
  }

  function open(card) {
    if(!card || !card.dataset) return;
    stopContractKline();
    const symbol=String(card.dataset.symbol||'').trim().toUpperCase();
    if(!symbol) return;
    // Invalidate pending candle requests from the previously opened card.
    state.generation++;
    state.dataRequest++;
    state.symbol=symbol;
    state.contractSymbol='';
    state.candles=[];state.series=[];state.startTime=null;state.endTime=null;state.viewCount=540;state.drag=null;state.priceShift=0;state.panX=0;state.error='';
    overlay.hidden=false;
    fitCanvas();
    state.error=REALITY_STOCKS.has(symbol)?'正在连接 Bitget Reality 原生4H股票行情…':'正在连接 Bitget 原生4H合约行情…';draw();
    // Prioritize the tapped card immediately; loadData shares this in-flight prewarm promise.
    prewarmSymbol(symbol);
    loadData(false);
    if(state.timer) clearInterval(state.timer);
    state.timer=window.setInterval(()=>{if(!overlay.hidden&&!state.drag&&(!state.ws||state.ws.readyState!==WebSocket.OPEN))loadData(true);},15000);
  }
  function close() {
    stopContractKline();overlay.hidden=true;state.drag=null;state.generation++;
    if(state.timer) clearInterval(state.timer);
    state.timer=0;
  }
  function changeZoom(delta) {
    if(!state.candles.length) return;
    const {start,end}=visibleIndices();
    const oldCount=Math.max(1,end-start);
    const next=Math.max(12,Math.min(state.candles.length,Math.round(oldCount*(delta<0?.82:1.22))));
    if(next===oldCount) return;
    // Anchor zoom at the right edge of the current viewport, clamped to loaded data.
    const anchorIndex=Math.max(0,Math.min(state.candles.length-1,end-1));
    const nextStart=Math.max(0,anchorIndex-next+1);
    const actualCount=anchorIndex-nextStart+1;
    state.viewCount=actualCount;
    state.startTime=state.candles[nextStart].t;
    state.endTime=state.candles[anchorIndex].t;
    draw();
  }
  function pointerDown(e) {
    if(overlay.hidden || !state.candles.length) return;
    const range=visibleIndices();
    state.drag={
      x:e.clientX,y:e.clientY,
      basePanX:state.panX,basePriceShift:state.priceShift,
      baseStart:range.start,baseEnd:range.end,
      baseCount:Math.max(1,range.end-range.start),moved:false
    };
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  }
  function pointerMove(e) {
    if(!state.drag || !state.candles.length) return;
    const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
    if(Math.hypot(dx,dy)>3) state.drag.moved=true;
    if(!state.drag.moved) return;

    // Horizontal dragging changes the actual candle time window, not just the
    // canvas offset, so users can browse loaded historical candles.
    const d=state.drag,data=state.candles;
    const plotW=Math.max(1,(state.width-16)*0.86);
    const step=plotW/Math.max(1,d.baseCount);
    const requestedShift=Math.round(-dx/Math.max(1,step));
    const maxStart=Math.max(0,data.length-d.baseCount);
    const nextStart=Math.max(0,Math.min(maxStart,d.baseStart+requestedShift));
    const nextEnd=Math.min(data.length,nextStart+d.baseCount);
    state.viewCount=Math.max(1,nextEnd-nextStart);
    state.startTime=data[nextStart].t;
    state.endTime=data[nextEnd-1].t;
    const appliedShift=nextStart-d.baseStart;
    state.panX=d.basePanX+dx+appliedShift*step;
    // No artificial vertical clamp: the entire chart follows the pointer freely.
    state.priceShift=d.basePriceShift+dy;
    draw();
  }
  function hitRenderedChart(x,y) {
    // The canvas is transparent; only candle and EMA strokes have non-zero alpha.
    // A small tolerance makes thin EMA lines and candle wicks practical to tap.
    const dpr=state.dpr||1, cx=Math.round(x*dpr),cy=Math.round(y*dpr),radius=Math.max(3,Math.round(5*dpr));
    const left=Math.max(0,cx-radius),top=Math.max(0,cy-radius);
    const right=Math.min(canvas.width-1,cx+radius),bottom=Math.min(canvas.height-1,cy+radius);
    if(right<left||bottom<top)return false;
    try {
      const pixels=ctx.getImageData(left,top,right-left+1,bottom-top+1).data;
      for(let i=3;i<pixels.length;i+=4) if(pixels[i]>24)return true;
    } catch (_) {}
    return false;
  }
  function pointerUp(e) {
    const drag=state.drag;
    state.drag=null;
    if(state.pendingDraw){state.pendingDraw=false;draw();}
    // If a refresh completed during the gesture, apply it only after the
    // drag ends; merge data without forcing the viewport back to the latest bar.
    if(state.pendingRefresh && !overlay.hidden) {
      state.pendingRefresh=false;
      window.setTimeout(()=>{if(!overlay.hidden && !state.drag) loadData(true);},0);
    }
    if(!drag || drag.moved || overlay.hidden) return;
    // A tap on a candle or EMA keeps the chart open; every other area exits.
    if(!hitRenderedChart(e.clientX,e.clientY)) close();
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
    if(!card) return;
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
  canvas.addEventListener('pointercancel',()=>{state.drag=null;if(state.pendingDraw){state.pendingDraw=false;draw();}});
  // Consume wheel gestures at the overlay boundary so they cannot bubble
  // into page/scroll handlers. Wheel zoom is local-only: it must never close
  // the chart or trigger a market-data request.
  let lastWheelZoomAt=0;
  function handleChartWheel(event) {
    if(overlay.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function') event.stopImmediatePropagation();
    const now=performance.now();
    if(now-lastWheelZoomAt<45) return;
    lastWheelZoomAt=now;
    changeZoom(event.deltaY);
  }
  overlay.addEventListener('wheel',handleChartWheel,{passive:false,capture:true});
  // Tapping outside the plotted chart closes it; dragging anywhere pans the chart.
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
  window.addEventListener('resize',fitCanvas,{passive:true});
  if(window.ResizeObserver) new ResizeObserver(fitCanvas).observe(canvas);
  function prewarmSymbol(symbol){
    symbol=String(symbol||'').trim().toUpperCase();
    if(!symbol || PREWARM_CACHE.has(symbol)) return PREWARM_CACHE.get(symbol);
    const job=(async()=>{
      const isReality=REALITY_STOCKS.has(symbol);
      const apiSymbol=isReality?await resolveRealitySymbol(symbol):await resolveContract(symbol);
      const rows=await loadCandlesWithWarmup(apiSymbol,isReality);
      if(rows.length<2) throw new Error('预热K线不足');
      const entry={apiSymbol,rows,createdAt:Date.now()};
      PREWARM_CACHE.set(symbol,entry);
      return entry;
    })().catch(error=>{
      PREWARM_CACHE.delete(symbol);
      console.warn('[Vegas Fifth Layer] K线预热失败：'+symbol,error);
      return null;
    });
    PREWARM_CACHE.set(symbol,job);
    return job;
  }
  async function startBackgroundPrewarm(){
    const cards=Array.from(document.querySelectorAll(CARD_SELECTOR));
    const ordered=cards.slice().sort((a,b)=>{
      const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      const av=ar.bottom>0&&ar.top<window.innerHeight?0:1;
      const bv=br.bottom>0&&br.top<window.innerHeight?0:1;
      return av-bv;
    });
    let cursor=0;
    async function worker(){
      while(cursor<ordered.length){
        const card=ordered[cursor++];
        await prewarmSymbol(card.dataset.symbol);
        await new Promise(resolve=>setTimeout(resolve,180));
      }
    }
    await Promise.all([worker(),worker(),worker()]);
  }
  window.VegasFifthLayer={open,close,refresh:()=>loadData(true),prewarm:()=>startBackgroundPrewarm(),getState:()=>({symbol:state.symbol,contractSymbol:state.contractSymbol,productType:REALITY_STOCKS.has(state.symbol)?'SPOT':'USDT-FUTURES',granularity:'4H',websocket:!!(state.ws&&state.ws.readyState===WebSocket.OPEN),visible:!overlay.hidden,candles:state.candles.length,prewarmed:PREWARM_CACHE.size})};
  window.__VEGAS_FIFTH_LAYER_READY__=true;

  console.info('[Vegas Fifth Layer] initialized');
  // Warm all 27 instruments in the background; each cache contains enough native 4H bars for the initial 90-day view.
  startBackgroundPrewarm();
})();
