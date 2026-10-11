/* ============================================================
 * 80-views-map.js — canvas screens for the 6 map quiz modes:
 * Home, ContinentPicker, MapQuiz, Learn, Results.
 * ============================================================ */
'use strict';

/* ---------------- shared map renderer ---------------- */
MC.MapRenderer = function(places){
  this.places = places;
  this.byId = new Map(places.map(function(p){ return [p.id, p]; }));
  // precompute Path2D + bbox + hit circles
  var self = this;
  places.forEach(function(p){
    p._p2d = MC.path2d(p.path);
    p._bbox = MC.pathBBox(p.path);
    p._hit = MC.hitCircle(p.path);
  });
  // camera
  this.cam = {z:1, cx:0, cy:0};   // zoom + world center
  this.base = null;               // {x,y,w,h} viewBox
  this.area = null;               // {x,y,w,h} screen rect
};
MC.MapRenderer.prototype.fit = function(vb, area){
  this.base = vb; this.area = area;
  var s = Math.min(area.w / vb.w, area.h / vb.h);
  this.fitScale = s;
  this.cam.z = 1;
  this.cam.cx = vb.x + vb.w/2;
  this.cam.cy = vb.y + vb.h/2;
};
MC.MapRenderer.prototype.worldToScreen = function(wx, wy){
  var s = this.fitScale * this.cam.z;
  return {
    x: this.area.x + this.area.w/2 + (wx - this.cam.cx) * s,
    y: this.area.y + this.area.h/2 + (wy - this.cam.cy) * s
  };
};
MC.MapRenderer.prototype.screenToWorld = function(sx, sy){
  var s = this.fitScale * this.cam.z;
  return {
    x: this.cam.cx + (sx - (this.area.x + this.area.w/2)) / s,
    y: this.cam.cy + (sy - (this.area.y + this.area.h/2)) / s
  };
};
MC.MapRenderer.prototype.zoomAt = function(sx, sy, factor){
  var before = this.screenToWorld(sx, sy);
  this.cam.z = MC.clamp(this.cam.z * factor, 1, 12);
  var s = this.fitScale * this.cam.z;
  // keep the anchored point under the finger
  this.cam.cx = before.x - (sx - (this.area.x + this.area.w/2)) / s;
  this.cam.cy = before.y - (sy - (this.area.y + this.area.h/2)) / s;
  this.clampCam();
  MC.UI.markDirty();
};
MC.MapRenderer.prototype.clampCam = function(){
  var b = this.base, z = this.cam.z;
  var w = b.w / z, h = b.h / z;
  this.cam.cx = MC.clamp(this.cam.cx, b.x + w/2, b.x + b.w - w/2);
  this.cam.cy = MC.clamp(this.cam.cy, b.y + h/2, b.y + b.h - h/2);
};
MC.MapRenderer.prototype.panBy = function(dxPx, dyPx){
  if(this.cam.z <= 1) return;
  var s = this.fitScale * this.cam.z;
  this.cam.cx -= dxPx / s;
  this.cam.cy -= dyPx / s;
  this.clampCam();
  MC.UI.markDirty();
};
MC.MapRenderer.prototype.draw = function(ctx, stateOf){
  var T = MC.THEME, self = this;
  var s = this.fitScale * this.cam.z;
  ctx.save();
  // clip to map area
  ctx.beginPath();
  ctx.rect(this.area.x, this.area.y, this.area.w, this.area.h);
  ctx.clip();
  // background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(this.area.x, this.area.y, this.area.w, this.area.h);
  ctx.lineWidth = Math.max(1, 1.5 / Math.sqrt(this.cam.z));
  this.places.forEach(function(p){
    if(!p._p2d) return;
    var st = stateOf ? stateOf(p) : 'default';
    ctx.save();
    // transform: draw in world coords via setTransform
    ctx.setTransform(
      MC.UI.dpr * s, 0, 0, MC.UI.dpr * s,
      MC.UI.dpr * (self.area.x + self.area.w/2 - self.cam.cx * s),
      MC.UI.dpr * (self.area.y + self.area.h/2 - self.cam.cy * s)
    );
    var fill = T.land, stroke = T.landStroke, lw = 1.2 / s;
    if(st === 'correct'){ fill = T.good; stroke = '#3f6b3a'; }
    else if(st === 'missed'){ fill = T.bad; stroke = '#7e3226'; }
    else if(st === 'target'){ fill = T.accent; stroke = '#7e4526'; }
    else if(st === 'selected'){ fill = T.hover; stroke = T.blue; lw = 3 / s; }
    else if(st === 'unasked'){ fill = '#e8e2d2'; stroke = T.landStroke; }
    ctx.fillStyle = fill;
    ctx.fill(p._p2d);
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke(p._p2d);
    ctx.restore();
  });
  ctx.restore();
};
/* hit test in screen coords -> place id (topmost = last in data order) */
MC.MapRenderer.prototype.hitTest = function(ctx, sx, sy){
  if(sx < this.area.x || sx > this.area.x + this.area.w ||
     sy < this.area.y || sy > this.area.y + this.area.h) return null;
  var wpt = this.screenToWorld(sx, sy);
  for(var i = this.places.length - 1; i >= 0; i--){
    var p = this.places[i];
    if(p._hit){
      var dx = wpt.x - p._hit.x, dy = wpt.y - p._hit.y;
      if(dx*dx + dy*dy <= p._hit.r * p._hit.r) return p.id;
    } else if(p._p2d && ctx.isPointInPath(p._p2d, wpt.x, wpt.y)){
      return p.id;
    }
  }
  return null;
};

