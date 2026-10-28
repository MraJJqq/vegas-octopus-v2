/* 第二层：最新事件模块，读取正式信号状态。 */
(function(){
  const STATE_URL="https://raw.githubusercontent.com/MraJJqq/vegas-octopus-v2/main/v9-signals.json";
  const CORE_ORDER=["BTC","HYPE","XAU","CL"];
  const STOCK_ORDER=["AAPL","MSFT","GOOGL","AMZN","NVDA","TSLA","META","INTC","QCOM","AMD","TSM","AVGO","ORCL","ARM","MU","ASML","SNDK","SKHYNIX","MRVL","GLW","HOOD","CBRS","SPCX"];
  const ALLOWED=new Set(CORE_ORDER.concat(STOCK_ORDER));
  const $=id=>document.getElementById(id);
  function symbolName(raw){
    let s=String(raw||"").trim().toUpperCase();
    if(s.endsWith("USDT"))s=s.slice(0,-4);
    if(s==="CLU")s="CL";
    return s;
  }
  function todayBeijing(){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const p={};parts.forEach(x=>{p[x.type]=x.value});
    return p.year+"-"+p.month+"-"+p.day;
  }
  function renderSymbols(targetId,symbols){
    const target=$(targetId);
    if(!target)return;
    target.replaceChildren();
    if(!symbols.length){
      const empty=document.createElement("span");
      empty.className="v9-nochange";
      empty.textContent="▰ No change ▰";
      target.appendChild(empty);
      return;
    }
    symbols.forEach(symbol=>{
      const item=document.createElement("span");
      item.className="v9-symbol";
      item.textContent="▰ "+symbol+" ▰";
      target.appendChild(item);
    });
  }
  function renderMessage(message){
    ["v9Stocks","v9Core"].forEach(id=>{
      const target=$(id);
      if(!target)return;
      target.replaceChildren();
      const item=document.createElement("span");
      item.className="v9-nochange";
      item.textContent=message;
      target.appendChild(item);
    });
  }
  async function fetchStateJson(){
    const response=await fetch(STATE_URL+"?t="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("公开信号镜像 HTTP "+response.status);
    return await response.json();
  }
  async function refreshV9State(){
    try{
      const state=await fetchStateJson();
      const daily=state&&state.__daily_formal_signals__;
      if(!daily||!Array.isArray(daily.signals))throw new Error("状态格式无效");
      if(daily.date!==todayBeijing()){
        window.VegasFormalSignalSymbols=[];
        if(typeof window.VegasApplyFormalSignals==="function")window.VegasApplyFormalSignals();
        renderMessage("等待今日扫描");
        return;
      }
      const seen=new Set();
      for(const signal of daily.signals){
        if(!signal||signal.formal_signal!==true)continue;
        const s=symbolName(signal.symbol);
        if(ALLOWED.has(s))seen.add(s);
      }
      window.VegasFormalSignalSymbols=Array.from(seen);
      if(typeof window.VegasApplyFormalSignals==="function")window.VegasApplyFormalSignals();
      renderSymbols("v9Stocks",STOCK_ORDER.filter(s=>seen.has(s)));
      renderSymbols("v9Core",CORE_ORDER.filter(s=>seen.has(s)));
    }catch(error){
      window.VegasFormalSignalSymbols=[];
      if(typeof window.VegasApplyFormalSignals==="function")window.VegasApplyFormalSignals();
      const detail=String(error&&error.message||error).slice(0,70);
      renderMessage("读取失败："+detail);
      console.warn("V9 latest-events state unavailable:",error);
    }
  }
  refreshV9State();
  window.setInterval(refreshV9State,15*60*1000);
})();
