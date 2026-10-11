/* ============================================================
 * 40-mapquiz.js — map quiz engine (pure logic, ported from js/app.js)
 * No DOM: state is exposed for canvas renderers + the test harness.
 * ============================================================ */
'use strict';

MC.MODES = [
  {id:'world',              title:'World Map',         kind:'world',     answer:'name'},
  {id:'world-capitals',     title:'World Capitals',    kind:'world',     answer:'capital'},
  {id:'continent',          title:'Continent Map',     kind:'continent', answer:'name'},
  {id:'continent-capitals', title:'Continent Capitals',kind:'continent', answer:'capital'},
  {id:'us',                 title:'US Map',            kind:'us',        answer:'name'},
  {id:'us-capitals',        title:'US Capitals',       kind:'us',        answer:'capital'},
];
MC.CONTINENTS = ['Africa','Asia','Europe','North America','South America','Oceania'];

/* ---------- storage (same keys as web) ---------- */
MC.MC_KEY = 'mapChallenge.v1';
MC.mcLoad = function(){ return MC.storeGetJSON(MC.MC_KEY); };
MC.mcSave = function(s){ MC.storeSetJSON(MC.MC_KEY, s); };
MC.mcGame = function(store, id){
  if(!store[id]) store[id] = {scores:[], best:0, played:0, practice:[]};
  var g = store[id];
  if(!Array.isArray(g.scores)) g.scores = [];
  if(!Array.isArray(g.practice)) g.practice = [];
  return g;
};

/* ---------- aliases ---------- */
MC._aliases = null;
MC.loadAliases = function(){
  MC._aliases = new Map();
  var raw = Object.assign({}, (globalThis.WORLD_DATA.a || {}), (globalThis.US_DATA.a || {}),
    {'us':'United States', 'u s':'United States'});
  Object.keys(raw).forEach(function(k){
    var nk = MC.normSafe(k);
    MC._aliases.set(nk, raw[k]);
    MC._aliases.set(MC.nospace(nk), raw[k]);
  });
};

/* ---------- places ---------- */
MC.buildPlaces = function(modeId, continent){
  var m = MC.MODES.find(function(x){ return x.id === modeId; });
  var places;
  if (m.kind === 'us'){
    places = globalThis.US_DATA.s.map(function(s){
      return {id:s.i, name:s.n, capital:s.c, path:s.p};
    });
  } else {
    places = globalThis.WORLD_DATA.c.map(function(c){
      return {id:c.i, name:c.n, capital:c.c, path:c.p, continent:c.k};
    });
    if (continent) places = places.filter(function(p){ return p.continent === continent; });
    if (m.answer === 'capital') places = places.filter(function(p){ return p.capital; });
  }
  return places;
};
MC.mapViewBox = function(modeId){
  var m = MC.MODES.find(function(x){ return x.id === modeId; });
  if (m.kind === 'us') return {x:0, y:0, w:globalThis.US_DATA.w, h:globalThis.US_DATA.h};
  return {x:0, y:0, w:globalThis.WORLD_DATA.w, h:globalThis.WORLD_DATA.h};
};
MC.answerOf = function(p, answerKind){
  return answerKind === 'capital' ? p.capital : p.name;
};
MC.isCorrect = function(input, place, answerKind){
  var n = MC.normSafe(input);
  if(!n) return false;
  var expected = MC.normSafe(MC.answerOf(place, answerKind));
  if(n === expected || MC.nospace(n) === MC.nospace(expected)) return true;
  var canon = MC._aliases.get(n);
  if(!canon) return false;
  var nc = MC.normSafe(canon);
  return nc === expected || MC.nospace(nc) === MC.nospace(expected);
};
MC.answerPool = function(places, answerKind){
  var set = {};
  places.forEach(function(p){ set[MC.answerOf(p, answerKind)] = 1; });
  return Object.keys(set);
};

/* ============================================================
 * Quiz — one play session.
 * Events surface via onChange callback (renderer repaints).
 * ============================================================ */