/* ---------------- gesture helper for map screens ---------------- */
MC.MapGestures = function(renderer, view){
  this.r = renderer; this.view = view;
  this.ptrs = new Map();
  this.moved = false; this.pinched = false;
  this.lastTapT = 0; this.lastTapX = 0; this.lastTapY = 0;
  this.downX = 0; this.downY = 0;
  this.pinchD0 = 0;
  this.suppressTap = false;
};
MC.MapGestures.prototype.down = function(id, x, y){
  this.ptrs.set(id, {x:x, y:y});
  this.moved = false; this.pinched = false;
  this.downX = x; this.downY = y;
  if(this.ptrs.size === 2){
    var a = Array.from(this.ptrs.values());
    this.pinchD0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    this.pinched = true;
  }
};
MC.MapGestures.prototype.move = function(id, x, y){
  if(!this.ptrs.has(id)) return;
  var prev = this.ptrs.get(id);
  this.ptrs.set(id, {x:x, y:y});
  if(this.ptrs.size === 2){
    var a = Array.from(this.ptrs.values());
    var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    if(this.pinchD0 > 0 && d > 0){
      var mx = (a[0].x + a[1].x)/2, my = (a[0].y + a[1].y)/2;
      this.r.zoomAt(mx, my, d / this.pinchD0);
      this.pinchD0 = d;
    }
    this.moved = true;
  } else if(this.ptrs.size === 1){
    if(Math.abs(x - this.downX) + Math.abs(y - this.downY) > 10) this.moved = true;
    if(this.moved) this.r.panBy(x - prev.x, y - prev.y);
  }
};
MC.MapGestures.prototype.up = function(id, x, y){
  this.ptrs.delete(id);
  if(this.ptrs.size !== 0) return 'none';
  var now = MC.now();
  if(this.moved || this.pinched){ this.suppressTap = true; return 'pan'; }
  var dt = now - this.lastTapT;
  var dist = Math.hypot(x - this.lastTapX, y - this.lastTapY);
  if(dt < 350 && dist < 28){
    // double-tap: zoom in, never selects
    this.r.zoomAt(x, y, 2.2);
    this.lastTapT = 0;
    this.suppressTap = true;
    return 'zoom';
  }
  this.lastTapT = now; this.lastTapX = x; this.lastTapY = y;
  return 'tap';
};

