/* ============================================================
 * 50-daily.js — Daily Challenge engine (ported from
 * daily-challenge/index.html). Same seeds => same 30 countries
 * and same options as the web game, every day.
 * ============================================================ */
'use strict';

MC.dailySet = function(dateStr){
  var rand = MC.mulberry32(MC.xmur3('dailyatlas|' + dateStr)());
  var idx = MC.DAILY_COUNTRIES.map(function(_, i){ return i; });
  return MC.seededShuffle(idx, rand).slice(0, 30);
};
MC.dailyRoundOptions = function(dateStr, round, correctIdx){
  var rand = MC.mulberry32(MC.xmur3('dailyatlas|' + dateStr + '|r' + round)());
  var set = {}; set[correctIdx] = 1;
  var n = 1;
  while(n < 4){
    var c = Math.floor(rand() * MC.DAILY_COUNTRIES.length);
    if(!set[c]){ set[c] = 1; n++; }
  }
  return MC.seededShuffle(Object.keys(set).map(Number), rand);
};
MC.dailyShareText = function(dateStr, results){
  var score = results.filter(Boolean).length;
  var grid = '';
  results.forEach(function(r, i){
    grid += r ? '🟩' : '🟥';
    if((i+1) % 10 === 0 && i < results.length - 1) grid += '\n';
  });
  return 'Daily Challenge ' + dateStr + '\n' + score + '/' + results.length + '\n' + grid;
};

/* ---------- stats (same keys as web) ---------- */
MC.DAILY_LS = 'dailyatlas.v1';
MC.dailyLoadStats = function(){ return MC.storeGetJSON(MC.DAILY_LS); };
MC.dailySaveStats = function(s){ MC.storeSetJSON(MC.DAILY_LS, s); };
MC.dailyRecord = function(dateStr, score, completed){
  var s = MC.dailyLoadStats();
  if(s.lastPlayed === dateStr) return {replay:true, best:s.best||0, streak:s.streak||0};
  var streak = (s.lastPlayed === MC.yesterdayStr()) ? (s.streak||0)+1 : 1;
  var best = (completed === false) ? (s.best||0) : Math.max(s.best||0, score);
  var ns = {best:best, streak:streak, lastPlayed:dateStr};
  MC.dailySaveStats(ns);
  return {replay:false, best:ns.best, streak:ns.streak};
};
MC.DAILY_DLS = 'dailyatlas.lastDaily';
MC.DAILY_DSS = 'dailyatlas.lastDailyScore';
MC.dailyLocked = function(dateStr){
  return MC.storageGet(MC.DAILY_DLS) === dateStr;
};
MC.dailyLockScore = function(){
  var v = MC.storageGet(MC.DAILY_DSS);
  return v == null ? null : Number(v);
};

/* ============================================================
 * Daily — one daily run. Renderer drives: current() -> {image, options},
 * answer(i), state for HUD, finish() -> summary.
 * ============================================================ */
MC.Daily = function(dateStr){
  this.date = dateStr || MC.todayStr();
  this.set = MC.dailySet(this.date);
  this.round = 0;
  this.score = 0;
  this.results = [];      // booleans per finished round
  this.lives = 3;
  this.locked = false;    // input lock during feedback pause
  this.over = false;
  this.won = true;
  this.onChange = null;
};
MC.Daily.prototype._emit = function(){ if(this.onChange) this.onChange(this); };
MC.Daily.prototype.current = function(){
  if(this.over || this.round >= 30) return null;
  var correct = this.set[this.round];
  return {
    round: this.round,
    correct: correct,
    name: MC.DAILY_COUNTRIES[correct].n,
    slug: MC.DAILY_COUNTRIES[correct].slug,
    options: MC.dailyRoundOptions(this.date, this.round, correct)
  };
};
MC.Daily.prototype.answer = function(choiceIdx){
  if(this.over || this.locked) return null;
  var cur = this.current();
  if(!cur) return null;
  this.locked = true;
  var hit = (choiceIdx === cur.correct);
  this.results.push(hit);
  if(hit) this.score++;
  else this.lives = Math.max(0, this.lives - 1);
  var res = {hit:hit, correct:cur.correct, lives:this.lives, score:this.score};
  if(this.lives <= 0){ this.won = false; }
  else if(this.results.length >= 30){ this.won = true; }
  this._emit();
  return res;
};
/* advance after the feedback pause */
MC.Daily.prototype.next = function(){
  this.locked = false;
  this.round++;
  if(this.lives <= 0 || this.round >= 30){ this.finish(); }
  this._emit();
};
MC.Daily.prototype.finish = function(){
  if(this.over) return this.summary;
  this.over = true;
  var rec = MC.dailyRecord(this.date, this.score, this.won);
  MC.storageSet(MC.DAILY_DLS, this.date);
  MC.storageSet(MC.DAILY_DSS, String(this.score));
  this.summary = {
    won: this.won,
    score: this.score,
    total: this.results.length,
    results: this.results.slice(),
    replay: rec.replay,
    best: rec.best,
    streak: rec.streak,
    share: MC.dailyShareText(this.date, this.results)
  };
  this._emit();
  return this.summary;
};