MC.Quiz = function(modeId, continent){
  var m = MC.MODES.find(function(x){ return x.id === modeId; });
  this.modeId = modeId;
  this.continent = continent || null;
  this.title = m.title + (continent ? ' — ' + continent : '');
  this.answerKind = m.answer;
  this.places = MC.buildPlaces(modeId, continent);
  this.byId = new Map(this.places.map(function(p){ return [p.id, p]; }));
  this.correct = new Set();
  this.missed = new Set();
  this.wrong = 0;
  this.timeLeft = 1800;         // 30:00 like the web game
  this.selected = null;
  this.over = false;
  this.overReason = null;
  this.onChange = null;
  this.lastResult = null;       // {ok, placeId} of most recent submit
};
MC.Quiz.prototype._emit = function(){ if(this.onChange) this.onChange(this); };
MC.Quiz.prototype.select = function(id){
  if(this.over || !this.byId.has(id)) return false;
  if(this.correct.has(id) || this.missed.has(id)) return false;
  this.selected = id;
  this.lastResult = null;
  this._emit();
  return true;
};
MC.Quiz.prototype.deselect = function(){
  this.selected = null;
  this._emit();
};
MC.Quiz.prototype.promptFor = function(id){
  var place = this.byId.get(id);
  if(!place) return '';
  if(this.answerKind === 'capital') return 'What is the capital of ' + place.name + '?';
  return this.modeId.indexOf('us') === 0 ? 'Name this state:' : 'Name this country:';
};
MC.Quiz.prototype.submit = function(text){
  if(this.over || !this.selected) return null;
  var id = this.selected;
  var place = this.byId.get(id);
  if(!MC.normSafe(text)) return {empty:true};
  var ok = MC.isCorrect(text, place, this.answerKind);
  if(ok){
    this.correct.add(id);
    this.lastResult = {ok:true, placeId:id};
  } else {
    this.wrong++;
    this.missed.add(id);
    MC.practiceAdd(this.modeId, id);
    this.lastResult = {ok:false, placeId:id, expected:MC.answerOf(place, this.answerKind)};
  }
  this.selected = null;
  if(this.wrong >= 3){ this.finish('lives'); }
  else if(this.correct.size + this.missed.size >= this.places.length){ this.finish('done'); }
  this._emit();
  return this.lastResult;
};
MC.Quiz.prototype.tick = function(){
  if(this.over) return;
  this.timeLeft--;
  if(this.timeLeft <= 0) this.finish('time');
  this._emit();
};
MC.Quiz.prototype.scoreText = function(){
  return this.correct.size + ' / ' + this.places.length;
};
MC.Quiz.prototype.finish = function(reason){
  if(this.over) return null;
  this.over = true;
  this.overReason = reason;
  var total = this.places.length;
  var store = MC.mcLoad();
  // unanswered places go to the practice list (same as web)
  var self = this;
  this.places.forEach(function(p){
    if(!self.correct.has(p.id) && !self.missed.has(p.id)) MC.practiceAdd(self.modeId, p.id);
  });
  var score = total ? Math.round(this.correct.size/total*100) : 0;
  var gs = MC.mcGame(store, this.modeId);
  gs.scores.push(score); gs.scores = gs.scores.slice(-3);
  gs.best = Math.max(gs.best, score); gs.played++;
  if(this.correct.size > (gs.bestScore || 0)){ gs.bestScore = this.correct.size; gs.bestTotal = total; }
  MC.mcSave(store);
  var why = reason==='lives' ? '3 wrong answers — game over!'
          : reason==='time' ? 'Time up!'
          : reason==='quit' ? 'Ended early.'
          : 'You named them all!';
  var avg = gs.scores.length ? Math.round(gs.scores.reduce(function(a,b){return a+b;},0)/gs.scores.length) : 0;
  this.summary = {
    reason: reason, why: why, score: score,
    correct: this.correct.size, total: total, wrong: this.wrong,
    best: 'Best score: ' + (gs.bestScore||0) + (gs.bestTotal ? '/' + gs.bestTotal : '') +
          ' • Best: ' + gs.best + '% • Played: ' + gs.played + ' • Last 3 avg: ' + avg + '%'
  };
  return this.summary;
};

