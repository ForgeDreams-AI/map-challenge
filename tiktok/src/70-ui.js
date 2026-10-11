/* ============================================================
 * 70-ui.js — canvas UI framework: screen manager, tap routing,
 * buttons, text helpers. Earthy light theme (matches web).
 * ============================================================ */
'use strict';

MC.THEME = {
  bg:'#f5f0e6', card:'#fffdf8', ink:'#3a3129', muted:'#8a7a64',
  accent:'#b4663a', accentInk:'#fffaf2', blue:'#3f6b5e',
  good:'#5e8f5a', bad:'#b04a3a', line:'#e3d5bd',
  land:'#dfe3cf', landStroke:'#a9b18c', hover:'#cdd6b4',
  overlay:'rgba(58,49,41,0.45)'
};

MC.UI = {
  W: 0, H: 0, dpr: 1,
  screens: {},        // name -> {enter(data), draw(ctx), onTap(x,y), onBack()}
  current: null,
  currentName: '',
  currentData: null,
  tapRegions: [],     // [{x,y,w,h,handler}] rebuilt each frame
  toast: null,        // {text, until}
  dirty: true
};

MC.UI.init = function(w, h, dpr){
  this.W = w; this.H = h; this.dpr = dpr || 1;
  this.markDirty();
};
MC.UI.markDirty = function(){ this.dirty = true; };
MC.UI.register = function(name, screen){ this.screens[name] = screen; };
MC.UI.go = function(name, data){
  var s = this.screens[name];
  if(!s) throw new Error('unknown screen: ' + name);
  this.currentName = name;
  this.currentData = data || null;
  this.current = s;
  this.tapRegions = [];
  if(s.enter) s.enter(data);
  this.markDirty();
};
/* tap dispatch: topmost region first */
MC.UI.tap = function(x, y){
  var rs = this.tapRegions;
  for(var i = rs.length - 1; i >= 0; i--){
    var r = rs[i];
    if(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h){
      r.handler(x - r.x, y - r.y);
      return true;
    }
  }
  if(this.current && this.current.onTap) return !!this.current.onTap(x, y);
  return false;
};
MC.UI.addTap = function(x, y, w, h, handler){
  this.tapRegions.push({x:x, y:y, w:w, h:h, handler:handler});
  return this.tapRegions[this.tapRegions.length - 1];
};
MC.UI.clearTaps = function(){ this.tapRegions = []; };
MC.UI.showToast = function(text, ms){
  this.toast = {text:text, until:MC.now() + (ms || 1800)};
  this.markDirty();
};

/* ---------- drawing helpers ---------- */
MC.UI.font = function(px, weight){
  return (weight || 400) + ' ' + Math.round(px) + 'px -apple-system, "Helvetica Neue", sans-serif';
};
MC.UI.rr = function(ctx, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
};
MC.UI.text = function(ctx, str, x, y, px, color, align, weight, maxW){
  var T = MC.THEME;
  ctx.fillStyle = color || T.ink;
  ctx.font = this.font(px, weight);
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  if(maxW) ctx.fillText(str, x, y, maxW);
  else ctx.fillText(str, x, y);
};
MC.UI.wrappedLines = function(ctx, str, maxW, px, weight){
  ctx.font = this.font(px, weight);
  var words = String(str).split(/\s+/);
  var lines = [], line = '';
  words.forEach(function(wd){
    var t = line ? line + ' ' + wd : wd;
    if(ctx.measureText(t).width > maxW && line){ lines.push(line); line = wd; }
    else line = t;
  });
  if(line) lines.push(line);
  return lines;
};
/* Button: draws card-style button, registers tap. Returns rect. */
MC.UI.button = function(ctx, x, y, w, h, label, opts){
  opts = opts || {};
  var T = MC.THEME;
  var bg = opts.primary ? T.accent : (opts.good ? T.good : (opts.danger ? T.bad : T.card));
  var fg = opts.primary ? T.accentInk : (opts.good || opts.danger ? '#fff' : T.ink);
  ctx.save();
  this.rr(ctx, x, y, w, h, Math.min(14, h/2));
  ctx.fillStyle = bg; ctx.fill();
  if(!opts.primary && !opts.good && !opts.danger){
    ctx.lineWidth = 2; ctx.strokeStyle = T.line; ctx.stroke();
  }
  this.text(ctx, label, x + w/2, y + h/2, opts.px || 17, fg, 'center', 700, w - 16);
  ctx.restore();
  var rect = {x:x, y:y, w:w, h:h};
  if(!opts.noTap) this.addTap(x, y, w, h, opts.onTap || function(){});
  return rect;
};
MC.UI.header = function(ctx, title, sub){
  var T = MC.THEME, W = this.W;
  this.text(ctx, title, W/2, 44, 26, T.ink, 'center', 800);
  if(sub) this.text(ctx, sub, W/2, 72, 14, T.muted, 'center', 400, W - 40);
  return 92;
};
MC.UI.backButton = function(ctx, onTap){
  var T = MC.THEME;
  this.button(ctx, 12, 12, 64, 44, '‹ Home', {px:16, onTap:onTap});
};
MC.UI.card = function(ctx, x, y, w, h, opts){
  var T = MC.THEME;
  opts = opts || {};
  ctx.save();
  this.rr(ctx, x, y, w, h, 16);
  ctx.fillStyle = opts.bg || T.card; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = opts.stroke || T.line; ctx.stroke();
  ctx.restore();
};
MC.UI.drawToast = function(ctx){
  var t = this.toast;
  if(!t) return;
  if(MC.now() > t.until){ this.toast = null; return; }
  var T = MC.THEME;
  ctx.font = this.font(16, 600);
  var w = Math.min(this.W - 60, ctx.measureText(t.text).width + 40);
  var x = (this.W - w)/2, y = this.H - 120;
  ctx.save();
  this.rr(ctx, x, y, w, 48, 24);
  ctx.fillStyle = T.ink; ctx.fill();
  this.text(ctx, t.text, this.W/2, y + 24, 16, '#fff', 'center', 600, w - 24);
  ctx.restore();
  this.markDirty(); // keep repainting until it expires
};
