/* ============================================================
 * 00-env.js — environment abstraction + TikTok Mini Games SDK glue
 *
 * Runs in three environments:
 *   1. TikTok mini-game native runtime (canvas 2D, no DOM).
 *      Uses TTMinis.game (namespaces TTMinis / tt / wx are interchangeable).
 *   2. Plain mobile/desktop browser (preview.html) — full DOM available.
 *   3. node (test harness) — stubbed canvas/TTMinis.
 *
 * Every TikTok SDK call is guarded so the game degrades gracefully.
 * ============================================================ */
'use strict';

var MC = (typeof MC !== 'undefined') ? MC : {};

/* ---------- SDK handles (guarded) ---------- */
MC.hasTTMinis = function(){
  return (typeof TTMinis !== 'undefined') && TTMinis && TTMinis.game;
};
MC.tt = function(){
  if (typeof tt !== 'undefined') return tt;
  if (typeof wx !== 'undefined') return wx;
  return null;
};

/* ---------- SDK lifecycle ---------- */
MC.sdkInit = function(){
  if (MC.hasTTMinis()){
    try {
      // __CLIENT_KEY__ is replaced at packaging time (see README).
      TTMinis.game.init({ clientKey: '__CLIENT_KEY__' });
    } catch(e){ /* init failure must never kill the game */ }
  }
};
MC.sdkLoaded = function(){
  if (MC.hasTTMinis()){
    try { TTMinis.game.setLoadingProgress({ progress: 1 }); } catch(e){}
  }
};

/* ---------- canvas ---------- */
MC.createCanvas = function(){
  var t = MC.tt();
  if (t && t.createCanvas){
    try { return t.createCanvas(); } catch(e){}
  }
  if (typeof document !== 'undefined'){
    var c = document.createElement('canvas');
    document.body.appendChild(c);
    return c;
  }
  throw new Error('no canvas available');
};
MC.getContext = function(canvas){
  // TikTok: canvas.getContext('2d'). Browser/node: same call.
  return canvas.getContext('2d');
};
MC.resizeCanvas = function(canvas, w, h, dpr){
  dpr = dpr || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (canvas.style){
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  return dpr;
};

/* ---------- images ---------- */
MC.loadImage = function(src){
  var t = MC.tt();
  return new Promise(function(resolve, reject){
    var done = function(im){ resolve(im); };
    var fail = function(e){ reject(e || new Error('img load failed: ' + src)); };
    try {
      if (t && t.createImage){
        var im = t.createImage();
        im.onload = function(){ done(im); };
        im.onerror = fail;
        im.src = src;
      } else if (typeof Image !== 'undefined'){
        var im2 = new Image();
        im2.onload = function(){ done(im2); };
        im2.onerror = fail;
        im2.src = src;
      } else {
        fail(new Error('no image loader'));
      }
    } catch(e){ fail(e); }
  });
};

/* ---------- storage (tt -> localStorage -> memory) ---------- */
MC._memStore = {};
MC.storageGet = function(key){
  var t = MC.tt();
  try {
    if (t && t.getStorageSync) return t.getStorageSync(key) || null;
  } catch(e){}
  try {
    if (typeof localStorage !== 'undefined'){
      var v = localStorage.getItem(key);
      return v == null ? null : v;
    }
  } catch(e){}
  return (key in MC._memStore) ? MC._memStore[key] : null;
};
MC.storageSet = function(key, value){
  var t = MC.tt();
  try {
    if (t && t.setStorageSync){ t.setStorageSync(key, value); return; }
  } catch(e){}
  try {
    if (typeof localStorage !== 'undefined'){ localStorage.setItem(key, value); return; }
  } catch(e){}
  MC._memStore[key] = value;
};
MC.storageRemove = function(key){
  var t = MC.tt();
  try { if (t && t.removeStorageSync){ t.removeStorageSync(key); return; } } catch(e){}
  try { if (typeof localStorage !== 'undefined'){ localStorage.removeItem(key); return; } } catch(e){}
  delete MC._memStore[key];
};

/* ---------- keyboard (typed answers) ----------
 * TikTok: tt.showKeyboard. Browser/node fallback: prompt().
 * onDone(text) — text may be '' if cancelled. */
MC.showKeyboard = function(opts, onDone){
  opts = opts || {};
  var t = MC.tt();
  var finished = false;
  var done = function(text){ if(!finished){ finished = true; onDone(text || ''); } };
  try {
    if (t && t.showKeyboard){
      var onConfirm = function(res){ cleanup(); done(res && res.value); };
      var onCancel = function(){ cleanup(); done(''); };
      var cleanup = function(){
        try { t.offKeyboardConfirm && t.offKeyboardConfirm(onConfirm); } catch(e){}
        try { t.offKeyboardCancel && t.offKeyboardCancel(onCancel); } catch(e){}
        try { t.hideKeyboard && t.hideKeyboard(); } catch(e){}
      };
      t.onKeyboardConfirm && t.onKeyboardConfirm(onConfirm);
      t.onKeyboardCancel && t.onKeyboardCancel(onCancel);
      t.showKeyboard({
        defaultValue: opts.defaultValue || '',
        maxLength: opts.maxLength || 40,
        confirmHold: false,
        confirmType: 'done'
      });
      return;
    }
  } catch(e){}
  // fallback: prompt()
  try {
    if (typeof prompt !== 'undefined'){
      var v = prompt(opts.title || 'Your answer:', opts.defaultValue || '');
      done(v == null ? '' : v);
      return;
    }
  } catch(e){}
  done('');
};

/* ---------- share (stub-friendly) ---------- */
MC.share = function(title, text){
  var t = MC.tt();
  try {
    if (t && t.shareAppMessage){
      t.shareAppMessage({ title: title, desc: text });
      return 'tiktok';
    }
  } catch(e){}
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(title + ' — ' + text);
      return 'clipboard';
    }
  } catch(e){}
  return 'none';
};

/* ---------- login / payment: STUBS for TikTok review ----------
 * TikTok review requires login + payment integration points to exist.
 * These are intentionally minimal stubs; wire real tt.login / tt.requestPayment
 * before submitting (see README). */
MC.login = function(){
  // STUB: resolve a local guest identity. Replace with tt.login before review.
  return Promise.resolve({ guest: true, nick: 'Guest' });
};
MC.pay = function(){
  // STUB: no purchasables in this game. Replace with tt.requestPayment before review.
  return Promise.reject(new Error('payments not configured'));
};

/* ---------- frame loop ---------- */
MC.requestFrame = function(fn){
  if (typeof requestAnimationFrame !== 'undefined') return requestAnimationFrame(fn);
  return setTimeout(function(){ fn(Date.now()); }, 16);
};
MC.now = function(){
  if (typeof performance !== 'undefined' && performance.now) return performance.now();
  return Date.now();
};
