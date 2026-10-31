import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const jsFiles = [
  'assets/js/market-universe.js',
  'assets/js/market-data.js',
  'assets/js/market-card-view.js',
  'assets/js/market-card-scroll.js',
  'assets/js/market-cards.js',
  'assets/js/kline-data.js',
  'assets/js/kline-chart.js',
  'assets/js/right-signal-scroll.js',
];
const fail = message => { console.error('FAIL:', message); process.exitCode = 1; };
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(file + ': ' + (result.stderr || result.stdout).trim());
}
const read = path => fs.readFileSync(path, 'utf8');
const universe = read('assets/js/market-universe.js');
const symbols = [...universe.matchAll(/\['([A-Z]+)','([A-Z0-9]+)'\]/g)];
if (symbols.length !== 27) fail('Layer 3 universe must contain exactly 27 ordered instruments; found ' + symbols.length);

const marketData = read('assets/js/market-data.js');
if (!marketData.includes('/api/v3/market/candles?') || !marketData.includes('/api/v2/mix/market/candles?')) fail('Layer 3 spot and Mix candle endpoints must both exist');
if (marketData.includes('/api/v3/market/candles?category=USDT-FUTURES')) fail('Mix futures candles must not use the spot endpoint');

const klineData = read('assets/js/kline-data.js');
if (!klineData.includes('/api/v3/market/candles') || !klineData.includes('/api/v2/mix/market/candles')) fail('Layer 5 spot/Mix data paths are incomplete');
if (!klineData.includes('[12,36,43,144,169,576,676]') && !klineData.includes('[12,36,43,144,169,576,676]')) fail('Vegas EMA set mismatch');

const cards = read('assets/js/market-cards.js');
const controller = read('assets/js/right-signal-scroll.js');
const scroll = read('assets/js/market-card-scroll.js');
if (!cards.includes('VegasLayer5ShowSymbol') || !cards.includes('VegasLayer5SetAutoQueue')) fail('Layer 3/5 bridge calls missing');
if (!controller.includes('window.VegasLayer5ShowSymbol=selectSymbol') || !controller.includes('window.VegasLayer5SetAutoQueue=setQueue')) fail('Layer 5 public contract missing');
if (scroll.includes('VegasMarketCardScrollInit')) fail('Legacy scroll initializer remains');
for (const legacy of ['fadeState', 'manualReturnTimer', 'initialRevealTimer', 'cycleTimer']) {
  if (controller.includes(legacy)) fail('Legacy Layer 5 state remains: ' + legacy);
}
if (!controller.includes('TRANSITION_MS=5000') || !controller.includes('CLEAR_MS=5000')) fail('Layer 5 rotation timing changed');

const html = read('index.html');
const order = ['market-universe.js', 'market-data.js', 'market-card-view.js', 'market-card-scroll.js', 'market-cards.js', 'kline-data.js'];
let previous = -1;
for (const name of order) {
  const position = html.indexOf(name);
  if (position < 0 || position <= previous) fail('index.html script dependency order invalid at ' + name);
  previous = position;
}
if (!html.includes("chart.src='./assets/js/kline-chart.js") || !html.includes("app.src='./assets/js/right-signal-scroll.js")) fail('Layer 5 dynamic load chain missing');

if (!process.exitCode) console.log('PASS: syntax, 27-symbol universe, Bitget endpoints, public interfaces, rotation timing and script order.');
