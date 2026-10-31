/* Layer 5 Bitget candle engine. No DOM or chart state. */
(function(){
'use strict';
const API='https://api.bitget.com';
const STOCKS=new Set(['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','INTC','QCOM','AMD','TSM','AVGO','ORCL','ARM','MU','ASML','SNDK','SKHYNIX','MRVL','GLW','HOOD','CBRS','SPCX']);
const cache=new Map(),inflight=new Map(),backfills=new Map();
async function request(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(API+path,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('Bitget HTTP '+response.status);
  const json=await response.json();
  if(json.code!=='00000'||!Array.isArray(json.data))throw Error(json.msg||'Bitget response invalid');
  return json.data;
 }finally{clearTimeout(timer);}
}
async function stockMap(){
 if(typeof window.VegasGetRealityStockMap==='function')return window.VegasGetRealityStockMap();
 const rows=await request('/api/v3/reality/market/stock-info');
 const map=new Map(rows.filter(x=>x?.code&&x?.symbol).map(x=>[String(x.code).toUpperCase(),String(x.symbol)]));
 const special=rows.find(x=>x?.symbol&&(/SKHYNIX/i.test(String(x.code||''))||/SK\s*HYNIX/i.test(String(x.name||''))||/RSKHYUSDT/i.test(String(x.symbol||''))));
 if(special)map.set('SKHYNIX',String(special.symbol));
 return map;
}
function normalize(rows){
 return rows.filter(row=>Array.isArray(row)&&row.slice(0,5).every(v=>Number.isFinite(+v)&&+v>0))
 .map(row=>({time:Math.floor(+row[0]/1000),open:+row[1],high:+row[2],low:+row[3],close:+row[4]}))
 .filter(row=>row.time>0&&row.high>=Math.max(row.open,row.close)&&row.low<=Math.min(row.open,row.close));
}
async function context(symbol,period){
 const spot=STOCKS.has(symbol),mapped=spot?(await stockMap()).get(symbol):null;
 if(spot&&!mapped)throw Error('Bitget stock mapping unavailable: '+symbol);
 return spot?{
  latest:'/api/v3/market/candles',history:'/api/v3/market/history-candles',
  latestParams:{category:'SPOT',symbol:mapped,interval:period,limit:'1000'},
  historyParams:{category:'SPOT',symbol:mapped,interval:period,limit:'100'},
  pageLimit:100
 }:{
  latest:'/api/v2/mix/market/candles',history:'/api/v2/mix/market/history-candles',
  latestParams:{symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:period,limit:'1000'},
  historyParams:{symbol:symbol+'USDT',productType:'USDT-FUTURES',granularity:period,limit:'200'},
  pageLimit:200
 };
}
async function latest(symbol,period){
 const key=symbol+'|'+period,cached=cache.get(key);
 if(cached&&Date.now()-cached.at<12000)return cached.rows;
 if(inflight.has(key))return inflight.get(key);
 const promise=(async()=>{
  const ctx=await context(symbol,period),rows=normalize(await request(ctx.latest+'?'+new URLSearchParams(ctx.latestParams)));
  if(!rows.length)throw Error('No valid candles for '+symbol);
  const merged=new Map((cache.get(key)?.rows||[]).map(row=>[row.time,row]));
  rows.forEach(row=>merged.set(row.time,row));
  const result=[...merged.values()].sort((a,b)=>a.time-b.time);
  cache.set(key,{rows:result,at:Date.now()});return result;
 })();
 inflight.set(key,promise);
 try{return await promise}finally{if(inflight.get(key)===promise)inflight.delete(key);}
}
async function history(symbol,period,firstRows){
 const key=symbol+'|'+period;
 if(backfills.has(key))return backfills.get(key);
 const promise=(async()=>{
  const ctx=await context(symbol,period),all=new Map(firstRows.map(row=>[row.time,row]));
  let oldest=Math.min(...all.keys()),endTime=oldest*1000-1;
  for(let page=0;page<14&&all.size<1200;page++){
   const params={...ctx.historyParams,endTime:String(endTime)};
   const rows=normalize(await request(ctx.history+'?'+new URLSearchParams(params)));
   if(!rows.length)break;
   let added=0;rows.forEach(row=>{if(!all.has(row.time)){all.set(row.time,row);added++;}});
   const nextOldest=Math.min(...rows.map(row=>row.time));
   if(!added||!Number.isFinite(nextOldest)||nextOldest>=oldest)break;
   oldest=nextOldest;endTime=oldest*1000-1;
  }
  const latestRows=cache.get(key)?.rows||[];
  latestRows.forEach(row=>all.set(row.time,row));
  const result=[...all.values()].sort((a,b)=>a.time-b.time);
  cache.set(key,{rows:result,at:Date.now()});
  while(cache.size>30)cache.delete(cache.keys().next().value);
  return result;
 })();
 backfills.set(key,promise);
 try{return await promise}finally{if(backfills.get(key)===promise)backfills.delete(key);}
}
function ema(rows,length){
 if(rows.length<length)return[];
 let value=rows.slice(0,length).reduce((sum,row)=>sum+row.close,0)/length;
 const factor=2/(length+1),out=[{time:rows[length-1].time,value}];
 for(let i=length;i<rows.length;i++){value=rows[i].close*factor+value*(1-factor);out.push({time:rows[i].time,value});}
 return out;
}
window.VegasKlineData={load:latest,complete:history,ema,periods:['1H','4H','1D'],emas:[12,36,43,144,169,576,676]};
})();