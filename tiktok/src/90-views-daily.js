/* ============================================================
 * 90-views-daily.js — Daily Challenge screens (canvas):
 * DailyView (terrain image + 4 options) and DailyResults.
 * ============================================================ */
'use strict';

MC.UI.register('daily', {
  enter: function(){
    var date = MC.todayStr();
    if(MC.dailyLocked(date)){
      this.lockedOut = true;
      this.lockScore = MC.dailyLockScore();
      return;
    }
    this.lockedOut = false;
    this.game = new MC.Daily(date);
    this.img = null; this.imgSlug = null;
    this.feedback = null;   // {hit, correctIdx, until}
    this.paused = false;
    var self = this;
    this.game.onChange = function(){ MC.UI.markDirty(); };
    this.loadCurrentImage();
  },
  loadCurrentImage: function(){
    var cur = this.game.current();
    if(!cur) return;
    var self = this;
    if(this.imgSlug === cur.slug && this.img) return;
    this.imgSlug = cur.slug;
    this.img = null;
    MC.UI.markDirty();
    MC.loadImage('assets/relief/' + cur.slug + '.jpg').then(function(im){
      if(self.imgSlug === cur.slug){ self.img = im; MC.UI.markDirty(); }
    }).catch(function(){
      // keep placeholder; game remains playable
      MC.UI.markDirty();
    });
  },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    var self = this;
    UI.backButton(ctx, function(){ UI.go('home'); });
    if(this.lockedOut){
      UI.text(ctx, '⭐ Daily Challenge', W/2, 60, 22, T.ink, 'center', 800);
      UI.text(ctx, "Today's challenge is done", W/2, 140, 17, T.muted, 'center', 600);
      UI.text(ctx, (this.lockScore == null ? '–' : this.lockScore + '/30'), W/2, 200, 44, T.accent, 'center', 800);
      UI.text(ctx, 'Come back at midnight for a new one', W/2, 250, 14, T.muted, 'center', 400);
      UI.button(ctx, 24, 300, W-48, 54, '‹ Home', {onTap:function(){ UI.go('home'); }});
      UI.drawToast(ctx);
      return;
    }
    var g = this.game;
    // HUD
    UI.text(ctx, 'Round ' + Math.min(g.round+1,30) + '/30', 16, 30, 16, T.ink, 'left', 800);
    var hearts = '';
    for(var h=0; h<3; h++) hearts += h < g.lives ? '❤️' : '🖤';
    UI.text(ctx, hearts, W/2, 30, 16, T.ink, 'center', 400);
    UI.text(ctx, '✅ ' + g.score, W - 16, 30, 16, T.ink, 'right', 800);
    UI.text(ctx, 'DAILY', W/2, 58, 13, T.muted, 'center', 700);
    // image area
    var imgTop = 78, imgH = Math.round(UI.H * 0.38);
    var cur = g.current();
    UI.card(ctx, 12, imgTop, W-24, imgH, {bg:'#fff'});
    if(this.img){
      try {
        var iw = this.img.naturalWidth || this.img.width, ih = this.img.naturalHeight || this.img.height;
        var s = Math.min((W-48)/iw, (imgH-24)/ih);
        var dw = iw*s, dh = ih*s;
        ctx.drawImage(this.img, 12 + (W-24-dw)/2, imgTop + (imgH-dh)/2, dw, dh);
      } catch(e){}
    } else {
      UI.text(ctx, 'Loading terrain…', W/2, imgTop + imgH/2, 15, T.muted, 'center', 400);
    }
    // options
    var optTop = imgTop + imgH + 14;
    var oh = 56, gap = 10;
    if(cur){
      cur.options.forEach(function(ci, i){
        var y = optTop + i * (oh + gap);
        var isFb = self.feedback && self.feedback.round === g.round;
        var label = MC.DAILY_COUNTRIES[ci].n;
        var opts = {px:17};
        if(isFb){
          if(ci === self.feedback.correctIdx){ opts.good = true; }
          else if(ci === self.feedback.picked && !self.feedback.hit){ opts.danger = true; }
        }
        UI.button(ctx, 16, y, W-32, oh, (i+1) + '. ' + label, Object.assign(opts, {
          onTap: function(){ self.pick(ci); }
        }));
      });
    }
    UI.drawToast(ctx);
  },
  pick: function(choiceIdx){
    var g = this.game;
    if(!g || g.over || g.locked || this.feedback) return;
    var res = g.answer(choiceIdx);
    if(!res) return;
    var cur = {round:g.round};
    this.feedback = {hit:res.hit, correctIdx:res.correct,
                     picked:choiceIdx, round:g.round};
    var self = this;
    MC.UI.markDirty();
    setTimeout(function(){
      self.feedback = null;
      g.next();
      if(g.over){
        var summary = g.finish();
        MC.UI.go('dailyresults', {summary:summary});
      } else {
        self.loadCurrentImage();
      }
      MC.UI.markDirty();
    }, res.hit ? 450 : 900);
  }
});

MC.UI.register('dailyresults', {
  enter: function(data){ this.summary = data.summary; },
  draw: function(ctx){
    var T = MC.THEME, UI = MC.UI, W = UI.W;
    UI.clearTaps();
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, UI.H);
    var s = this.summary, self = this;
    UI.text(ctx, s.won ? "Today's challenge" : '💀 Out of lives', W/2, 48, 22, T.ink, 'center', 800);
    UI.text(ctx, s.score + '/' + s.total, W/2, 104, 48, T.accent, 'center', 800);
    // results grid: 30 cells
    var cols = 10, cell = Math.min(30, (W - 48) / cols - 6);
    var gx = (W - (cols * (cell + 6) - 6)) / 2, gy = 150;
    s.results.forEach(function(r, i){
      var x = gx + (i % cols) * (cell + 6), y = gy + Math.floor(i / cols) * (cell + 6);
      ctx.fillStyle = r ? T.good : T.bad;
      UI.rr(ctx, x, y, cell, cell, 6);
      ctx.fill();
    });
    var ny = gy + 3 * (cell + 6) + 16;
    var note = s.replay ? 'Already played today — this run was just for fun.'
      : (s.won ? 'Saved! Come back tomorrow to keep your streak.'
               : "That counts as today's run. Come back at midnight.");
    UI.text(ctx, note, W/2, ny, 14, T.muted, 'center', 400, W - 48);
    UI.text(ctx, 'Best: ' + s.best + '/30 • Day streak: ' + s.streak, W/2, ny + 26, 14, T.muted, 'center', 600);
    var by = ny + 56;
    UI.button(ctx, 16, by, W-32, 52, '📤 Share result', {primary:true, onTap:function(){
      var r = MC.share('⭐ Daily Challenge', s.share);
      UI.showToast(r === 'tiktok' ? 'Shared!' : 'Copied to clipboard');
    }});
    UI.button(ctx, 16, by + 62, W-32, 52, '‹ All games', {onTap:function(){ UI.go('home'); }});
    UI.drawToast(ctx);
  }
});
