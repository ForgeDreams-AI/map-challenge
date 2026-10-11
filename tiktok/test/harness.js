/* ============================================================
 * test/harness.js — node verification for the TikTok package.
 * Stubs: canvas 2D context, Path2D (string-throwing -> exercises the
 * manual fallback parser), TTMinis/tt, Image, prompt, localStorage.
 * Run: node test/harness.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- environment stubs ---------- */
const calls = {fill:[], stroke:[], taps:[]};
function fakeCtx(){
  return new Proxy({}, {
    get(t, prop){
      if(prop === 'isPointInPath') return (p2d, x, y) => fakeCtx._hit(x, y);
      if(prop === 'measureText') return () => ({width: 60});
      if(prop === 'canvas') return {width: 375, height: 667};
      return (...a) => {};
    },
    set(){ return true; }
  });
}
fakeCtx._hit = () => false; // scripted per test
// Path2D stub that THROWS on the SVG-string constructor -> forces manual parser
global.Path2D = class Path2D {
  constructor(d){ if(typeof d === 'string') throw new Error('no native svg-path Path2D'); this.ops = []; }
  moveTo(x,y){ this.ops.push(['M',x,y]); }
  lineTo(x,y){ this.ops.push(['L',x,y]); }
  closePath(){ this.ops.push(['Z']); }
};
global.TTMinis = { game: { init(){}, setLoadingProgress(){} } };
global.Image = class { set src(v){ setTimeout(() => this.onerror && this.onerror(new Error('stub')), 0); } };
global.prompt = () => '';
const _ls = {};
global.localStorage = {
  getItem: k => (k in _ls ? _ls[k] : null),
  setItem: (k,v) => { _ls[k] = String(v); },
  removeItem: k => { delete _ls[k]; }
};
global.requestAnimationFrame = undefined; // force setTimeout path

/* ---------- load sources in order ---------- */
const files = [
  'src/00-env.js','src/10-util.js',
  'data/data-world.js','data/data-us.js',
  'src/30-daily-data.js','src/40-mapquiz.js','src/50-daily.js',
  'src/60-path.js','src/70-ui.js','src/80-views-map.js',
  'src/90-views-daily.js','src/95-game.js'
];
let src = '';
for(const f of files) src += fs.readFileSync(path.join(ROOT, f), 'utf8') + '\n';
src += '\n;globalThis.__MC = MC;\n';
eval(src); // strict-mode eval: MC stays inside; re-export via globalThis
const MC = globalThis.__MC;

/* ---------- web-version oracle (daily seed equivalence) ---------- */
function loadWebDaily(){
  const html = fs.readFileSync(path.join(ROOT, '..', 'daily-challenge', 'index.html'), 'utf8');
  const m = html.match(/const COUNTRIES=\[.*?\];\n/);
  if(!m) throw new Error('COUNTRIES not found in web file');
  const utils = `
    function xmur3(str){for(var i=0,h=1779033703^str.length;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^=h>>>16)>>>0;};}
    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
    function seededShuffle(arr,rand){var a=arr.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(rand()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}
    function dailySet(dateStr){var rand=mulberry32(xmur3('dailyatlas|'+dateStr)());var idx=COUNTRIES.map(function(_,i){return i;});return seededShuffle(idx,rand).slice(0,30);}
    function roundOptions(dateStr,round,correctIdx){var rand=mulberry32(xmur3('dailyatlas|'+dateStr+'|r'+round)());var set={};set[correctIdx]=1;var n=1;while(n<4){var c=Math.floor(rand()*COUNTRIES.length);if(!set[c]){set[c]=1;n++;}}return seededShuffle(Object.keys(set).map(Number),rand);}
  `;
  const factory = new Function(m[0] + utils + '; return {dailySet, roundOptions, n: COUNTRIES.length};');
  return factory();
}

/* ---------- test runner ---------- */
let pass = 0, fail = 0;
const results = [];
function t(name, fn){
  try { fn(); pass++; results.push(['PASS', name]); }
  catch(e){ fail++; results.push(['FAIL', name + ' — ' + (e && e.message)]); }
}
function eq(a, b, msg){
  if(JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg||'mismatch') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}
function ok(v, msg){ if(!v) throw new Error(msg || 'expected truthy'); }

