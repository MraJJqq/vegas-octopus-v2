/* Immutable Layer 3 instrument universe. Order is a visual contract. */
(function(){
'use strict';
const rows=[
['AAPL','AAPLUSDT'],['MSFT','MSFTUSDT'],['GOOGL','GOOGLUSDT'],['AMZN','AMZNUSDT'],['NVDA','NVDAUSDT'],['TSLA','TSLAUSDT'],['META','METAUSDT'],['INTC','INTCUSDT'],['QCOM','QCOMUSDT'],['AMD','AMDUSDT'],['TSM','TSMUSDT'],['AVGO','AVGOUSDT'],['ORCL','ORCLUSDT'],['ARM','ARMUSDT'],['MU','MUUSDT'],['ASML','ASMLUSDT'],['SNDK','SNDKUSDT'],['SKHYNIX','SKHYNIXUSDT'],['MRVL','MRVLUSDT'],['GLW','GLWUSDT'],['HOOD','HOODUSDT'],['CBRS','CBRSUSDT'],['SPCX','SPCXUSDT'],['BTC','BTCUSDT'],['HYPE','HYPEUSDT'],['XAU','XAUUSDT'],['CL','CLUSDT']
];
const stocks=new Set(rows.slice(0,23).map(row=>row[0]));
window.VegasMarketUniverse=Object.freeze(rows.map(([symbol,contract],index)=>Object.freeze({
 symbol,contract,index,isSpotStock:stocks.has(symbol),
 subtitle:symbol==='BTC'||symbol==='HYPE'?'永续合约':symbol==='XAU'?'黄金永续合约':symbol==='CL'?'原油期货':'美股行情',
 icon:symbol==='BTC'?'₿':symbol==='XAU'?'Au':symbol==='CL'?'OIL':symbol==='HYPE'?'H':symbol[0]
})));
})();