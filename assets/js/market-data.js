/* Layer 3 Bitget data engine. Owns all market requests, caches and polling. */
(function(){
'use strict';
if(window.VegasMarketData)return;
const API='https://api.bitget.com',REFRESH_MS=15000,MINI_REFRESH_MS=60000;
const stockSymbols=new Set((window.VegasMarketUniverse||[]).filter(x=>x.isSpotStock).map(x=>x.symbol));
let stockMap=null,stockMapAt=0,stockMapPromise=null,refreshTimer=0,refreshing=false,miniNextAt=0,stopped=false;
const snapshots=new Map();
function request(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 return fetch(API+path,{cache:'no-store',signal:controller.signal}).then(async response=>{
  if(!response.ok)throw Error('Bitget HTTP '+response.status);
  const json=await response.json();
  if(json.code!=='00000'||!Array.isArray(json.data))throw Error(json.msg||'Bitget data invalid');
  return json.data;
 }).finally(()=>clearTimeout(timer));
}
function getStockMap(){
 if(stockMap&&Date.now()-stockMapAt<300000)return Promise.resolve(stockMap);
 if(stockMapPromise)return stockMapPromise;
 stockMapPromise=request('/api/v3/reality/market/stock-info').then(rows=>{
  const map=new Map(rows.filter(x=>x?.code&&x?.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
  const special=rows.find(x=>x?.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
  if(special)map.set('SKHYNIX',String(special.symbol));
  stockMap=map;stockMapAt=Date.now();return map;
 }).finally(()=>{stockMapPromise=null;});
 return stockMapPromise;
}
function normalizeMini(rows){
 return rows.map(row=>({time:Number(row[0]),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4])}))
 .filter(c=>Number.isFinite(c.time)&&c.open>0&&c.high>0&&c.low>0&&c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));
}
async function refreshMini(instruments){
 if(Date.now()<miniNextAt||document.hidden)return;
 miniNextAt=Date.now()+MINI_REFRESH_MS;
 const map=await getStockMap().catch(()=>stockMap);
 const queue=instruments.filter(x=>!x.isSpotStock||(map&&map.has(x.symbol)));
 let cursor=0;
 async function worker(){
  while(cursor<queue.length&&!stopped){
   const item=queue[cursor++],previous=snapshots.get(item.symbol),symbol=item.isSpotStock?map.get(item.symbol):item.contract;
   if(!symbol)continue;
   const limit=previous?.candles?.length?'3':'60';
   const path=item.isSpotStock
    ?'/api/v3/market/candles?'+new URLSearchParams({category:'SPOT',symbol,interval:'1H',limit})
    :'/api/v2/mix/market/candles?'+new URLSearchParams({symbol,productType:'USDT-FUTURES',granularity:'1H',limit});
   try{
    const incoming=normalizeMini(await request(path)),merged=new Map((previous?.candles||[]).map(c=>[c.time,c]));
    incoming.forEach(c=>merged.set(c.time,c));
    const candles=[...merged.values()].sort((a,b)=>a.time-b.time).slice(-60);
    const next={...(previous||{}),candles};
    snapshots.set(item.symbol,next);
   }catch(error){console.warn('[Vegas Market Data] mini candles failed:',item.symbol,error);}
  }
 }
 await Promise.all(Array.from({length:3},worker));
}
async function refresh(instruments,onUpdate){
 if(stopped||document.hidden||refreshing)return;
 refreshing=true;
 try{
  const [futuresResult,spotsResult,mapResult]=await Promise.allSettled([
   request('/api/v2/mix/market/tickers?productType=USDT-FUTURES'),
   request('/api/v3/market/tickers?category=SPOT'),
   getStockMap()
  ]);
  const futures=futuresResult.status==='fulfilled'?new Map(futuresResult.value.map(x=>[String(x.symbol).toUpperCase(),x])):null;
  const spots=spotsResult.status==='fulfilled'?new Map(spotsResult.value.map(x=>[String(x.symbol).toUpperCase(),x])):null;
  const map=mapResult.status==='fulfilled'?mapResult.value:stockMap;
  instruments.forEach(item=>{
   const previous=snapshots.get(item.symbol)||{candles:[]};
   const exchangeSymbol=item.isSpotStock?map?.get(item.symbol):item.contract;
   const ticker=item.isSpotStock?(exchangeSymbol&&spots?.get(exchangeSymbol.toUpperCase())):futures?.get(item.contract);
   if(!ticker)return;
   const price=Number(item.isSpotStock?ticker.lastPrice:ticker.lastPr);
   const open=Number(item.isSpotStock?ticker.openPrice24h:ticker.open24h);
   if(!(price>0&&open>0))return;
   snapshots.set(item.symbol,{...previous,price,open,exchangeSymbol,updatedAt:Date.now()});
  });
  await refreshMini(instruments);
  if(typeof onUpdate==='function')onUpdate(new Map(snapshots));
 }finally{
  refreshing=false;
 }
}
function schedule(instruments,onUpdate){
 if(stopped||document.hidden||refreshTimer)return;
 refreshTimer=setTimeout(async()=>{
  refreshTimer=0;
  try{await refresh(instruments,onUpdate)}catch(error){console.warn('[Vegas Market Data] refresh failed:',error);}
  schedule(instruments,onUpdate);
 },REFRESH_MS);
}
function start(instruments,onUpdate){
 stopped=false;
 refresh(instruments,onUpdate).catch(error=>console.warn('[Vegas Market Data] initial refresh failed:',error)).finally(()=>schedule(instruments,onUpdate));
}
function onVisibility(){
 if(document.hidden){if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=0;return;}
 refreshTimer=0;refresh(instrumentsRef,updateRef).finally(()=>schedule(instrumentsRef,updateRef));
}
let instrumentsRef=[],updateRef=null;
function mount(instruments,onUpdate){
 instrumentsRef=instruments;updateRef=onUpdate;
 document.addEventListener('visibilitychange',onVisibility,{passive:true});
 start(instruments,onUpdate);
 return destroy;
}
function destroy(){
 stopped=true;if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=0;
 document.removeEventListener('visibilitychange',onVisibility);
}
window.VegasMarketData={mount,destroy,getStockMap,request};
})();