/* ================= tests ================= */
// SDK guards
t('sdk init/loaded do not throw without TTMinis', () => {
  const g = global.TTMinis; delete global.TTMinis;
  MC.sdkInit(); MC.sdkLoaded();
  global.TTMinis = g;
});
// path parser (fallback, since stub Path2D throws on strings)
t('parsePath bbox + manual Path2D fallback', () => {
  MC._pathCache.clear();
  const d = 'M10,20L30,20L30,40L10,40Z';
  const p = MC.path2d(d);
  ok(p && p.ops.length === 5, 'ops replayed, got ' + (p && p.ops.length));
  eq(MC.pathBBox(d), {x:10, y:20, w:20, h:20});
});
// real data through fallback parser
t('world data parses: 172 regions, bboxes sane', () => {
  let n = 0;
  globalThis.WORLD_DATA.c.forEach(c => { const b = MC.pathBBox(c.p); ok(b.w >= 0 && b.h >= 0); n++; });
  eq(n, 172);
});
t('us data parses: 50 states', () => {
  eq(globalThis.US_DATA.s.length, 50);
});

// ---- world mode full round ----
t('world: correct answer -> green + score', () => {
  MC.loadAliases();
  const q = new MC.Quiz('world', null);
  const target = q.places[0];
  ok(q.select(target.id), 'select');
  const r = q.submit(target.name);
  ok(r && r.ok, 'accepted');
  eq(q.correct.size, 1);
  eq(q.scoreText(), '1 / ' + q.places.length);
});
t('world: wrong answer -> life lost + practice list', () => {
  const q = new MC.Quiz('world', null);
  const target = q.places.find(p => p.name !== 'France') || q.places[1];
  q.select(target.id);
  const r = q.submit('Definitely Not A Country Xyz');
  ok(r && !r.ok, 'rejected');
  eq(q.wrong, 1);
  ok(q.missed.has(target.id), 'missed recorded');
  const store = MC.mcLoad();
  ok(MC.mcGame(store, 'world').practice.includes(target.id), 'practice list');
});
t('world: 3 wrong -> game over (lives)', () => {
  const q = new MC.Quiz('world', null);
  for(let i = 0; i < 3; i++){
    const p = q.places.find(x => !q.correct.has(x.id) && !q.missed.has(x.id));
    q.select(p.id);
    q.submit('Wrong Answer Xyz');
  }
  ok(q.over && q.overReason === 'lives', 'over by lives');
  ok(q.summary && q.summary.reason === 'lives', 'summary stored');
});
t('timer ticks down and ends game', () => {
  const q = new MC.Quiz('us', null);
  q.timeLeft = 3;
  q.tick(); q.tick();
  ok(!q.over, 'not over yet');
  q.tick();
  ok(q.over && q.overReason === 'time', 'over by time');
});
t('world-capitals: capital accepted, name rejected', () => {
  const q = new MC.Quiz('world-capitals', null);
  const france = q.places.find(p => p.name === 'France');
  ok(france, 'france in capitals mode');
  q.select(france.id);
  ok(q.submit('Paris').ok, 'Paris accepted');
  const q2 = new MC.Quiz('world-capitals', null);
  const g2 = q2.places.find(p => p.name === 'France');
  q2.select(g2.id);
  ok(!q2.submit('France').ok, 'country name not accepted for capital');
});
t('continent mode filters to continent', () => {
  const q = new MC.Quiz('continent', 'Asia');
  ok(q.places.length > 0 && q.places.every(p => p.continent === 'Asia'), 'asia only, n=' + q.places.length);
});
t('us mode: state name accepted', () => {
  const q = new MC.Quiz('us', null);
  const tx = q.places.find(p => p.id === 'TX');
  q.select(tx.id);
  ok(q.submit('Texas').ok, 'Texas accepted');
});
t('us-capitals: alias accepted (St Paul)', () => {
  const q = new MC.Quiz('us-capitals', null);
  const mn = q.places.find(p => p.id === 'MN');
  q.select(mn.id);
  ok(q.submit('St Paul').ok, 'alias St Paul accepted for Saint Paul');
});
t('select ignores already-answered regions', () => {
  const q = new MC.Quiz('world', null);
  const p = q.places[0];
  q.select(p.id); q.submit(p.name);
  ok(!q.select(p.id), 'reselect rejected');
});

// ---- learn mode ----
t('learn: two correct in a row masters the place', () => {
  const store = MC.mcLoad();
  const g = MC.mcGame(store, 'world');
  if(!g.practice.includes('FRA')){ g.practice.push('FRA'); MC.mcSave(store); }
  const L = new MC.Learn('world');
  L.queue = ['FRA']; // deterministic
  L.next();
  eq(L.current, 'FRA');
  let r = L.submit('France'); ok(r.ok && !r.mastered, 'first correct');
  L.next();
  r = L.submit('France'); ok(r.ok && r.mastered, 'mastered on second');
  const store2 = MC.mcLoad();
  ok(!MC.mcGame(store2, 'world').practice.includes('FRA'), 'removed from practice');
});
t('learn: wrong resets streak', () => {
  const L = new MC.Learn('us');
  L.queue = ['TX']; L.next();
  L.submit('Wrong Xyz');
  eq(L.streakOf('TX'), 0);
});

