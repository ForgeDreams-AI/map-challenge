'use strict';
/* Map Challenge — geography quiz hub. No dependencies. */
const $ = id => document.getElementById(id);

/* ---------------- text normalization & matching ---------------- */
function normSafe(s){
  return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
    .trim();
}
function nospace(s){ return s.replace(/ /g, ''); }

/* ---------------- storage ---------------- */
const KEY = 'mapChallenge.v1';
let store = {};
function loadStore(){
  try { store = JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch(e){ store = {}; }
}
function saveStore(){
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch(e){}
}
function gameStore(id){
  if(!store[id]) store[id] = {scores:[], best:0, played:0, practice:[]};
  const g = store[id];
  if(!Array.isArray(g.scores)) g.scores = [];
  if(!Array.isArray(g.practice)) g.practice = [];
  return g;
}
function practiceAdd(gameId, pid){
  const g = gameStore(gameId);
  if(!g.practice.includes(pid)){ g.practice.push(pid); saveStore(); }
}
function practiceRemove(gameId, pid){
  const g = gameStore(gameId);
  g.practice = g.practice.filter(x => x !== pid); saveStore();
}

/* ---------------- modes & data ---------------- */
const MODES = [
  {id:'world',             title:'World Map',        kind:'world',     answer:'name',    thumb:'world'},
  {id:'world-capitals',    title:'World Capitals',   kind:'world',     answer:'capital', thumb:'world'},
  {id:'continent',         title:'Continent Map',    kind:'continent', answer:'name',    thumb:'continent'},
  {id:'continent-capitals',title:'Continent Capitals',kind:'continent',answer:'capital', thumb:'continent'},
  {id:'us',                title:'US Map',           kind:'us',        answer:'name',    thumb:'us'},
  {id:'us-capitals',       title:'US Capitals',      kind:'us',        answer:'capital', thumb:'us'},
];
const CONTINENTS = ['Africa','Asia','Europe','North America','South America','Oceania'];

// alias map: normalized alias -> canonical name (normalized at load)
let ALIASES = null;
function loadAliases(){
  ALIASES = new Map();
  const raw = Object.assign({}, (window.WORLD_DATA.a || {}), (window.US_DATA.a || {}),
    {'us':'United States', 'u s':'United States'});
  for(const k of Object.keys(raw)){
    const nk = normSafe(k);
    ALIASES.set(nk, raw[k]);
    ALIASES.set(nospace(nk), raw[k]);
  }
}
function buildPlaces(modeId, continent){
  const m = MODES.find(x => x.id === modeId);
  let places;
  if(m.kind === 'us'){
    places = window.US_DATA.s.map(s => ({id:s.i, name:s.n, capital:s.c, path:s.p}));
  } else {
    places = window.WORLD_DATA.c.map(c => ({id:c.i, name:c.n, capital:c.c, path:c.p, continent:c.k}));
    if(continent) places = places.filter(p => p.continent === continent);
    if(m.answer === 'capital') places = places.filter(p => p.capital);
  }
  return places;
}
function answerOf(p, answerKind){ return answerKind === 'capital' ? p.capital : p.name; }
function isCorrect(input, place, answerKind){
  const n = normSafe(input);
  if(!n) return false;
  const expected = normSafe(answerOf(place, answerKind));
  if(n === expected || nospace(n) === nospace(expected)) return true;
  const canon = ALIASES.get(n);
  if(!canon) return false;
  const nc = normSafe(canon);
  return nc === expected || nospace(nc) === nospace(expected);
}

/* ---------------- views ---------------- */
const VIEWS = ['view-home','view-continent','view-game','view-results','view-learn'];
function showView(id){
  VIEWS.forEach(v => $(v).classList.add('hidden'));
  $(id).classList.remove('hidden');
  $('home-btn').classList.toggle('hidden', id === 'view-home');
  window.scrollTo(0,0);
}

/* ---------------- thumbnails ---------------- */
function thumbSVG(thumb){
  const W = window.WORLD_DATA, U = window.US_DATA;
  if(thumb === 'us'){
    const paths = U.s.map(s => `<path d="${s.p}"/>`).join('');
    return `<svg viewBox="0 0 ${U.w} ${U.h}">${paths}</svg>`;
  }
  if(thumb === 'continent'){
    const all = W.c.map(c => `<path d="${c.p}"/>`).join('');
    const afr = W.c.filter(c => c.k === 'Africa')
      .map(c => `<path class="hl" d="${c.p}"/>`).join('');
    return `<svg viewBox="0 0 ${W.w} ${W.h}">${all}${afr}</svg>`;
  }
  const paths = W.c.map(c => `<path d="${c.p}"/>`).join('');
  return `<svg viewBox="0 0 ${W.w} ${W.h}">${paths}</svg>`;
}

/* ---------------- home ---------------- */
function statsLine(id){
  const g = gameStore(id);
  if(!g.played) return 'Not played yet';
  const avg = Math.round(g.scores.reduce((a,b)=>a+b,0)/g.scores.length);
  const best = g.bestTotal ? `Best ${g.bestScore}/${g.bestTotal}` : `Best ${g.best}%`;
  return `Avg ${avg}% • ${best} • ${g.played} played`;
}
function renderHome(){
  const wrap = $('cards'); wrap.innerHTML = '';
  /* Daily Challenge: separate terrain-guessing game, lives in daily-challenge/ */
  const dc = document.createElement('div');
  dc.className = 'card';
  dc.innerHTML = `<div class="thumb">${thumbSVG('world')}</div>
    <h3>Daily Challenge</h3><p class="stats">30 countries from their terrain — new every day, one shot</p>
    <div class="card-btns">
      <button class="btn primary" data-act="play">Play</button>
    </div>`;
  dc.querySelector('[data-act="play"]').addEventListener('click', () => { location.href = 'daily-challenge/'; });
  wrap.appendChild(dc);
  MODES.forEach(m => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="thumb">${thumbSVG(m.thumb)}</div>
      <h3>${m.title}</h3><p class="stats">${statsLine(m.id)}</p>
      <div class="card-btns">
        <button class="btn primary" data-act="play">Play</button>
        <button class="btn secondary" data-act="learn">📚 Learn</button>
      </div>`;
    card.querySelector('[data-act="play"]').addEventListener('click', () => onPlay(m.id));
    card.querySelector('[data-act="learn"]').addEventListener('click', () => startLearn(m.id));
    wrap.appendChild(card);
  });
}
function onPlay(modeId){
  const m = MODES.find(x => x.id === modeId);
  if(m.kind === 'continent') showContinentPicker(modeId);
  else startGame(modeId, null);
}

/* ---------------- continent picker ---------------- */
let pickerMode = null;
function showContinentPicker(modeId){
  pickerMode = modeId;
  $('continent-title').textContent =
    (modeId === 'continent-capitals' ? 'Continent Capitals' : 'Continent Map') + ' — choose a continent';
  const grid = $('continent-grid'); grid.innerHTML = '';
  CONTINENTS.forEach(c => {
    const n = window.WORLD_DATA.c.filter(x => x.k === c).length;
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.style.margin = '6px';
    b.textContent = `${c} (${n})`;
    b.addEventListener('click', () => startGame(pickerMode, c));
    grid.appendChild(b);
  });
  showView('view-continent');
}

/* ---------------- fat-finger hit areas for tiny countries ---------------- */
const HIT_MIN_PX = 16;  // minimum on-screen hit radius, px
const SMALL_DIAG = 16;  // svg units: bbox diagonal below this => tiny country
function addHitAreas(svg){
  const NS = 'http://www.w3.org/2000/svg';
  svg.querySelectorAll('path.region').forEach(p => {
    let b; try { b = p.getBBox(); } catch(e){ return; }
    const diag = Math.hypot(b.width, b.height);
    if(diag >= SMALL_DIAG) return;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'hit');
    c.setAttribute('data-id', p.getAttribute('data-id'));
    c.setAttribute('cx', (b.x + b.width/2).toFixed(1));
    c.setAttribute('cy', (b.y + b.height/2).toFixed(1));
    c.setAttribute('r', Math.max(diag/2*1.6, 8).toFixed(1));
    c.dataset.diag = diag.toFixed(1);
    svg.appendChild(c);
  });
}
function sizeHitAreas(svg){
  // keep hit circles >= HIT_MIN_PX on screen at any zoom level
  const r = svg.getBoundingClientRect();
  if(!r.width) return;
  const vb = svg.viewBox.baseVal;
  if(!vb || !vb.width) return;
  const pxPerUnit = vb.width / r.width;
  svg.querySelectorAll('circle.hit').forEach(c => {
    const diag = parseFloat(c.dataset.diag || '0');
    c.setAttribute('r', Math.max(HIT_MIN_PX * pxPerUnit, (diag/2) * 1.6).toFixed(1));
  });
}

/* ---------------- map zoom (map only — never the page) ---------------- */
const ZMAX = 12; // max zoom: enough to tap the tiniest countries
function svgPoint(svg, clientX, clientY){
  const m = svg.getScreenCTM();
  if(!m) return null;
  return new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
}
function initZoom(svg, base){
  const z = {scale:1, cx:base.x + base.w/2, cy:base.y + base.h/2, suppress:false};
  function apply(){
    const w = base.w / z.scale, h = base.h / z.scale;
    z.cx = Math.max(base.x + w/2, Math.min(base.x + base.w - w/2, z.cx));
    z.cy = Math.max(base.y + h/2, Math.min(base.y + base.h - h/2, z.cy));
    svg.setAttribute('viewBox', `${z.cx - w/2} ${z.cy - h/2} ${w} ${h}`);
    sizeHitAreas(svg);
  }
  function zoomAt(pt, factor){
    if(!pt) return;
    const ns = Math.max(1, Math.min(ZMAX, z.scale * factor));
    if(ns === z.scale) return;
    const k = z.scale / ns; // keep the pinch/dbl-tap point anchored
    z.cx = pt.x + (z.cx - pt.x) * k;
    z.cy = pt.y + (z.cy - pt.y) * k;
    z.scale = ns;
    apply();
  }
  function zoomCenter(factor){
    const r = svg.getBoundingClientRect();
    zoomAt(svgPoint(svg, r.left + r.width/2, r.top + r.height/2), factor);
  }
  function reset(){
    z.scale = 1; z.cx = base.x + base.w/2; z.cy = base.y + base.h/2; apply();
  }
  // pinch to zoom + drag to pan (single-finger drag only pans when zoomed in)
  const ptrs = new Map();
  let pinchD0 = 0, pinchS0 = 1, moved = false, pinched = false, downX = 0, downY = 0;
  let lastTapT = 0, lastTapX = 0, lastTapY = 0;
  svg.addEventListener('pointerdown', e => {
    try { svg.setPointerCapture(e.pointerId); } catch(err){}
    ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
    moved = false; pinched = false; downX = e.clientX; downY = e.clientY;
    if(ptrs.size === 2){
      const a = [...ptrs.values()];
      pinchD0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      pinchS0 = z.scale; pinched = true;
    }
  });
  svg.addEventListener('pointermove', e => {
    if(!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(ptrs.size === 2){
      const a = [...ptrs.values()];
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if(pinchD0 > 0){
        const midX = (a[0].x + a[1].x)/2, midY = (a[0].y + a[1].y)/2;
        zoomAt(svgPoint(svg, midX, midY), (pinchS0 * (d / pinchD0)) / z.scale);
      }
      moved = true;
    } else if(ptrs.size === 1 && z.scale > 1){
      if(Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8) moved = true;
      if(moved){
        const r = svg.getBoundingClientRect();
        const vbw = (base.w / z.scale), vbh = (base.h / z.scale);
        z.cx -= (e.clientX - prev.x) * (vbw / r.width);
        z.cy -= (e.clientY - prev.y) * (vbh / r.height);
        apply();
      }
    }
  });
  function endPointer(e){
    ptrs.delete(e.pointerId);
    if(ptrs.size !== 0) return;
    const now = Date.now();
    const quickSecondTap = !moved && !pinched && (now - lastTapT < 350) &&
      Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 24;
    if(quickSecondTap){
      // double-tap: zoom in on the tapped point (don't select a region)
      zoomAt(svgPoint(svg, e.clientX, e.clientY), 2.2);
      z.suppress = true; lastTapT = 0;
    } else {
      lastTapT = now; lastTapX = e.clientX; lastTapY = e.clientY;
      if(moved || pinched) z.suppress = true; // a pan/pinch is not a tap
    }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(svgPoint(svg, e.clientX, e.clientY), e.deltaY < 0 ? 1.3 : 1/1.3);
  }, {passive:false});
  svg._zoom = z;
  return {zoomCenter, reset};
}

/* ---------------- game engine ---------------- */
let G = null;
function startGame(modeId, continent){
  const m = MODES.find(x => x.id === modeId);
  const places = buildPlaces(modeId, continent);
  const byId = new Map(places.map(p => [p.id, p]));
  const vb = m.kind === 'us'
    ? `0 0 ${window.US_DATA.w} ${window.US_DATA.h}`
    : `0 0 ${window.WORLD_DATA.w} ${window.WORLD_DATA.h}`;
  const svg = $('map');
  svg.setAttribute('viewBox', vb);
  svg.innerHTML = places.map(p =>
    `<path class="region" data-id="${p.id}" d="${p.path}"><title>${escapeHtml(p.name)}</title></path>`
  ).join('');
  // addHitAreas runs after showView below (getBBox needs layout)
  G = {modeId, title:m.title + (continent ? ' — ' + continent : ''), answerKind:m.answer,
       places, byId, correct:new Set(), missed:new Set(), wrong:0,
       timeLeft:1800, timerId:null, selected:null, continent};
  const [bx, by, bw, bh] = vb.split(' ').map(Number);
  G.zoom = initZoom(svg, {x:bx, y:by, w:bw, h:bh});
  $('hud-score').textContent = `0 / ${places.length}`;
  $('hud-wrong').textContent = '❌ 0/3';
  // 10-second onboarding: one line that tells a first-timer exactly what to do
  const regionWord = m.kind === 'us' ? 'state' : 'country';
  const how = m.answer === 'capital' ? `, then type its capital` : ` to name it`;
  $('game-hint').textContent = `👆 Tap a ${regionWord}${how}`;
  $('game-hint').classList.remove('hidden');
  updateTimer();
  hideAnswer();
  showView('view-game');
  addHitAreas(svg); // needs layout for getBBox
  sizeHitAreas(svg); // svg now has real dimensions
  clearInterval(G.timerId);
  G.timerId = setInterval(tick, 1000);
}
function tick(){
  if(!G) return;
  G.timeLeft--;
  updateTimer();
  if(G.timeLeft <= 0) endGame('time');
}
function updateTimer(){
  const t = Math.max(0, G.timeLeft);
  const mm = String(Math.floor(t/60)).padStart(2,'0');
  const ss = String(t%60).padStart(2,'0');
  const el = $('hud-timer');
  el.textContent = `${mm}:${ss}`;
  el.classList.toggle('low', t <= 60);
}
function regionEls(){ return $('map').querySelectorAll('path.region'); }

$('map').addEventListener('click', e => {
  const t = e.target.closest('[data-id]');
  if(!t || !G) return;
  const id = t.getAttribute('data-id');
  if(G.correct.has(id) || G.missed.has(id)) return;
  selectRegion(id);
});
function selectRegion(id){
  G.selected = id;
  $('game-hint').classList.add('hidden'); // hint served its purpose: first tap made
  regionEls().forEach(p => p.classList.toggle('selected', p.getAttribute('data-id') === id));
  const place = G.byId.get(id);
  $('answer-q').textContent = G.answerKind === 'capital'
    ? `What is the capital of ${place.name}?`
    : (G.modeId.startsWith('us') ? 'Name this state:' : 'Name this country:');
  $('answer-input').value = '';
  hideAC('ac-list');
  $('answer-panel').classList.remove('hidden');
  setTimeout(() => $('answer-input').focus(), 50);
}
function hideAnswer(){
  $('answer-panel').classList.add('hidden');
  if(G && G.selected){
    regionEls().forEach(p => p.classList.remove('selected'));
    G.selected = null;
  }
}
function submitAnswer(){
  if(!G || !G.selected) return;
  const id = G.selected;
  const place = G.byId.get(id);
  const val = $('answer-input').value;
  if(!normSafe(val)){
    const panel = $('answer-panel');
    panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake');
    return;
  }
  if(isCorrect(val, place, G.answerKind)){
    G.correct.add(id);
    regionEls().forEach(p => {
      if(p.getAttribute('data-id') === id) p.classList.add('correct');
    });
    hideAnswer();
  } else {
    G.wrong++;
    G.missed.add(id);
    practiceAdd(G.modeId, id);
    regionEls().forEach(p => {
      if(p.getAttribute('data-id') === id) p.classList.add('missed');
    });
    $('hud-wrong').textContent = `❌ ${G.wrong}/3`;
    const panel = $('answer-panel');
    panel.classList.remove('shake'); void panel.offsetWidth; panel.classList.add('shake');
    hideAnswer();
    if(G.wrong >= 3){ endGame('lives'); return; }
  }
  $('hud-score').textContent = `${G.correct.size} / ${G.places.length}`;
  if(G.correct.size + G.missed.size >= G.places.length) endGame('done');
}
function skipSelected(){
  // Skip just closes the panel — the region stays unanswered so you can come back later.
  if(!G || !G.selected) return;
  hideAnswer();
}
function endGame(reason){
  if(!G) return;
  clearInterval(G.timerId);
  const total = G.places.length;
  G.places.forEach(p => {
    if(!G.correct.has(p.id) && !G.missed.has(p.id)) practiceAdd(G.modeId, p.id);
  });
  const score = total ? Math.round(G.correct.size/total*100) : 0;
  const gs = gameStore(G.modeId);
  gs.scores.push(score); gs.scores = gs.scores.slice(-3);
  gs.best = Math.max(gs.best, score); gs.played++;
  if(G.correct.size > (gs.bestScore || 0)){ gs.bestScore = G.correct.size; gs.bestTotal = total; }
  saveStore();
  $('res-title').textContent = G.title;
  $('res-score').textContent = `${G.correct.size}/${total}`;
  const why = reason==='lives' ? '3 wrong answers — game over!'
            : reason==='time' ? 'Time up!' : 'You named them all! 🎉';
  $('res-detail').textContent = `${why} ${score}% correct, ${G.wrong} wrong.`;
  $('res-best').textContent = `Best score: ${gs.bestScore}${gs.bestTotal ? '/' + gs.bestTotal : ''} • Best: ${gs.best}% • Games played: ${gs.played} • Last 3 avg: ${Math.round(gs.scores.reduce((a,b)=>a+b,0)/gs.scores.length)}%`;
  $('res-copied').classList.add('hidden');
  const mid = G.modeId, cont = G.continent;
  $('res-again').onclick = () => startGame(mid, cont);
  $('res-learn').onclick = () => startLearn(mid);
  showView('view-results');
  renderResultsMap(); // after showView: getBBox needs layout
  renderHome();
  G = null;
}
/* results map: green = got it, red = missed, gray = not asked (fit to asked places) */
function renderResultsMap(){
  const svg = $('res-map');
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  svg.innerHTML = G.places.map(p => {
    const cls = G.correct.has(p.id) ? 'correct' : G.missed.has(p.id) ? 'missed' : 'unasked';
    return `<path class="${cls}" d="${p.path}"><title>${escapeHtml(p.name)}</title></path>`;
  }).join('');
  svg.querySelectorAll('path').forEach(el => {
    try{
      const b = el.getBBox();
      minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
      maxX=Math.max(maxX,b.x+b.width); maxY=Math.max(maxY,b.y+b.height);
    }catch(e){}
  });
  if(!isFinite(minX)){
    svg.setAttribute('viewBox', `0 0 ${window.WORLD_DATA.w} ${window.WORLD_DATA.h}`);
    return;
  }
  const pad = Math.max(24, (maxX-minX)*0.1);
  svg.setAttribute('viewBox', `${minX-pad} ${minY-pad} ${maxX-minX+pad*2} ${maxY-minY+pad*2}`);
}
function shareResult(){
  const title = $('res-title').textContent;
  const score = $('res-score').textContent;
  const detail = $('res-detail').textContent;
  const text = `🗺️ ${title}: I scored ${score} — ${detail} Can you beat me?`;
  const done = () => $('res-copied').classList.remove('hidden');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch(e){}
  document.body.removeChild(ta);
}

/* ---------------- autocomplete ---------------- */
function attachAutocomplete(inputEl, listEl, getPool){
  let activeIdx = -1, items = [];
  function close(){ listEl.classList.add('hidden'); listEl.innerHTML=''; activeIdx=-1; items=[]; }
  inputEl.addEventListener('input', () => {
    const q = normSafe(inputEl.value);
    if(q.length < 1){ close(); return; }
    const pool = getPool();
    items = pool.filter(a => normSafe(a).includes(q))
      .sort((a,b) => {
        const na = normSafe(a), nb = normSafe(b);
        const sa = na.startsWith(q) ? 0 : 1, sb = nb.startsWith(q) ? 0 : 1;
        return sa - sb || na.localeCompare(nb);
      }).slice(0,8);
    if(!items.length){ close(); return; }
    listEl.innerHTML = items.map((a,i) =>
      `<div class="ac-item${i===0?' active':''}" data-i="${i}">${escapeHtml(a)}</div>`).join('');
    listEl.classList.remove('hidden'); activeIdx = 0;
    listEl.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        inputEl.value = items[+el.getAttribute('data-i')];
        close(); inputEl.focus();
      });
    });
  });
  inputEl.addEventListener('keydown', e => {
    if(listEl.classList.contains('hidden')) return;
    if(e.key === 'ArrowDown'){ e.preventDefault(); activeIdx = (activeIdx+1)%items.length; paint(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); activeIdx = (activeIdx-1+items.length)%items.length; paint(); }
    else if(e.key === 'Enter' && activeIdx >= 0){
      e.preventDefault(); inputEl.value = items[activeIdx]; close();
    }
    else if(e.key === 'Escape'){ close(); }
  });
  function paint(){
    listEl.querySelectorAll('.ac-item').forEach((el,i) =>
      el.classList.toggle('active', i === activeIdx));
  }
  inputEl.addEventListener('blur', () => setTimeout(close, 150));
  return {close};
}
function hideAC(id){ $(id).classList.add('hidden'); }

/* ---------------- learn mode ---------------- */
let L = null;
function startLearn(modeId){
  const m = MODES.find(x => x.id === modeId);
  const gs = gameStore(modeId);
  let ids = gs.practice.filter(id => true);
  // learn map: US modes use the US map, everything else uses the world map
  const useUS = (m.kind === 'us');
  const places = useUS
    ? window.US_DATA.s.map(s => ({id:s.i, name:s.n, capital:s.c, path:s.p}))
    : window.WORLD_DATA.c.map(c => ({id:c.i, name:c.n, capital:c.c, path:c.p}));
  const byId = new Map(places.map(p => [p.id, p]));
  ids = ids.filter(id => byId.has(id));
  if(!ids.length){
    showView('view-learn');
    $('learn-map').innerHTML = '';
    $('learn-panel').classList.add('hidden');
    $('learn-empty').classList.remove('hidden');
    $('learn-left').textContent = '0 left';
    return;
  }
  // shuffle
  for(let i = ids.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const vb = useUS ? `0 0 ${window.US_DATA.w} ${window.US_DATA.h}`
                   : `0 0 ${window.WORLD_DATA.w} ${window.WORLD_DATA.h}`;
  const svg = $('learn-map');
  svg.setAttribute('viewBox', vb);
  svg.innerHTML = places.map(p =>
    `<path class="region" data-id="${p.id}" d="${p.path}"><title>${escapeHtml(p.name)}</title></path>`
  ).join('');
  L = {modeId, title:m.title, answerKind:m.answer, queue:ids, byId,
       streaks:new Map(), current:null};
  $('learn-empty').classList.add('hidden');
  $('learn-panel').classList.remove('hidden');
  showView('view-learn');
  nextLearn();
}
function learnPaths(){ return $('learn-map').querySelectorAll('path.region'); }
function nextLearn(){
  if(!L) return;
  L.locked = false;
  if(!L.queue.length){
    learnPaths().forEach(p => p.classList.remove('target'));
    $('learn-q').textContent = '🎉 All mastered! Amazing work!';
    $('learn-input').value = ''; $('learn-input').disabled = true;
    $('learn-submit').disabled = true;
    $('learn-left').textContent = '0 left';
    $('learn-feedback').textContent = '';
    return;
  }
  $('learn-input').disabled = false;
  $('learn-submit').disabled = false;
  const id = L.queue[0];
  L.current = id;
  learnPaths().forEach(p => p.classList.toggle('target', p.getAttribute('data-id') === id));
  const place = L.byId.get(id);
  $('learn-q').textContent = L.answerKind === 'capital'
    ? `Capital of ${place.name}?`
    : ((L.modeId.startsWith('us') ? 'Which state is this?' : 'Which country is this?'));
  $('learn-input').value = '';
  hideAC('learn-ac');
  $('learn-feedback').textContent = '';
  $('learn-left').textContent = `${L.queue.length} left to master`;
  const st = L.streaks.get(id) || 0;
  $('learn-streak').textContent = `Streak ${st}/2`;
  setTimeout(() => $('learn-input').focus(), 50);
}
function learnSubmit(){
  if(!L || !L.current || L.locked) return;
  L.locked = true;
  if(!normSafe($('learn-input').value)){ L.locked = false; return; }
  const id = L.current;
  const place = L.byId.get(id);
  const ok = isCorrect($('learn-input').value, place, L.answerKind);
  const fb = $('learn-feedback');
  // rotate queue
  L.queue.push(L.queue.shift());
  if(ok){
    const st = (L.streaks.get(id) || 0) + 1;
    fb.textContent = 'Correct! 🎉'; fb.className = 'learn-feedback good';
    if(st >= 2){
      L.queue = L.queue.filter(x => x !== id);
      L.streaks.delete(id);
      practiceRemove(L.modeId, id);
      fb.textContent = `Mastered ${place.name}! 🎉`;
    } else {
      L.streaks.set(id, st);
    }
  } else {
    L.streaks.set(id, 0);
    fb.textContent = `It was "${answerOf(place, L.answerKind)}" — you'll get it next time!`;
    fb.className = 'learn-feedback bad';
  }
  setTimeout(nextLearn, ok ? 700 : 1600);
}
function learnSkip(){
  if(!L || !L.current) return;
  L.queue.push(L.queue.shift());
  L.streaks.set(L.current, 0);
  nextLearn();
}

/* ---------------- theme ---------------- */
function applyTheme(){
  const dark = !!(store.settings && store.settings.dark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('theme-btn').innerHTML = dark ? '&#9788;' : '&#9790;';
}
function toggleTheme(){
  store.settings = store.settings || {};
  store.settings.dark = !(store.settings.dark);
  saveStore(); applyTheme();
}

/* ---------------- misc ---------------- */
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ---------------- init ---------------- */
function init(){
  if(!window.WORLD_DATA || !window.US_DATA){
    document.body.innerHTML = '<p style="padding:40px;text-align:center">Map data failed to load. Please reload.</p>';
    return;
  }
  loadStore();
  loadAliases();
  applyTheme();
  renderHome();
  $('theme-btn').addEventListener('click', toggleTheme);
  $('home-btn').addEventListener('click', () => {
    if(G){ clearInterval(G.timerId); G = null; }
    L = null;
    renderHome(); showView('view-home');
  });
  $('continent-back').addEventListener('click', () => showView('view-home'));
  $('answer-submit').addEventListener('click', submitAnswer);
  $('answer-skip').addEventListener('click', skipSelected);
  // swallow the tap that ends a pan/pinch/double-tap-zoom so it never selects a region
  $('map-wrap').addEventListener('click', e => {
    const z = $('map')._zoom;
    if(z && z.suppress){ e.stopPropagation(); e.preventDefault(); z.suppress = false; }
  }, true);
  $('zoom-in').addEventListener('click', () => { if(G && G.zoom) G.zoom.zoomCenter(1.6); });
  $('zoom-out').addEventListener('click', () => { if(G && G.zoom) G.zoom.zoomCenter(1/1.6); });
  $('zoom-reset').addEventListener('click', () => { if(G && G.zoom) G.zoom.reset(); });
  $('answer-input').addEventListener('keydown', e => {
    if(e.key === 'Enter' && $('ac-list').classList.contains('hidden')) submitAnswer();
  });
  $('res-share').addEventListener('click', shareResult);
  $('res-home').addEventListener('click', () => { renderHome(); showView('view-home'); });
  $('learn-submit').addEventListener('click', learnSubmit);
  $('learn-skip').addEventListener('click', learnSkip);
  $('learn-input').addEventListener('keydown', e => {
    if(e.key === 'Enter' && $('learn-ac').classList.contains('hidden')) learnSubmit();
  });
  $('learn-clear').addEventListener('click', () => {
    if(!L) return;
    if(confirm('Clear your practice list for ' + L.title + '?')){
      gameStore(L.modeId).practice = []; saveStore();
      startLearn(L.modeId);
    }
  });
  $('learn-empty-home').addEventListener('click', () => { renderHome(); showView('view-home'); });
  attachAutocomplete($('answer-input'), $('ac-list'),
    () => (G ? [...new Set(G.places.map(p => answerOf(p, G.answerKind)))] : []));
  attachAutocomplete($('learn-input'), $('learn-ac'),
    () => (L ? [...new Set([...L.byId.values()].map(p => answerOf(p, L.answerKind)))] : []));
  showView('view-home');
}
document.addEventListener('DOMContentLoaded', init);