/* ---------------- HOME ---------------- */
MC.UI.register('home', {
  enter: function(){
    this.store = MC.mcLoad();
    this.cards = [{id:'daily', title:'Daily Challenge', sub:'30 countries from terrain — new every day', accent:true}];
    var self = this;
    MC.MODES.forEach(function(m){
      self.cards.push({id:m.id, title:m.title, sub:MC.homeStatsLine(self.store, m.id)});
    });
  },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    UI.header(ctx, '🗺️ Map Challenge', 'How well do you know the world?');
    var pad = 14, cols = 2, cw = (W - pad*(cols+1)) / cols, ch = 148;
    var self = this;
    this.cards.forEach(function(c, i){
      var col = i % cols, row = Math.floor(i / cols);
      var x = pad + col * (cw + pad), y = 104 + row * (ch + pad);
      UI.card(ctx, x, y, cw, ch, c.accent ? {stroke:T.accent, bg:'#fff8f0'} : {});
      UI.text(ctx, c.accent ? '⭐' : '🌍', x + cw/2, y + 30, 30, T.ink, 'center');
      UI.text(ctx, c.title, x + cw/2, y + 66, 17, T.ink, 'center', 800, cw - 16);
      var lines = UI.wrappedLines(ctx, c.sub, cw - 20, 12.5);
      lines.slice(0, 2).forEach(function(ln, li){
        UI.text(ctx, ln, x + cw/2, y + 94 + li*17, 12.5, T.muted, 'center');
      });
      UI.button(ctx, x + 14, y + ch - 46, cw - 28, 36, 'Play', {
        primary: !!c.accent, px: 15,
        onTap: function(){ self.play(c.id); }
      });
    });
    // learn buttons row for the 6 modes
    UI.text(ctx, 'Practice a mode:',  W/2, 104 + Math.ceil(this.cards.length/cols)*(ch+pad) + 6, 14, T.muted, 'center', 700);
    var ly = 104 + Math.ceil(this.cards.length/cols)*(ch+pad) + 26;
    var bw = (W - pad*4) / 3;
    var modes = MC.MODES;
    for(var r = 0; r < 2; r++){
      for(var c = 0; c < 3; c++){
        var m = modes[r*3 + c];
        (function(mm){
          UI.button(ctx, pad + c*(bw+pad), ly + r*48, bw, 40, '📚 ' + mm.title.replace(' Map','').replace(' Capitals',' Ⓒ'), {
            px: 13, onTap: function(){ MC.startLearn(mm.id); }
          });
        })(m);
      }
    }
    UI.drawToast(ctx);
  },
  play: function(id){
    if(id === 'daily'){ MC.UI.go('daily'); return; }
    var m = MC.MODES.find(function(x){ return x.id === id; });
    if(m.kind === 'continent') MC.UI.go('continents', {modeId:id});
    else MC.startQuiz(id, null);
  }
});
MC.homeStatsLine = function(store, id){
  var g = store[id];
  if(!g || !g.played) return 'Not played yet';
  var avg = Math.round(g.scores.reduce(function(a,b){return a+b;},0) / g.scores.length);
  var best = g.bestTotal ? ('Best ' + g.bestScore + '/' + g.bestTotal) : ('Best ' + g.best + '%');
  return 'Avg ' + avg + '% • ' + best + ' • ' + g.played + ' played';
};

/* ---------------- CONTINENT PICKER ---------------- */
MC.UI.register('continents', {
  enter: function(data){ this.modeId = data.modeId; },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    var m = MC.MODES.find(function(x){ return x.id === this.modeId; }, this);
    UI.header(ctx, m.title, 'Choose a continent');
    var self = this;
    MC.CONTINENTS.forEach(function(c, i){
      var n = globalThis.WORLD_DATA.c.filter(function(x){ return x.k === c; }).length;
      UI.button(ctx, 24, 120 + i*64, W - 48, 52, c + ' (' + n + ')', {
        px: 17, onTap: function(){ MC.startQuiz(self.modeId, c); }
      });
    });
    UI.backButton(ctx, function(){ UI.go('home'); });
    UI.drawToast(ctx);
  }
});