/* practice list helpers (shared with Learn) */
MC.practiceAdd = function(gameId, pid){
  var store = MC.mcLoad();
  var g = MC.mcGame(store, gameId);
  if(g.practice.indexOf(pid) === -1){ g.practice.push(pid); MC.mcSave(store); }
};
MC.practiceRemove = function(gameId, pid){
  var store = MC.mcLoad();
  var g = MC.mcGame(store, gameId);
  g.practice = g.practice.filter(function(x){ return x !== pid; });
  MC.mcSave(store);
};

/* ============================================================
 * Learn — drill the practice list until 2-in-a-row correct.
 * ============================================================ */
MC.Learn = function(modeId){
  var m = MC.MODES.find(function(x){ return x.id === modeId; });
  this.modeId = modeId;
  this.title = m.title;
  this.answerKind = m.answer;
  var useUS = (m.kind === 'us');
  var places = useUS
    ? globalThis.US_DATA.s.map(function(s){ return {id:s.i, name:s.n, capital:s.c, path:s.p}; })
    : globalThis.WORLD_DATA.c.map(function(c){ return {id:c.i, name:c.n, capital:c.c, path:c.p}; });
  this.byId = new Map(places.map(function(p){ return [p.id, p]; }));
  var store = MC.mcLoad();
  var gs = MC.mcGame(store, modeId);
  var ids = gs.practice.filter(function(id){ return this.byId.has(id); }, this);
  // shuffle
  for(var i=ids.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=ids[i];ids[i]=ids[j];ids[j]=t;
  }
  this.places = places;
  this.queue = ids;
  this.streaks = new Map();
  this.current = null;
  this.locked = false;
  this.onChange = null;
  this.feedback = '';
  this.feedbackOk = false;
};
MC.Learn.prototype._emit = function(){ if(this.onChange) this.onChange(this); };
MC.Learn.prototype.promptFor = function(){
  if(!this.current) return '';
  var place = this.byId.get(this.current);
  if(this.answerKind === 'capital') return 'Capital of ' + place.name + '?';
  return this.modeId.indexOf('us') === 0 ? 'Which state is this?' : 'Which country is this?';
};
MC.Learn.prototype.next = function(){
  this.locked = false;
  this.current = this.queue.length ? this.queue[0] : null;
  this.feedback = '';
  this._emit();
};
MC.Learn.prototype.streakOf = function(id){ return this.streaks.get(id) || 0; };
MC.Learn.prototype.submit = function(text){
  if(!this.current || this.locked) return null;
  if(!MC.normSafe(text)) return {empty:true};
  this.locked = true;
  var id = this.current;
  var place = this.byId.get(id);
  var ok = MC.isCorrect(text, place, this.answerKind);
  // rotate queue
  this.queue.push(this.queue.shift());
  var res;
  if(ok){
    var st = (this.streaks.get(id) || 0) + 1;
    if(st >= 2){
      this.queue = this.queue.filter(function(x){ return x !== id; });
      this.streaks.delete(id);
      MC.practiceRemove(this.modeId, id);
      res = {ok:true, mastered:true, name:place.name};
      this.feedback = 'Mastered ' + place.name + '!';
    } else {
      this.streaks.set(id, st);
      res = {ok:true, mastered:false};
      this.feedback = 'Correct!';
    }
    this.feedbackOk = true;
  } else {
    this.streaks.set(id, 0);
    res = {ok:false, expected:MC.answerOf(place, this.answerKind)};
    this.feedback = 'It was "' + MC.answerOf(place, this.answerKind) + '"';
    this.feedbackOk = false;
  }
  this._emit();
  return res;
};
MC.Learn.prototype.skip = function(){
  if(!this.current) return;
  this.queue.push(this.queue.shift());
  this.streaks.set(this.current, 0);
  this.next();
};
MC.Learn.prototype.clearList = function(){
  var store = MC.mcLoad();
  MC.mcGame(store, this.modeId).practice = [];
  MC.mcSave(store);
  this.queue = [];
  this.current = null;
  this._emit();
};
