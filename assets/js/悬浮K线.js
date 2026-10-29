/* 悬浮K线逻辑层（无显示模块）
 * 仅负责 Bitget 4H 行情、历史数据、EMA、IndexedDB 缓存与 WebSocket。
 * 不创建 DOM/CSS/Canvas，不绑定第三层卡片事件，不管理任何显示层级。
 * 新悬浮 K 线界面应调用 window.VegasFloatingKlineLogic。
 */
(function(){
  'use strict';
  if(window.VegasFloatingKlineLogic) return;

  const API='https://api.bitget.com';
  const REALITY_STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
  const CONTRACT_ALIASES={SKHYNIX:['SKHYNIXUSDT','SKHYUSDT']};
  const EMA_PERIODS=[12,36,43,144,169,576,676];
  const MAX_CANDLE_BARS=5000, EMA_WARMUP_BARS=3000;
  const CANDLE_DB_NAME='vegas-octopus-market-cache', CANDLE_DB_VERSION=1, CANDLE_STORE_NAME='candles';
  const FAST_CACHE_PREFIX='vegas-octopus-fast-kline:', FAST_CACHE_BARS=1000;
  const FAST_CACHE_MAX_AGE_MS=24*60*60*1000, PERSISTENT_CACHE_MAX_AGE_MS=7*24*60*60*1000;
  let candleDbPromise=null, contractInfoPromise=null, legacyContractInfoPromise=null, realityInfoPromise=null;
  const latestCandleRequests=new Map();
  const sockets=new Map();

  function candleCacheKey(symbol,isReality){return (isReality?'SPOT:':'USDT-FUTURES:')+String(symbol||'').toUpperCase()+':4H';}
  function openCandleDb(){
    if(!('indexedDB' in window))return Promise.resolve(null);
    if(candleDbPromise)return candleDbPromise;
    candleDbPromise=new Promise(resolve=>{
      let request;
      try{request=indexedDB.open(CANDLE_DB_NAME,CANDLE_DB_VERSION);}catch(_){resolve(null);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(CANDLE_STORE_NAME))db.createObjectStore(CANDLE_STORE_NAME,{keyPath:'key'});};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();candleDbPromise=null;};resolve(db);};
      request.onerror=()=>{candleDbPromise=null;resolve(null);};
      request.onblocked=()=>{candleDbPromise=null;resolve(null);};
    });
    return candleDbPromise;
  }
  function normalize(rows){
    const byTime=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
      if(!Array.isArray(row)||row.length<5)continue;
      const c={t:Number(row[0]),o:Number(row[1]),h:Number(row[2]),l:Number(row[3]),c:Number(row[4])};
      if(![c.t,c.o,c.h,c.l,c.c].every(Number.isFinite)||c.t<=0||c.o<=0||c.h<=0||c.l<=0||c.c<=0)continue;
      byTime.set(c.t,c);
    }
    return Array.from(byTime.values()).sort((a,b)=>a.t-b.t);
  }
  function mergeCandles(...groups){
    const byTime=new Map();
    for(const group of groups)for(const c of Array.isArray(group)?group:[]){
      if(!c||![c.t,c.o,c.h,c.l,c.c].every(Number.isFinite)||c.t<=0||c.o<=0||c.h<=0||c.l<=0||c.c<=0)continue;
      byTime.set(c.t,c);
    }
    return Array.from(byTime.values()).sort((a,b)=>a.t-b.t);
  }
  async function readPersistentCandles(symbol,isReality){
    const db=await openCandleDb();if(!db)return null;
    return new Promise(resolve=>{try{
      const req=db.transaction(CANDLE_STORE_NAME,'readonly').objectStore(CANDLE_STORE_NAME).get(candleCacheKey(symbol,isReality));
      req.onsuccess=()=>{
        const v=req.result;
        if(!v||!Array.isArray(v.rows)){resolve(null);return;}
        const rows=v.rows.length&&!Array.isArray(v.rows[0])?mergeCandles(v.rows):normalize(v.rows);
        rows.cacheUpdatedAt=Number(v.updatedAt)||0;
        resolve(rows);
      };
      req.onerror=()=>resolve(null);
    }catch(_){resolve(null);}});
  }
  async function writePersistentCandles(symbol,isReality,rows){
    const db=await openCandleDb();if(!db||!Array.isArray(rows)||!rows.length)return false;
    return new Promise(resolve=>{try{
      const tx=db.transaction(CANDLE_STORE_NAME,'readwrite');
      tx.objectStore(CANDLE_STORE_NAME).put({key:candleCacheKey(symbol,isReality),symbol:String(symbol||'').toUpperCase(),market:isReality?'SPOT':'USDT-FUTURES',interval:'4H',rows:rows.slice(-MAX_CANDLE_BARS),count:Math.min(rows.length,MAX_CANDLE_BARS),oldestTime:rows[0].t,newestTime:rows[rows.length-1].t,updatedAt:Date.now()});
      tx.oncomplete=()=>resolve(true);tx.onerror=tx.onabort=()=>resolve(false);
    }catch(_){resolve(false);}});
  }
  function fastCacheKey(symbol,isReality){return FAST_CACHE_PREFIX+(isReality?'SPOT:':'FUTURES:')+String(symbol||'').toUpperCase();}
  function apiSymbolKey(symbol,isReality){return FAST_CACHE_PREFIX+'api:'+ (isReality?'SPOT:':'FUTURES:')+String(symbol||'').toUpperCase();}
  function readFastCache(symbol,isReality){
    try{
      const raw=localStorage.getItem(fastCacheKey(symbol,isReality));if(!raw)return null;
      const saved=JSON.parse(raw);if(!saved||!saved.apiSymbol||!Array.isArray(saved.rows)||saved.rows.length<2)return null;
      const updatedAt=Number(saved.updatedAt)||0;
      if(!updatedAt||Date.now()-updatedAt>FAST_CACHE_MAX_AGE_MS){localStorage.removeItem(fastCacheKey(symbol,isReality));return null;}
      const candles=normalize(saved.rows);
      if(candles.length<2)return null;
      return {symbol:String(symbol||'').toUpperCase(),apiSymbol:saved.apiSymbol,isReality,candles,series:buildEmaSeries(candles),source:'local-cache',cacheUpdatedAt:updatedAt,pagesLoaded:0};
    }catch(_){return null;}
  }
  function writeFastCache(symbol,apiSymbol,isReality,rows){
    if(!Array.isArray(rows)||rows.length<2)return;
    try{
      localStorage.setItem(apiSymbolKey(symbol,isReality),apiSymbol);
      const compact=rows.slice(-FAST_CACHE_BARS).map(c=>[c.t,c.o,c.h,c.l,c.c]);
      localStorage.setItem(fastCacheKey(symbol,isReality),JSON.stringify({apiSymbol,updatedAt:Date.now(),rows:compact}));
    }catch(_){}
  }
  function getInstantHistory(symbol){
    const name=String(symbol||'').trim().toUpperCase();if(!name)return null;
    return readFastCache(name,REALITY_STOCKS.has(name));
  }
  async function getJson(url){
    const response=await fetch(API+url,{cache:'no-store'});
    if(!response.ok)throw new Error('Bitget HTTP '+response.status+' · '+url);
    const json=await response.json();
    if(json.code!=='00000'||!Array.isArray(json.data))throw new Error((json.msg||'Bitget response invalid')+' · '+url);
    return json.data;
  }
  // 同一交易对的最新K线请求共享进行中的 Promise，避免快速加载与完整加载重复打接口。
  function loadLatestCandles(symbol,isReality){
    const key=candleCacheKey(symbol,isReality);
    if(latestCandleRequests.has(key))return latestCandleRequests.get(key);
    const request=getJson(candlePath(symbol,undefined,isReality)).then(normalize).finally(()=>{
      if(latestCandleRequests.get(key)===request)latestCandleRequests.delete(key);
    });
    latestCandleRequests.set(key,request);
    return request;
  }
  function candlePath(symbol,endTime,isReality=false){
    const q=new URLSearchParams({category:isReality?'SPOT':'USDT-FUTURES',symbol,interval:'4H',limit:'1000',...(Number.isFinite(endTime)?{endTime:String(endTime)}:{})});
    return '/api/v3/market/candles?'+q;
  }
  function historyCandlePath(symbol,endTime,isReality=false){
    const q=new URLSearchParams({category:isReality?'SPOT':'USDT-FUTURES',symbol,interval:'4H',limit:'100',endTime:String(endTime)});
    return '/api/v3/market/history-candles?'+q;
  }
  async function resolveRealitySymbol(symbol){
    if(!realityInfoPromise)realityInfoPromise=getJson('/api/v3/reality/market/stock-info').catch(e=>{realityInfoPromise=null;throw e;});
    const rows=await realityInfoPromise;let found=rows.find(row=>row&&String(row.code||'').trim().toUpperCase()===symbol);
    if(symbol==='SKHYNIX'&&!found)found=rows.find(row=>row&&(/SK\s*HYNIX/i.test(String(row.name||''))||/RSKHYUSDT/i.test(String(row.symbol||''))));
    if(!found||!found.symbol)throw new Error('Bitget Reality 未找到股票代码：'+symbol);
    return String(found.symbol).trim().toUpperCase();
  }
  async function resolveContract(symbol){
    const name=String(symbol||'').trim().toUpperCase();
    const candidates=[...(CONTRACT_ALIASES[name]||[]),name.endsWith('USDT')?name:name+'USDT'].filter((v,i,a)=>v&&a.indexOf(v)===i);
    let rows=[];
    try{if(!contractInfoPromise)contractInfoPromise=getJson('/api/v3/market/instruments?category=USDT-FUTURES').catch(e=>{contractInfoPromise=null;throw e;});rows=await contractInfoPromise;}catch(_){}
    let found=rows.find(row=>row&&candidates.includes(String(row.symbol||'').trim().toUpperCase()));
    if(!found){
      try{
        if(!legacyContractInfoPromise)legacyContractInfoPromise=getJson('/api/v2/mix/market/contracts?productType=USDT-FUTURES').catch(e=>{legacyContractInfoPromise=null;throw e;});
        const legacy=await legacyContractInfoPromise;
        found=legacy.find(row=>row&&candidates.includes(String(row.symbol||'').trim().toUpperCase())&&(!row.symbolStatus||['normal','online','listed'].includes(String(row.symbolStatus).toLowerCase())));
      }catch(_){}
    }
    if(!found)throw new Error('Bitget 未找到在线 USDT 本位合约：'+name);
    return String(found.symbol).trim().toUpperCase();
  }
  function calcEma(values,period){
    const result=Array(values.length).fill(null);if(!Number.isInteger(period)||period<1||values.length<period)return result;
    const k=2/(period+1);let sum=0;
    for(let i=0;i<period;i++){if(!Number.isFinite(values[i]))return result;sum+=values[i];}
    let previous=sum/period;result[period-1]=previous;
    for(let i=period;i<values.length;i++){
      const v=values[i];if(!Number.isFinite(v)){previous=null;continue;}
      if(previous===null){let s=0,valid=true;for(let j=i-period+1;j<=i;j++){if(!Number.isFinite(values[j])){valid=false;break;}s+=values[j];}if(!valid)continue;previous=s/period;result[i]=previous;continue;}
      previous=v*k+previous*(1-k);result[i]=previous;
    }
    return result;
  }
  function buildEmaSeries(candles){const closes=candles.map(c=>c.c);return EMA_PERIODS.map(period=>({period,values:calcEma(closes,period)}));}
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function loadHistory(symbol,options={}){
    const name=String(symbol||'').trim().toUpperCase();if(!name)throw new Error('缺少品种代码');
    const isReality=options.isReality===undefined?REALITY_STOCKS.has(name):!!options.isReality;
    if(options.fast){const instant=readFastCache(name,isReality);if(instant)return instant;}
    let mappedApiSymbol=null;try{mappedApiSymbol=localStorage.getItem(apiSymbolKey(name,isReality));}catch(_){}
    // 常规合约直接请求标准交易对，跳过首屏前的合约目录查询；失败时再走完整校验与别名解析。
    let apiSymbol=options.apiSymbol||mappedApiSymbol||(isReality?await resolveRealitySymbol(name):(CONTRACT_ALIASES[name]?.[0]||(name.endsWith('USDT')?name:name+'USDT')));
    let stored=await readPersistentCandles(apiSymbol,isReality);
    if(stored&&(!stored.cacheUpdatedAt||Date.now()-stored.cacheUpdatedAt>PERSISTENT_CACHE_MAX_AGE_MS))stored=null;
    if(options.fast&&stored&&stored.length>=2){const cached=stored.slice(-MAX_CANDLE_BARS);writeFastCache(name,apiSymbol,isReality,cached);return {symbol:name,apiSymbol,isReality,candles:cached,series:buildEmaSeries(cached),source:'cache',cacheUpdatedAt:stored.cacheUpdatedAt,pagesLoaded:0};}
    let latest=[];
    try{latest=await loadLatestCandles(apiSymbol,isReality);}
    catch(error){
      if(!isReality&&!options.apiSymbol&&!mappedApiSymbol){
        try{const resolved=await resolveContract(name);if(resolved!==apiSymbol){apiSymbol=resolved;latest=await loadLatestCandles(apiSymbol,isReality);}}
        catch(_){}
      }
      if(!latest.length){if(stored&&stored.length>=2){const cached=stored.slice(-MAX_CANDLE_BARS);writeFastCache(name,apiSymbol,isReality,cached);return {symbol:name,apiSymbol,isReality,candles:cached,series:buildEmaSeries(cached),source:'cache'};}throw error;}
    }
    let combined=mergeCandles(stored||[],latest),pages=0,cursor=combined.length?combined[0].t-1:Date.now();
    const target=MAX_CANDLE_BARS,maxPages=Math.ceil(target/100)+2;
    let historyLoadWarning=null;
    while(!options.fast&&combined.length<target&&pages<maxPages&&cursor>0){
      let raw;try{raw=await getJson(historyCandlePath(apiSymbol,cursor,isReality));}catch(error){historyLoadWarning='历史分页请求失败：'+String(error&&error.message||error);break;}
      pages++;const page=normalize(raw);if(!page.length)break;
      const old=combined.length?combined[0].t:Infinity;
      // 历史分页只接纳当前最早K线之前的数据，过滤边界重复或接口意外返回的较新K线。
      const olderPage=page.filter(c=>c.t<old);
      if(!olderPage.length)break;
      const next=mergeCandles(olderPage,combined);
      if(next.length<=combined.length||next[0].t>=old)break;
      combined=next;cursor=combined[0].t-1;if(olderPage.length<100)break;await delay(120);
    }
    if(combined.length<2)throw new Error('Bitget 未返回足够的有效 4H K 线：'+name);
    combined=combined.slice(-MAX_CANDLE_BARS);
    const emaWarmupSatisfied=combined.length>=EMA_WARMUP_BARS;
    if(!emaWarmupSatisfied&&!historyLoadWarning)historyLoadWarning='历史K线共 '+combined.length+' 根，少于 EMA 长周期预热建议值 '+EMA_WARMUP_BARS+' 根；长周期 EMA 初始化误差可能较大。';
    if(historyLoadWarning)console.warn('[悬浮K线] '+name+'：'+historyLoadWarning);
    writeFastCache(name,apiSymbol,isReality,combined);await writePersistentCandles(apiSymbol,isReality,combined);
    return {symbol:name,apiSymbol,isReality,candles:combined,series:buildEmaSeries(combined),source:'bitget',pagesLoaded:pages,historyBars:combined.length,emaWarmupSatisfied,historyLoadWarning};
  }
  function subscribeLive(apiSymbol,options={}){
    const isReality=!!options.isReality,onCandle=typeof options.onCandle==='function'?options.onCandle:()=>{};
    const onStatus=typeof options.onStatus==='function'?options.onStatus:()=>{};
    const key=(isReality?'SPOT:':'USDT-FUTURES:')+apiSymbol;
    unsubscribeLive(key);
    let stopped=false,socket=null,reconnectTimer=0,heartbeat=0,connectTimer=0,subscribeTimer=0,pongTimer=0,lastStatus='';
    const ACK_TIMEOUT_MS=12000,PONG_TIMEOUT_MS=12000,HEARTBEAT_INTERVAL_MS=25000;
    function status(value,detail){if(lastStatus===value&&!detail)return;lastStatus=value;try{onStatus({status:value,detail:detail||null,symbol:apiSymbol});}catch(_){}}
    function clearConnectionTimers(){
      clearInterval(heartbeat);heartbeat=0;
      clearTimeout(connectTimer);connectTimer=0;
      clearTimeout(subscribeTimer);subscribeTimer=0;
      clearTimeout(pongTimer);pongTimer=0;
    }
    function scheduleReconnect(){
      if(stopped||reconnectTimer)return;
      status('reconnecting');
      reconnectTimer=setTimeout(()=>{reconnectTimer=0;connect();},3000);
    }
    const entry={stop:()=>{
      stopped=true;
      clearTimeout(reconnectTimer);reconnectTimer=0;
      clearConnectionTimers();
      const current=socket;socket=null;
      if(current){current.onclose=null;current.onopen=null;current.onmessage=null;current.onerror=null;try{current.close();}catch(_){}}
      status('closed');
      if(sockets.get(key)===entry)sockets.delete(key);
    }};
    // 先登记订阅生命周期；即使 WebSocket 构造失败，也能通过 unsubscribe 清掉全部定时器。
    sockets.set(key,entry);
    function connect(){
      if(stopped)return;
      if(!('WebSocket'in window)){status('error','当前环境不支持 WebSocket');scheduleReconnect();return;}
      status('connecting');
      try{socket=new WebSocket('wss://ws.bitget.com/v2/ws/public');}
      catch(error){status('error',String(error&&error.message||error));scheduleReconnect();return;}
      const current=socket;
      connectTimer=setTimeout(()=>{if(!stopped&&socket===current){status('error','12秒内未建立 WebSocket 连接');try{current.close();}catch(_){}}},ACK_TIMEOUT_MS);
      current.onopen=()=>{
        clearTimeout(connectTimer);connectTimer=0;
        if(stopped||socket!==current){try{current.close();}catch(_){}return;}
        try{
          current.send(JSON.stringify({op:'subscribe',args:[{instType:isReality?'SPOT':'USDT-FUTURES',channel:'candle4H',instId:apiSymbol}]}));
        }catch(error){status('error','订阅请求发送失败');try{current.close();}catch(_){}return;}
        status('connected');
        clearTimeout(subscribeTimer);
        subscribeTimer=setTimeout(()=>{
          if(!stopped&&socket===current){status('error','12秒内未收到订阅确认');try{current.close();}catch(_){}}
        },ACK_TIMEOUT_MS);
        clearInterval(heartbeat);
        heartbeat=setInterval(()=>{
          if(stopped||socket!==current)return;
          if(current.readyState===WebSocket.OPEN){
            clearTimeout(pongTimer);
            try{
              current.send('ping');
              pongTimer=setTimeout(()=>{
                if(!stopped&&socket===current){status('stale','心跳超时，正在重连');try{current.close();}catch(_){}}
              },PONG_TIMEOUT_MS);
            }catch(_){try{current.close();}catch(__){}}
          }
        },HEARTBEAT_INTERVAL_MS);
      };
      current.onmessage=event=>{
        if(stopped||socket!==current)return;
        if(event.data==='pong'){
          clearTimeout(pongTimer);pongTimer=0;
          return;
        }
        let msg;try{msg=JSON.parse(event.data);}catch(_){return;}
        if(msg.event==='error'||(msg.code&&msg.code!=='00000')){
          console.error('[悬浮K线] Bitget WebSocket 返回错误：',msg.code||'',msg.msg||'');
          status('error',msg.msg||msg.code||'Bitget WebSocket 错误');
          try{current.close();}catch(_){}
          return;
        }
        const expectedInstType=isReality?'SPOT':'USDT-FUTURES';
        const expectedArg=arg=>arg&&arg.instType===expectedInstType&&arg.instId===apiSymbol&&arg.channel==='candle4H';
        if(msg.event==='subscribe'&&expectedArg(msg.arg)){
          clearTimeout(subscribeTimer);subscribeTimer=0;
          status('subscribed');
          return;
        }
        if(msg.event==='unsubscribe'&&expectedArg(msg.arg)){
          status('unsubscribed');
          return;
        }
        if(expectedArg(msg.arg)&&Array.isArray(msg.data)){
          // 有效行情也能确认订阅已生效，兼容确认包缺失但行情正常的服务端情况。
          clearTimeout(subscribeTimer);subscribeTimer=0;
          status('subscribed');
          for(const row of msg.data){const candle=normalize([row])[0];if(candle&&!stopped&&socket===current)onCandle(candle);}
        }
      };
      current.onerror=()=>{status('error','WebSocket 网络错误');try{current.close();}catch(_){}};
      current.onclose=()=>{
        clearConnectionTimers();
        if(socket===current)socket=null;
        scheduleReconnect();
      };
    }
    connect();return ()=>unsubscribeLive(key);
  }
  function unsubscribeLive(keyOrSymbol){
    const key=String(keyOrSymbol||'');
    for(const [k,v] of sockets){if(k===key||k.endsWith(':'+key)){v.stop();sockets.delete(k);}}
  }
  window.VegasFloatingKlineLogic=Object.freeze({
    isRealitySymbol:symbol=>REALITY_STOCKS.has(String(symbol||'').toUpperCase()),
    getInstantHistory,
    loadHistory,resolveRealitySymbol,resolveContract,readPersistentCandles,writePersistentCandles,
    normalize,mergeCandles,calcEma,buildEmaSeries,subscribeLive,unsubscribeLive,
    constants:Object.freeze({interval:'4H',emaPeriods:EMA_PERIODS.slice(),maxCandles:MAX_CANDLE_BARS,emaWarmupBars:EMA_WARMUP_BARS})
  });
  console.info('[悬浮K线逻辑] 数据层已加载；显示模块未创建。');
})();