/* ---------------- MAP QUIZ ---------------- */
MC.startQuiz = function(modeId, continent){
  MC.loadAliases();
  var q = new MC.Quiz(modeId, continent);
  q.onChange = function(){ MC.UI.markDirty(); };
  MC.UI.go('mapquiz', {quiz:q});
};
MC.UI.register('mapquiz', {
  enter: function(data){
    this.quiz = data.quiz;
    this.renderer = new MC.MapRenderer(this.quiz.places);
    this.gest = new MC.MapGestures(this.renderer, this);
    this.pendingAnswer = '';
    this.sheetH = 210;
    var vb = MC.mapViewBox(this.quiz.modeId);
    this.vb = vb;
    this.layout();
    var self = this;
    this.quiz.onChange = function(){
      if(self.quiz.lastResult){
        var r = self.quiz.lastResult;
        MC.UI.showToast(r.ok ? 'Correct! 🎉' : 'Missed — it was ' + (self.quiz.byId.get(r.placeId) ? MC.answerOf(self.quiz.byId.get(r.placeId), self.quiz.answerKind) : ''), 1400);
        self.quiz.lastResult = null;
      }
      if(self.quiz.over && self.quiz.summary){
        var summary = self.quiz.summary;
        self.quiz.summary = null; // deliver once
        MC.UI.go('results', {summary:summary, quiz:self.quiz});
        return;
      }
      MC.UI.markDirty();
    };
  },
  layout: function(){
    var UI = MC.UI;
    var mapTop = 108, mapH = UI.H - mapTop - this.sheetH - 8;
    this.mapArea = {x:8, y:mapTop, w:UI.W - 16, h:mapH};
    this.renderer.fit(this.vb, this.mapArea);
  },
  stateOf: function(p){
    var q = this.quiz;
    if(q.correct.has(p.id)) return 'correct';
    if(q.missed.has(p.id)) return 'missed';
    if(q.selected === p.id) return 'selected';
    return 'default';
  },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    this._ctx = ctx;
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    var q = this.quiz;
    // HUD
    var t = Math.max(0, q.timeLeft);
    var mm = String(Math.floor(t/60)).padStart(2,'0'), ss = String(t%60).padStart(2,'0');
    UI.text(ctx, q.scoreText(), 16, 30, 17, T.ink, 'left', 800);
    UI.text(ctx, mm + ':' + ss, W/2, 30, 17, t <= 60 ? T.bad : T.ink, 'center', 800);
    UI.text(ctx, '❌ ' + q.wrong + '/3', W - 16, 30, 17, T.ink, 'right', 800);
    UI.text(ctx, q.title, W/2, 62, 15, T.muted, 'center', 600, W - 32);
    // map
    var self = this;
    ctx.save();
    UI.rr(ctx, this.mapArea.x, this.mapArea.y, this.mapArea.w, this.mapArea.h, 14);
    ctx.clip();
    this.renderer.draw(ctx, function(p){ return self.stateOf(p); });
    ctx.restore();
    ctx.save();
    UI.rr(ctx, this.mapArea.x, this.mapArea.y, this.mapArea.w, this.mapArea.h, 14);
    ctx.lineWidth = 2; ctx.strokeStyle = T.line; ctx.stroke();
    ctx.restore();
    // zoom buttons
    UI.button(ctx, this.mapArea.x + 8, this.mapArea.y + 8, 44, 40, '+', {px:22, onTap:function(){
      var a = self.mapArea; self.renderer.zoomAt(a.x + a.w/2, a.y + a.h/2, 1.6);
    }});
    UI.button(ctx, this.mapArea.x + 8, this.mapArea.y + 56, 44, 40, '−', {px:22, onTap:function(){
      var a = self.mapArea; self.renderer.zoomAt(a.x + a.w/2, a.y + a.h/2, 1/1.6);
    }});
    // answer sheet
    this.drawSheet(ctx);
    UI.drawToast(ctx);
  },
  drawSheet: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    var y = UI.H - this.sheetH;
    ctx.fillStyle = T.card;
    ctx.fillRect(0, y, W, this.sheetH);
    ctx.fillStyle = T.line; ctx.fillRect(0, y, W, 2);
    var q = this.quiz, self = this;
    if(q.selected){
      var place = q.byId.get(q.selected);
      UI.text(ctx, q.promptFor(q.selected), W/2, y + 30, 16, T.ink, 'center', 700, W - 32);
      // fake input field
      var fw = W - 120;
      UI.card(ctx, 16, y + 52, fw, 52, {bg:'#fff'});
      var shown = this.pendingAnswer || 'Tap to type…';
      UI.text(ctx, shown, 30, y + 78, 17, this.pendingAnswer ? T.ink : T.muted, 'left', 400, fw - 24);
      UI.addTap(16, y + 52, fw, 52, function(){ self.openKeyboard(); });
      UI.button(ctx, W - 92, y + 52, 76, 52, '⌨️', {primary:true, px:20, onTap:function(){ self.openKeyboard(); }});
      UI.button(ctx, 16, y + 116, (W-40)/2, 52, 'Submit', {good:true, onTap:function(){ self.submit(); }});
      UI.button(ctx, 24 + (W-40)/2, y + 116, (W-40)/2, 52, 'Skip', {onTap:function(){ q.deselect(); self.pendingAnswer=''; }});
    } else {
      UI.text(ctx, 'Tap a ' + (q.modeId.indexOf('us')===0 ? 'state' : 'country') + ' on the map', W/2, y + 60, 16, T.muted, 'center', 600);
      UI.text(ctx, 'Pinch or double-tap to zoom', W/2, y + 88, 13, T.muted, 'center', 400);
      UI.button(ctx, 16, y + 116, W - 32, 52, '✕ End game', {onTap:function(){
        var s = q.finish('quit'); MC.UI.go('results', {summary:s, quiz:q});
      }});
    }
  },
  openKeyboard: function(){
    var self = this;
    MC.showKeyboard({title:this.quiz.promptFor(this.quiz.selected), defaultValue:this.pendingAnswer}, function(text){
      self.pendingAnswer = text;
      MC.UI.markDirty();
    });
  },
  submit: function(){
    var r = this.quiz.submit(this.pendingAnswer);
    this.pendingAnswer = '';
    if(r && r.empty) MC.UI.showToast('Type an answer first');
  },
  onTap: function(x, y){
    // map taps (sheet taps are regions, handled first)
    var id = this.renderer.hitTest(this._ctx, x, y);
    if(id){
      if(this.gest.suppressTap){ this.gest.suppressTap = false; return true; }
      this.pendingAnswer = '';
      this.quiz.select(id);
      return true;
    }
    return false;
  },
  // touch plumbing (wired by game.js)
  touchStart: function(id, x, y){ this.gest.down(id, x, y); },
  touchMove: function(id, x, y){ this.gest.move(id, x, y); },
  touchEnd: function(id, x, y){
    var kind = this.gest.up(id, x, y);
    if(kind === 'tap') MC.UI.tap(x, y);
  }
});