// ---- daily challenge ----
t('daily seed matches web version (30 countries)', () => {
  const web = loadWebDaily();
  eq(web.n, 175, 'web has 175 countries');
  eq(MC.DAILY_COUNTRIES.length, 175, 'port has 175 countries');
  for(const d of ['2026-10-10', '2026-10-11', '2025-01-01']){
    eq(MC.dailySet(d), web.dailySet(d), 'dailySet ' + d);
    const set = web.dailySet(d);
    for(const r of [0, 7, 29]){
      eq(MC.dailyRoundOptions(d, r, set[r]), web.roundOptions(d, r, set[r]), 'roundOptions ' + d + ' r' + r);
    }
  }
});
t('daily: full perfect run -> 30/30, locked after', () => {
  const d = new MC.Daily('2026-10-10');
  for(let i = 0; i < 30; i++){
    const cur = d.current();
    ok(cur, 'round ' + i);
    const res = d.answer(cur.correct);
    ok(res.hit, 'hit round ' + i);
    d.next();
  }
  ok(d.over && d.won, 'won');
  const s = d.finish();
  eq(s.score, 30);
  ok(s.share.includes('Daily Challenge 2026-10-10'), 'share text');
  ok(MC.dailyLocked('2026-10-10'), 'locked after finish');
});
t('daily: 3 wrong -> out of lives', () => {
  const d = new MC.Daily('2026-10-12');
  for(let i = 0; i < 3; i++){
    const cur = d.current();
    const wrong = cur.options.find(o => o !== cur.correct);
    d.answer(wrong);
    d.next();
  }
  ok(d.over && !d.won, 'lost');
  eq(d.finish().score, 0);
});

// ---- view smoke tests (canvas stub) ----
function fakeCanvas(){
  return {
    width: 375, height: 667, style: {},
    getContext: () => fakeCtx(),
    addEventListener(){},
    getBoundingClientRect: () => ({left:0, top:0, width:375, height:667})
  };
}
t('views: home/continents/results draw without throwing', () => {
  const c = fakeCanvas();
  MC.UI.init(375, 667, 1);
  MC._ctx = c.getContext('2d');
  MC.UI.go('home'); MC.render();
  MC.UI.go('continents', {modeId:'continent'}); MC.render();
  const q = new MC.Quiz('us', null);
  q.correct.add('TX'); q.missed.add('CA');
  const s = Object.assign(q.finish('done'), {});
  MC.UI.go('results', {summary:s, quiz:q}); MC.render();
});
t('views: mapquiz draw + tap routing smoke', () => {
  const c = fakeCanvas();
  MC.UI.init(375, 667, 1);
  MC._ctx = c.getContext('2d');
  MC.startQuiz('world', null);
  MC.render();
  // tap top-left (HUD area, no region) -> returns false, no throw
  MC.UI.current.onTap(5, 5);
  // scripted hit: pretend every pointInPath hits -> select first region via direct call
  const q = MC.UI.current.quiz;
  ok(q.select(q.places[0].id), 'direct select works');
  MC.render();
});
t('views: daily + dailyresults draw without throwing', () => {
  const c = fakeCanvas();
  MC.UI.init(375, 667, 1);
  MC._ctx = c.getContext('2d');
  // ensure not locked
  MC.UI.go('daily'); MC.render();
  const v = MC.UI.current;
  if(!v.lockedOut){
    const cur = v.game.current();
    v.pick(cur.correct);
    MC.render();
  }
  const d = new MC.Daily('2026-10-13');
  for(let i=0;i<30;i++){ const cur=d.current(); d.answer(cur.correct); d.next(); }
  MC.UI.go('dailyresults', {summary:d.finish()}); MC.render();
});
t('keyboard fallback resolves via prompt stub', () => {
  let got = null;
  const ttBak = global.tt;
  delete global.tt; delete global.wx;
  MC.showKeyboard({title:'t'}, v => { got = v; });
  eq(got, '', 'prompt stub returns empty');
  if(ttBak) global.tt = ttBak;
});

/* ---------- report ---------- */
console.log('\n==== TikTok package harness ====');
for(const [st, name] of results) console.log(st + '  ' + name);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
