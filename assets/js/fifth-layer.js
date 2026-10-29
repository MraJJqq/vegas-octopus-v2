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
    width:1,height:1,dpr:1, drag:null, timer:0, generation:0, dataRequest:0, pendingRefresh:false, offsetX:null, offsetY:null, error:'', lastLiveAt:0, drawFrame:0, historyLoading:false, historyExhausted:false
  };

  // 4H candles are persisted per instrument in IndexedDB; 4,400 bars cover roughly two calendar years for 24/7 markets.
  // The longest EMA is 676 bars; 1,000 bars provide a useful buffer without dozens of slow history requests per symbol.
  const EMA_WARMUP_BARS = 3000;
  const MAX_CANDLE_BARS = 5000;
  const PREWARM_CACHE = new Map();
  const PREWARM_MAX_AGE = 4 * 60 * 60 * 1000;
  const VIEW_STORAGE_KEY = 'vegas-octopus-kline-view-v1';
  const INITIAL_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
  const CANDLE_DB_NAME = 'vegas-octopus-market-cache';
  const CANDLE_DB_VERSION = 1;
  const CANDLE_STORE_NAME = 'candles';
  let candleDbPromise = null;

  function openCandleDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (candleDbPromise) return candleDbPromise;
    candleDbPromise = new Promise(resolve => {
      let request;
      try { request = indexedDB.open(CANDLE_DB_NAME, CANDLE_DB_VERSION); }
      catch (_) { resolve(null); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CANDLE_STORE_NAME)) {
          db.createObjectStore(CANDLE_STORE_NAME, {keyPath:'key'});
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); candleDbPromise = null; };
        resolve(db);
      };
      request.onerror = () => { candleDbPromise = null; resolve(null); };
      request.onblocked = () => { candleDbPromise = null; resolve(null); };
    });
    return candleDbPromise;
  }
  function candleCacheKey(symbol, isReality) {
    return (isReality ? 'SPOT:' : 'USDT-FUTURES:') + String(symbol || '').toUpperCase() + ':4H';
  }
  async function readPersistentCandles(symbol, isReality) {
    const db = await openCandleDb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const request = db.transaction(CANDLE_STORE_NAME, 'readonly').objectStore(CANDLE_STORE_NAME).get(candleCacheKey(symbol, isReality));
        request.onsuccess = () => {
          const value = request.result;
          resolve(value && Array.isArray(value.rows) ? (value.rows.length && !Array.isArray(value.rows[0]) ? mergeCandles(value.rows) : normalize(value.rows)) : null);
        };
        request.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }
  async function writePersistentCandles(symbol, isReality, rows) {
    const db = await openCandleDb();
    if (!db || !Array.isArray(rows) || !rows.length) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(CANDLE_STORE_NAME, 'readwrite');
        tx.objectStore(CANDLE_STORE_NAME).put({
          key:candleCacheKey(symbol, isReality),
          symbol:String(symbol || '').toUpperCase(),
          market:isReality ? 'SPOT' : 'USDT-FUTURES',
          interval:'4H',
          rows:rows.slice(-MAX_CANDLE_BARS),
          count:Math.min(rows.length, MAX_CANDLE_BARS),
          oldestTime:rows[0].t,
          newestTime:rows[rows.length-1].t,
          updatedAt:Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }
  function readSavedView(symbol) {
    try {
      const all=JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY)||'{}');
      const view=all&&all[String(symbol||'').toUpperCase()];
      if(view&&Number.isFinite(view.startTime)&&Number.isFinite(view.endTime)&&view.endTime>=view.startTime) return view;
    } catch (_) {}
    return null;
  }
  function saveCurrentView() {
    if(!state.symbol||!Number.isFinite(state.startTime)||!Number.isFinite(state.endTime))return;
    try {
      const all=JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY)||'{}');
      all[state.symbol]={startTime:state.startTime,endTime:state.endTime,viewCount:state.viewCount,savedAt:Date.now()};
      localStorage.setItem(VIEW_STORAGE_KEY,JSON.stringify(all));
    } catch (_) {}
  }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Use Bitget's current unified V3 market-data endpoints for both futures and Reality stocks.
  // V3 history-candles is limited to 100 records per request; keep the page size consistent below.
  function candlePath(symbol,endTime,isReality=false){
    const q=new URLSearchParams({
      category:isReality?'SPOT':'USDT-FUTURES',
      symbol,
      interval:'4H',
      limit:'1000',
      ...(Number.isFinite(endTime)?{endTime:String(endTime)}:{})
    });
    return '/api/v3/market/candles?'+q;
  }
  function historyCandlePath(symbol,endTime,isReality=false){
    const q=new URLSearchParams({
      category:isReality?'SPOT':'USDT-FUTURES',
      symbol,
      interval:'4H',
      limit:'100',
      endTime:String(endTime)
    });
    return '/api/v3/market/history-candles?'+q;
  }

  async function loadCandlesWithWarmup(apiSymbol,isReality=false) {
    // Persistent cache survives page refreshes. Merge it with the newest exchange candles
    // first, then request older pages only when the saved history does not cover the target.
    const stored = await readPersistentCandles(apiSymbol,isReality);
    let latest = [];
    try {
      latest = normalize(await getJson(candlePath(apiSymbol,undefined,isReality)));
    } catch (error) {
      if (stored && stored.length >= 2) {
        console.warn('[Vegas Fifth Layer] 最新行情暂不可用，先使用本地4H缓存：' + apiSymbol, error);
        return stored.slice(-MAX_CANDLE_BARS);
      }
      throw error;
    }
    // If the newest-candles endpoint returns no usable rows and there is no cache,
    // start history pagination from the current time instead of failing before fallback.
    let combined = mergeCandles(stored || [], latest);
    let pages = 0;
    let cursorTime = combined.length ? combined[0].t - 1 : Date.now();
    const maxPages = Math.ceil(EMA_WARMUP_BARS / 100) + 2;
    while (combined.length < EMA_WARMUP_BARS && pages < maxPages) {
      if (!Number.isFinite(cursorTime) || cursorTime <= 0) break;
      let rawPage;
      try {
        rawPage = await getJson(historyCandlePath(apiSymbol,cursorTime,isReality));
      } catch (error) {
        console.warn('[Vegas Fifth Layer] 历史预热请求失败，保留已取得的4H K线：' + apiSymbol, error);
        break;
      }
      pages++;
      const page = normalize(rawPage);
      if (!page.length) break;
      const oldestBefore = combined.length ? combined[0].t : Infinity;
      const next = mergeCandles(page, combined);
      if (next.length <= combined.length) break;
      if (Number.isFinite(oldestBefore) && next[0].t >= oldestBefore) break;
      combined = next;
      cursorTime = combined[0].t - 1;
      if (page.length < 100) break;
      // Keep page-by-page requests paced to reduce exchange rate-limit pressure.
      await delay(120);
    }
    if (combined.length < 2) {
      throw new Error('最新及历史接口均未返回足够的有效4H K线（最新=' + latest.length + '，缓存=' + (stored ? stored.length : 0) + '，历史页=' + pages + '）');
    }
    if (combined.length < EMA_WARMUP_BARS) {
      console.info('[Vegas Fifth Layer] 可用历史K线：' + apiSymbol + '，' + combined.length + '/' + EMA_WARMUP_BARS +
        ' 根；若交易所没有更早数据，将保存现有全部历史。');
    }
    combined = combined.slice(-MAX_CANDLE_BARS);
    await writePersistentCandles(apiSymbol,isReality,combined);
    return combined;
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
  let legacyContractInfoPromise=null;
  let realityInfoPromise=null;
  async function resolveRealitySymbol(symbol){
    if(!realityInfoPromise)realityInfoPromise=getJson('/api/v3/reality/market/stock-info').catch(error=>{realityInfoPromise=null;throw error;});
    const rows=await realityInfoPromise;
    let found=rows.find(row=>row&&String(row.code||'').trim().toUpperCase()===symbol);
    if(symbol==='SKHYNIX'&&!found)found=rows.find(row=>row&&(/SK\s*HYNIX/i.test(String(row.name||''))||/RSKHYUSDT/i.test(String(row.symbol||''))));
    if(!found||!found.symbol)throw new Error('Bitget Reality 未返回该股票的交易所代码：'+symbol+'；请检查股票代码是否仍在 Reality 上市');
    return String(found.symbol).trim().toUpperCase();
  }
  async function resolveContract(symbol){
    const candidates=CONTRACT_CANDIDATES(symbol);
    // Prefer Bitget's current V3 instruments endpoint. Keep V2 contracts as a
    // compatibility fallback so a metadata endpoint change does not break chart opening.
    let rows=[];
    try{
      if(!contractInfoPromise)contractInfoPromise=getJson('/api/v3/market/instruments?category=USDT-FUTURES').catch(error=>{contractInfoPromise=null;throw error;});
      rows=await contractInfoPromise;
    }catch(error){
      console.warn('[Vegas Fifth Layer] V3 合约目录读取失败，尝试兼容接口：',error);
    }
    let found=rows.find(row=>row&&candidates.includes(String(row.symbol||'').trim().toUpperCase()));
    if(!found){
      try{
        if(!legacyContractInfoPromise)legacyContractInfoPromise=getJson('/api/v2/mix/market/contracts?productType=USDT-FUTURES').catch(error=>{legacyContractInfoPromise=null;throw error;});
        const legacyRows=await legacyContractInfoPromise;
        found=legacyRows.find(row=>{
          if(!row||!candidates.includes(String(row.symbol||'').trim().toUpperCase()))return false;
          const status=String(row.symbolStatus||row.status||'').toLowerCase();
          return !status||['normal','online','listed'].includes(status);
        });
      }catch(error){
        console.warn('[Vegas Fifth Layer] V2 合约目录读取失败：',error);
      }
    }
    if(!found)throw new Error('Bitget 未找到在线 USDT 本位合约：'+symbol+'（候选：'+candidates.join(', ')+')');
    return String(found.symbol).trim().toUpperCase();
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
  // Merge already-normalized candle objects by timestamp; normalize() is only for raw exchange arrays.
  function mergeCandles(...groups) {
    const byTime = new Map();
    for (const group of groups) {
      for (const candle of Array.isArray(group) ? group : []) {
        if (!candle || ![candle.t,candle.o,candle.h,candle.l,candle.c].every(Number.isFinite)) continue;
        if (candle.t <= 0 || candle.o <= 0 || candle.h <= 0 || candle.l <= 0 || candle.c <= 0) continue;
        byTime.set(candle.t,candle);
      }
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
  function getFrameSize() {
    return {
      frameW:Math.max(1,Math.min(state.width,state.width*.86)),
      frameH:Math.max(1,Math.min(state.height,state.height*.78))
    };
  }
  function getViewportBounds() {
    const {frameW,frameH}=getFrameSize();
    // Keep the complete chart frame inside the full-screen canvas. Allowing most
    // of the frame to move off-canvas made its edges look clipped by other panels.
    return {
      minX:0,
      maxX:Math.max(0,state.width-frameW),
      minY:0,
      maxY:Math.max(0,state.height-frameH)
    };
  }
  function clampViewportOffsets() {
    const {minX,maxX,minY,maxY}=getViewportBounds();
    state.offsetX=Math.max(minX,Math.min(maxX,Number.isFinite(state.offsetX)?state.offsetX:0));
    state.offsetY=Math.max(minY,Math.min(maxY,Number.isFinite(state.offsetY)?state.offsetY:0));
  }

  function fitCanvas() {
    const rect=canvas.getBoundingClientRect();
    const oldWidth=state.width,oldHeight=state.height;
    state.dpr=Math.max(1,window.devicePixelRatio||1);
    state.width=Math.max(1,rect.width); state.height=Math.max(1,rect.height);
    if(state.offsetX==null) state.offsetX=state.width*.07;
    else if(oldWidth>1) state.offsetX*=state.width/oldWidth;
    if(state.offsetY==null) state.offsetY=state.height*.11;
    else if(oldHeight>1) state.offsetY*=state.height/oldHeight;
    clampViewportOffsets();
    // Resize must not reset the user's historical viewport or zoom level.
    const pixelW=Math.round(state.width*state.dpr),pixelH=Math.round(state.height*state.dpr);
    if(canvas.width!==pixelW) canvas.width=pixelW;
    if(canvas.height!==pixelH) canvas.height=pixelH;
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    draw();
  }
  function draw() {
    state.drawFrame=0;
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
    // The viewport can travel across the full page. At each edge, keep a small
    // visible grip so the chart can always be dragged back onto the screen.
    const {frameW,frameH}=getFrameSize();
    const pad={left:Math.min(8,frameW*.03),right:Math.min(8,frameW*.03),
      top:Math.min(30,frameH*.06),bottom:Math.min(12,frameH*.025)};
    clampViewportOffsets();
    const plotLeft=state.offsetX+pad.left;
    const plotTop=state.offsetY+pad.top;
    const plotW=Math.max(1,frameW-pad.left-pad.right);
    const plotH=Math.max(1,frameH-pad.top-pad.bottom);
    const step=plotW/rows.length, bodyW=Math.max(1,Math.min(8,step*.62));
    let min=Infinity,max=-Infinity;
    rows.forEach(c=>{min=Math.min(min,c.l);max=Math.max(max,c.h);});
    state.series.forEach(s=>{for(let i=start;i<end;i++){const v=s.values[i];if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}});
    if(!Number.isFinite(min)||!Number.isFinite(max)) return;
    const margin=(max-min)*.055 || Math.max(max*.004,0.0001); min-=margin; max+=margin;
    // Zoom changes the time window; dragging moves the viewport itself.
    // Keep candle and EMA coordinates relative to the bounded plot area.
    const xAt=i=>plotLeft+(i-start+.5)*step;
    const yAt=v=>plotTop+(max-v)/(max-min)*plotH;

    // Candle extrema and the EMA values are included in the price range above,
    // so series stay within the plot naturally. Avoid a moving canvas clip path:
    // repeated chart drags can otherwise leave the visible series looking cut off.
    rows.forEach((c,j)=>{
      const i=start+j,x=xAt(i),up=c.c>=c.o,color=up?'#2ee6a6':'#ff5c7c';
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,Math.min(1.5,step*.18));
      ctx.beginPath();ctx.moveTo(x,yAt(c.h));ctx.lineTo(x,yAt(c.l));ctx.stroke();
      const y1=yAt(Math.max(c.o,c.c)),y2=yAt(Math.min(c.o,c.c));
      const bodyY=y1,bodyH=Math.max(1,y2-y1),bodyX=x-bodyW/2;
      if(up){
        // Exchange-style hollow bullish candle: green outline, transparent body.
        ctx.strokeStyle=color;
        ctx.lineWidth=Math.max(1,Math.min(1.5,step*.18));
        ctx.strokeRect(bodyX,bodyY,bodyW,bodyH);
      }else{
        // Bearish candles remain filled, matching the exchange's hollow-up mode.
        ctx.fillStyle=color;
        ctx.fillRect(bodyX,bodyY,bodyW,bodyH);
      }
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
        state.candles=mergeCandles(state.candles,rows).slice(-MAX_CANDLE_BARS);
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
        // Restore the last viewport separately for each instrument.
        const saved=readSavedView(state.symbol);
        if(saved) {
          state.startTime=saved.startTime;
          state.endTime=saved.endTime;
          state.viewCount=Math.max(1,Math.min(MAX_CANDLE_BARS,Math.round(saved.viewCount||540)));
        } else {
          state.endTime=rows[rows.length-1].t;
          state.startTime=state.endTime-INITIAL_HISTORY_MS;
          const firstVisible=rows.findIndex(c=>c.t>=state.startTime);
          state.viewCount=Math.max(1,rows.length-(firstVisible<0?Math.max(0,rows.length-540):firstVisible));
        }
        rebuildSeries();
      }

      const range=visibleIndices();
      if(range.end>range.start) state.viewCount=range.end-range.start;
      draw();
      // If the saved viewport predates the loaded candles, request older pages until it is covered.
      if(!isRefresh&&Number.isFinite(state.startTime)&&state.startTime<state.candles[0].t) {
        let attempts=0;
        while(!overlay.hidden&&state.generation===generation&&state.startTime<state.candles[0].t&&!state.historyExhausted&&state.candles.length<MAX_CANDLE_BARS&&attempts++<20) {
          const before=state.candles[0].t;
          await loadOlderHistory();
          if(state.candles[0].t>=before)break;
        }
      }
      // Show cached/latest data first. If it is short, enrich this active chart in the background.
      if(rows.length < EMA_WARMUP_BARS){
        const activeSymbol=state.symbol,activeApiSymbol=state.contractSymbol,activeGeneration=generation;
        window.setTimeout(async()=>{
          try{
            const enriched=await loadCandlesWithWarmup(activeApiSymbol,isReality);
            if(overlay.hidden||state.generation!==activeGeneration||state.symbol!==activeSymbol||state.contractSymbol!==activeApiSymbol||enriched.length<=state.candles.length)return;
            const oldStart=state.startTime,oldEnd=state.endTime;
            state.candles=mergeCandles(state.candles,enriched).slice(-MAX_CANDLE_BARS);
            rebuildSeries();
            state.startTime=oldStart;state.endTime=oldEnd;
            draw();
          }catch(error){console.warn('[Vegas Fifth Layer] 后台补齐历史K线失败：'+activeSymbol,error);}
        },0);
      }
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
  function stopContractKline(){if(state.wsReconnect)clearTimeout(state.wsReconnect);if(state.wsHeartbeat)clearInterval(state.wsHeartbeat);state.wsReconnect=0;state.wsHeartbeat=0;state.lastLiveAt=0;const w=state.ws;state.ws=null;if(w){try{w.onclose=null;w.close();}catch(_){}}}
  function scheduleDraw(){if(state.drawFrame||overlay.hidden)return;state.drawFrame=requestAnimationFrame(draw);}
  function applyLiveCandle(row){
    const candle=normalize([row])[0];
    if(!candle||!state.candles.length)return;
    const previousLast=state.candles[state.candles.length-1].t;
    const previousRange=visibleIndices();
    const previousCount=Math.max(1,previousRange.end-previousRange.start);
    const followLatest=Number.isFinite(state.endTime)&&state.endTime>=previousLast-4*60*60*1000;
    const candles=state.candles;
    const index=candles.findIndex(item=>item.t===candle.t);
    const wasLast=index===candles.length-1;
    if(index>=0)candles[index]=candle;
    else{candles.push(candle);candles.sort((a,b)=>a.t-b.t);}
    const trimmed=candles.length>MAX_CANDLE_BARS;
    if(trimmed)candles.splice(0,candles.length-MAX_CANDLE_BARS);
    // Keep the visible window attached to the newest candle only when the user
    // was already following live data; preserve historical browsing otherwise.
    if(followLatest&&candle.t>=previousLast){
      const lastIndex=candles.length-1;
      const firstIndex=Math.max(0,lastIndex-previousCount+1);
      state.startTime=candles[firstIndex].t;
      state.endTime=candles[lastIndex].t;
      state.viewCount=lastIndex-firstIndex+1;
    }
    state.lastLiveAt=Date.now();
    if(!trimmed && state.series.length && ((index>=0&&wasLast&&index===candles.length-1)||(index<0&&candle.t===candles[candles.length-1].t))){
      const closeValues=candles.map(item=>item.c),targetIndex=candles.length-1;
      state.series.forEach(series=>{const period=series.period,k=2/(period+1);if(targetIndex<period-1){series.values[targetIndex]=null;}else if(targetIndex===period-1){let sum=0;for(let j=0;j<period;j++)sum+=closeValues[j];series.values[targetIndex]=sum/period;}else{const previous=series.values[targetIndex-1];series.values[targetIndex]=Number.isFinite(previous)?candle.c*k+previous*(1-k):null;}});
    }else rebuildSeries();
    if(state.drag){state.pendingDraw=true;return;}
    scheduleDraw();
  }
  function connectKline(symbol,isReality=false){stopContractKline();if(overlay.hidden||!symbol||!('WebSocket'in window))return;const gen=state.generation;let w;try{w=new WebSocket('wss://ws.bitget.com/v2/ws/public');}catch(e){console.warn('[Vegas Fifth Layer] WebSocket连接失败',e);return;}state.ws=w;
    const instType=isReality?'SPOT':'USDT-FUTURES';
    w.onopen=()=>{if(gen!==state.generation||overlay.hidden||state.ws!==w){w.close();return;}w.send(JSON.stringify({op:'subscribe',args:[{instType,channel:'candle4H',instId:symbol}]}));state.wsHeartbeat=setInterval(()=>{if(w.readyState===WebSocket.OPEN)w.send('ping');},25000);};
    w.onmessage=e=>{if(gen!==state.generation||state.ws!==w||overlay.hidden||e.data==='pong')return;let m;try{m=JSON.parse(e.data);}catch(_){return;}if(m.event==='error'){console.warn('[Vegas Fifth Layer] Bitget K线订阅失败',m.code,m.msg);return;}if(m.event==='subscribe'){state.lastLiveAt=Date.now();return;}if(m.arg&&m.arg.instId===symbol&&m.arg.channel==='candle4H'&&Array.isArray(m.data))m.data.forEach(applyLiveCandle);};
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
    state.candles=[];state.series=[];state.startTime=null;state.endTime=null;state.viewCount=540;state.drag=null;state.historyLoading=false;state.historyExhausted=false;state.offsetX=state.width*.07;state.offsetY=state.height*.11;state.error='';
    overlay.hidden=false;
    fitCanvas();
    state.error=REALITY_STOCKS.has(symbol)?'正在连接 Bitget Reality 原生4H股票行情…':'正在连接 Bitget 原生4H合约行情…';draw();
    // Prioritize the tapped card immediately; loadData shares this in-flight prewarm promise.
    prewarmSymbol(symbol);
    loadData(false);
    if(state.timer) clearInterval(state.timer);
    state.timer=window.setInterval(()=>{if(overlay.hidden||state.drag)return;const socketOpen=state.ws&&state.ws.readyState===WebSocket.OPEN;const liveStale=!state.lastLiveAt||Date.now()-state.lastLiveAt>45000;if(!socketOpen||liveStale)loadData(true);},15000);
  }
  function close() {
    saveCurrentView();
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
  async function loadOlderHistory() {
    if(state.historyLoading || state.historyExhausted || overlay.hidden || !state.contractSymbol || !state.candles.length || state.candles.length>=MAX_CANDLE_BARS) return;
    const symbol=state.symbol,apiSymbol=state.contractSymbol,generation=state.generation;
    const isReality=REALITY_STOCKS.has(symbol),oldest=state.candles[0].t;
    if(!Number.isFinite(oldest)||oldest<=0){state.historyExhausted=true;return;}
    state.historyLoading=true;
    try {
      const page=normalize(await getJson(historyCandlePath(apiSymbol,oldest-1,isReality)));
      if(overlay.hidden||state.generation!==generation||state.symbol!==symbol||state.contractSymbol!==apiSymbol)return;
      const older=page.filter(c=>c.t<oldest);
      if(!older.length){state.historyExhausted=true;return;}
      const previousStart=state.startTime,previousEnd=state.endTime;
      const oldRange=visibleIndices();
      const oldCount=Math.max(1,oldRange.end-oldRange.start);
      const atLeftBoundary=Number.isFinite(previousStart)&&previousStart>=oldest&&previousStart<=state.candles[Math.min(state.candles.length-1,oldRange.start+1)].t;
      state.candles=mergeCandles(older,state.candles).slice(-MAX_CANDLE_BARS);
      rebuildSeries();
      if(atLeftBoundary) {
        const newStartIndex=Math.max(0,oldRange.start-older.length);
        const newEndIndex=Math.min(state.candles.length-1,newStartIndex+oldCount-1);
        state.startTime=state.candles[newStartIndex].t;
        state.endTime=state.candles[newEndIndex].t;
      } else {state.startTime=previousStart;state.endTime=previousEnd;}
      await writePersistentCandles(apiSymbol,isReality,state.candles);
      draw();
      if(page.length<100)state.historyExhausted=true;
    } catch(error) {
      console.warn('[Vegas Fifth Layer] 按需加载更早历史K线失败：'+symbol,error);
    } finally {state.historyLoading=false;}
  }
  function pointerDown(e) {
    if(overlay.hidden || !state.candles.length) return;
    const onPlot=hitRenderedChart(e.clientX,e.clientY);
    state.drag={
      x:e.clientX,y:e.clientY,
      baseOffsetX:state.offsetX,baseOffsetY:state.offsetY,
      baseStart:state.startTime,baseEnd:state.endTime,
      mode:onPlot?'history':'position',moved:false
    };
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  }
  function pointerMove(e) {
    if(!state.drag || !state.candles.length) return;
    const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
    if(Math.hypot(dx,dy)>3) state.drag.moved=true;
    if(!state.drag.moved) return;
    const d=state.drag;
    if(d.mode==='history') {
      const baseStartIndex=Math.max(0,state.candles.findIndex(c=>c.t>=d.baseStart));
      let baseEndIndex=state.candles.findIndex(c=>c.t>d.baseEnd);
      if(baseEndIndex<0)baseEndIndex=state.candles.length;
      const count=Math.max(1,baseEndIndex-baseStartIndex);
      const {frameW}=getFrameSize();
      const plotW=Math.max(1,frameW-Math.min(8,frameW*.03)*2);
      const bars=Math.round(-dx/plotW*count);
      // Translate the viewport without shrinking it at either history boundary.
      // The previous independent clamps could collapse a 100+ candle window to
      // one candle after repeated drags, which looked like the chart was cropped.
      const total=state.candles.length;
      const maxStart=Math.max(0,total-count);
      const startIndex=Math.max(0,Math.min(maxStart,baseStartIndex+bars));
      const endIndex=Math.min(total,startIndex+count);
      state.viewCount=endIndex-startIndex;
      state.startTime=state.candles[startIndex].t;
      state.endTime=state.candles[endIndex-1].t;
      if(startIndex<35)loadOlderHistory();
      draw();
      return;
    }
    // Dragging outside the plotted candles still repositions the transparent chart.
    const {minX,maxX,minY,maxY}=getViewportBounds();
    state.offsetX=Math.max(minX,Math.min(maxX,d.baseOffsetX+dx));
    state.offsetY=Math.max(minY,Math.min(maxY,d.baseOffsetY+dy));
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
  function finishPointerGesture(e,allowTapClose=true) {
    const drag=state.drag;
    state.drag=null;
    if(state.pendingDraw){state.pendingDraw=false;draw();}
    // Cancel/lost-capture must finish exactly like pointerup, otherwise a touch
    // interruption can leave the chart stuck in drag mode or delay live refresh.
    if(state.pendingRefresh && !overlay.hidden) {
      state.pendingRefresh=false;
      window.setTimeout(()=>{if(!overlay.hidden && !state.drag) loadData(true);},0);
    }
    if(!allowTapClose || !drag || drag.moved || overlay.hidden || !e) return;
    // A tap on a candle or EMA keeps the chart open; every other area exits.
    if(!hitRenderedChart(e.clientX,e.clientY)) close();
  }
  function pointerUp(e) { finishPointerGesture(e,true); }
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
  canvas.addEventListener('pointercancel',()=>finishPointerGesture(null,false));
  canvas.addEventListener('lostpointercapture',()=>{if(state.drag)finishPointerGesture(null,false);});
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
  // Keep the drawing surface and drag bounds synchronized with dynamic mobile
  // viewport changes (browser chrome, split view, and device rotation).
  window.addEventListener('resize',fitCanvas,{passive:true});
  window.addEventListener('orientationchange',()=>window.setTimeout(fitCanvas,80),{passive:true});
  if(window.screen&&screen.orientation&&screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change',()=>window.setTimeout(fitCanvas,80));
  }
  if(window.visualViewport) {
    window.visualViewport.addEventListener('resize',fitCanvas,{passive:true});
    window.visualViewport.addEventListener('scroll',fitCanvas,{passive:true});
  }
  if(window.ResizeObserver) new ResizeObserver(fitCanvas).observe(canvas);
  async function loadLatestCandles(apiSymbol,isReality){
    const [stored,rawLatest]=await Promise.all([
      readPersistentCandles(apiSymbol,isReality),
      getJson(candlePath(apiSymbol,undefined,isReality))
    ]);
    const latest=normalize(rawLatest);
    const rows=mergeCandles(stored||[],latest).slice(-MAX_CANDLE_BARS);
    if(rows.length>=2) await writePersistentCandles(apiSymbol,isReality,rows);
    return rows;
  }
  function prewarmSymbol(symbol){
    symbol=String(symbol||'').trim().toUpperCase();
    if(!symbol || PREWARM_CACHE.has(symbol)) return PREWARM_CACHE.get(symbol);
    const job=(async()=>{
      const isReality=REALITY_STOCKS.has(symbol);
      const apiSymbol=isReality?await resolveRealitySymbol(symbol):await resolveContract(symbol);
      // Background prewarm only fetches the latest candles. Deep history is loaded
      // only for the chart the user actually opens, avoiding hundreds of idle requests.
      const rows=await loadLatestCandles(apiSymbol,isReality);
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
    }).filter(card=>{const r=card.getBoundingClientRect();return r.bottom>0&&r.top<window.innerHeight;}).slice(0,6);
    let cursor=0;
    async function worker(){
      while(cursor<ordered.length){
        const card=ordered[cursor++];
        await prewarmSymbol(card.dataset.symbol);
        await new Promise(resolve=>setTimeout(resolve,180));
      }
    }
    await Promise.all([worker(),worker()]);
  }
  window.VegasFifthLayer={open,close,refresh:()=>loadData(true),prewarm:()=>startBackgroundPrewarm(),getState:()=>({symbol:state.symbol,contractSymbol:state.contractSymbol,productType:REALITY_STOCKS.has(state.symbol)?'SPOT':'USDT-FUTURES',granularity:'4H',websocket:!!(state.ws&&state.ws.readyState===WebSocket.OPEN),visible:!overlay.hidden,candles:state.candles.length,historyLoading:state.historyLoading,historyExhausted:state.historyExhausted,prewarmed:PREWARM_CACHE.size,cacheStorage:'IndexedDB',historyTarget:EMA_WARMUP_BARS,cacheBars:MAX_CANDLE_BARS})};
  window.__VEGAS_FIFTH_LAYER_READY__=true;

  console.info('[Vegas Fifth Layer] initialized');
  // Warm only the first visible cards. Other symbols are loaded on demand to reduce idle network traffic.
  if(!document.hidden) startBackgroundPrewarm();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!overlay.hidden){const stale=!state.lastLiveAt||Date.now()-state.lastLiveAt>45000;if(stale)loadData(true);}});
})();