/* ---------------- LEARN ---------------- */
MC.startLearn = function(modeId){
  MC.loadAliases();
  var l = new MC.Learn(modeId);
  l.onChange = function(){ MC.UI.markDirty(); };
  MC.UI.go('learn', {learn:l});
  l.next();
};
MC.UI.register('learn', {
  enter: function(data){
    this.learn = data.learn;
    this.renderer = new MC.MapRenderer(this.learn.places);
    this.gest = new MC.MapGestures(this.renderer, this);
    this.pendingAnswer = '';
    this.sheetH = 230;
    var vb = MC.mapViewBox(this.learn.modeId);
    this.vb = vb;
    this.confirmClear = false;
    this.layout();
    var self = this;
    this.learn.onChange = function(){ MC.UI.markDirty(); };
  },
  layout: function(){
    var UI = MC.UI;
    var mapTop = 108, mapH = UI.H - mapTop - this.sheetH - 8;
    this.mapArea = {x:8, y:mapTop, w:UI.W - 16, h:mapH};
    this.renderer.fit(this.vb, this.mapArea);
  },
  stateOf: function(p){
    if(this.learn.current === p.id) return 'target';
    return 'default';
  },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    var L = this.learn;
    UI.text(ctx, '📚 ' + L.title, W/2, 34, 20, T.ink, 'center', 800, W - 120);
    UI.text(ctx, L.queue.length + ' left to master', W/2, 62, 14, T.muted, 'center', 600);
    var self = this;
    ctx.save();
    UI.rr(ctx, this.mapArea.x, this.mapArea.y, this.mapArea.w, this.mapArea.h, 14);
    ctx.clip();
    this.renderer.draw(ctx, function(p){ return self.stateOf(p); });
    ctx.restore();
    ctx.save();
    UI.rr(ctx, this.mapArea.x, this.mapArea.y, this.mapArea.w, this.mapArea.h, 14);
    ctx.lineWidth = 2; ctx.strokeStyle = T.line; ctx.stroke();
    ctx.restore();
    this.drawSheet(ctx);
    UI.drawToast(ctx);
  },
  drawSheet: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    var y = UI.H - this.sheetH;
    ctx.fillStyle = T.card; ctx.fillRect(0, y, W, this.sheetH);
    ctx.fillStyle = T.line; ctx.fillRect(0, y, W, 2);
    var L = this.learn, self = this;
    if(!L.queue.length && !L.current){
      UI.text(ctx, '🎉 All mastered! Amazing work!', W/2, y + 60, 17, T.good, 'center', 700, W-32);
      UI.button(ctx, 16, y + 110, W-32, 52, '‹ Home', {onTap:function(){ UI.go('home'); }});
      return;
    }
    if(L.current){
      var st = L.streakOf(L.current);
      UI.text(ctx, L.promptFor(), W/2, y + 28, 16, T.ink, 'center', 700, W - 32);
      UI.text(ctx, 'Streak ' + st + '/2', W/2, y + 52, 13, T.muted, 'center', 600);
      var fw = W - 120;
      UI.card(ctx, 16, y + 66, fw, 52, {bg:'#fff'});
      UI.text(ctx, this.pendingAnswer || 'Tap to type…', 30, y + 92, 17, this.pendingAnswer ? T.ink : T.muted, 'left', 400, fw - 24);
      UI.addTap(16, y + 66, fw, 52, function(){ self.openKeyboard(); });
      UI.button(ctx, W - 92, y + 66, 76, 52, '⌨️', {primary:true, px:20, onTap:function(){ self.openKeyboard(); }});
      UI.button(ctx, 16, y + 130, (W-40)/2, 52, 'Submit', {good:true, onTap:function(){ self.submit(); }});
      UI.button(ctx, 24 + (W-40)/2, y + 130, (W-40)/2, 52, 'Skip', {onTap:function(){ L.skip(); self.pendingAnswer=''; }});
      if(L.feedback) UI.text(ctx, L.feedback, W/2, y + 196, 14, L.feedbackOk ? T.good : T.bad, 'center', 600, W-32);
    }
    UI.button(ctx, 16, UI.H - 44, 130, 36, this.confirmClear ? 'Tap again!' : 'Clear list', {px:13,
      onTap:function(){
        if(self.confirmClear){ L.clearList(); self.confirmClear=false; }
        else { self.confirmClear=true; setTimeout(function(){ self.confirmClear=false; MC.UI.markDirty(); }, 2500); }
      }});
    UI.button(ctx, W - 90, UI.H - 44, 74, 36, 'Home', {px:13, onTap:function(){ UI.go('home'); }});
  },
  openKeyboard: function(){
    var self = this;
    MC.showKeyboard({title:this.learn.promptFor(), defaultValue:this.pendingAnswer}, function(text){
      self.pendingAnswer = text;
      MC.UI.markDirty();
    });
  },
  submit: function(){
    var L = this.learn;
    var r = L.submit(this.pendingAnswer);
    this.pendingAnswer = '';
    if(r && r.empty) return;
    var self = this;
    setTimeout(function(){ L.next(); }, (r && r.ok) ? 700 : 1600);
  },
  onTap: function(){ return false; },
  touchStart: function(id, x, y){ this.gest.down(id, x, y); },
  touchMove: function(id, x, y){ this.gest.move(id, x, y); },
  touchEnd: function(id, x, y){
    var kind = this.gest.up(id, x, y);
    if(kind === 'tap') MC.UI.tap(x, y);
  }
});

/* ---------------- RESULTS ---------------- */
MC.UI.register('results', {
  enter: function(data){
    this.summary = data.summary;
    this.quiz = data.quiz;
    this.renderer = new MC.MapRenderer(this.quiz.places);
    var vb = MC.mapViewBox(this.quiz.modeId);
    // fit results map into a small area; compute below in draw (needs W)
    this.vb = vb;
    // camera: fit all asked places
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    var self = this;
    this.quiz.places.forEach(function(p){
      if(self.quiz.correct.has(p.id) || self.quiz.missed.has(p.id)){
        var b = p._bbox;
        minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
        maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
      }
    });
    if(!isFinite(minX)){ this.fitVB = vb; }
    else {
      var pad = Math.max(24, (maxX-minX)*0.1);
      this.fitVB = {x:minX-pad, y:minY-pad, w:maxX-minX+pad*2, h:maxY-minY+pad*2};
    }
  },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    var s = this.summary, q = this.quiz, self = this;
    UI.text(ctx, q.title, W/2, 40, 21, T.ink, 'center', 800, W-32);
    UI.text(ctx, s.correct + '/' + s.total, W/2, 96, 52, T.accent, 'center', 800);
    UI.text(ctx, s.why + ' ' + s.score + '% correct, ' + s.wrong + ' wrong.', W/2, 134, 14, T.muted, 'center', 400, W-48);
    // results map
    var my = 158, mh = 200;
    this.renderer.fit(this.fitVB, {x:16, y:my, w:W-32, h:mh});
    ctx.save();
    UI.rr(ctx, 16, my, W-32, mh, 14); ctx.clip();
    this.renderer.draw(ctx, function(p){
      if(q.correct.has(p.id)) return 'correct';
      if(q.missed.has(p.id)) return 'missed';
      return 'unasked';
    });
    ctx.restore();
    ctx.save();
    UI.rr(ctx, 16, my, W-32, mh, 14);
    ctx.lineWidth = 2; ctx.strokeStyle = T.line; ctx.stroke();
    ctx.restore();
    UI.text(ctx, s.best, W/2, my + mh + 24, 13, T.muted, 'center', 400, W-48);
    var by = my + mh + 52, bw = (W - 48)/2;
    UI.button(ctx, 16, by, bw, 52, '↻ Play again', {primary:true, onTap:function(){ MC.startQuiz(q.modeId, q.continent || null); }});
    UI.button(ctx, 24 + bw, by, bw, 52, '📚 Learn', {onTap:function(){ MC.startLearn(q.modeId); }});
    UI.button(ctx, 16, by + 62, bw, 52, '📤 Share', {onTap:function(){
      var r = MC.share('🗺️ ' + q.title, 'I scored ' + s.correct + '/' + s.total + ' — ' + s.why);
      UI.showToast(r === 'tiktok' ? 'Shared!' : 'Copied to clipboard');
    }});
    UI.button(ctx, 24 + bw, by + 62, bw, 52, '‹ Home', {onTap:function(){ UI.go('home'); }});
    UI.drawToast(ctx);
  }
});
