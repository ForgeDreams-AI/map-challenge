/* ============================================================
 * 95-game.js — entry point.
 * Load order: 00-env, 10-util, data/*, 30-daily-data, 40-mapquiz,
 * 50-daily, 60-path, 70-ui, 80-views-map, 90-views-daily, 95-game.
 * ============================================================ */
'use strict';

MC.boot = function(canvas, W, H){
  MC.sdkInit();
  MC.loadAliases();
  var dpr = 1;
  try {
    var t = MC.tt();
    if(t && t.getSystemInfoSync){
      var si = t.getSystemInfoSync();
      dpr = si.pixelRatio || 1;
    } else if(typeof window !== 'undefined' && window.devicePixelRatio){
      dpr = window.devicePixelRatio;
    }
  } catch(e){}
  dpr = Math.min(dpr, 2);
  MC.resizeCanvas(canvas, W, H, dpr);
  MC.UI.init(W, H, dpr);
  MC._canvas = canvas;
  MC._ctx = MC.getContext(canvas);
  MC.UI.go('home');
  MC.sdkLoaded();
  MC.wireInput(canvas);
  MC._lastTick1s = 0;
  var loop = function(now){
    MC.frame(now);
    MC.requestFrame(loop);
  };
  MC.requestFrame(loop);
};

/* 1-second ticker: quiz countdown, toast expiry */
MC.frame = function(now){
  var s = MC.UI.current;
  if(s && s.quiz && !s.quiz.over){
    if(!MC._lastTick1s || now - MC._lastTick1s >= 1000){
      MC._lastTick1s = now;
      s.quiz.tick();
    }
  }
  if(MC.UI.dirty){
    MC.UI.dirty = false;
    MC.render();
  } else if(MC.UI.toast && MC.now() > MC.UI.toast.until){
    MC.render(); // one last paint to clear the toast
  }
};

MC.render = function(){
  var UI = MC.UI, ctx = MC._ctx;
  UI.clearTaps();
  ctx.save();
  ctx.scale(UI.dpr, UI.dpr);
  try {
    if(UI.current && UI.current.draw) UI.current.draw(ctx);
  } catch(e){
    // never let a render error brick the game
    ctx.restore();
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(0, 0, UI.W, UI.H);
    UI.text(ctx, 'Something went wrong — tap to go home.', UI.W/2, UI.H/2, 16, '#3a3129', 'center', 600, UI.W-40);
    UI.clearTaps();
    UI.addTap(0, 0, UI.W, UI.H, function(){ UI.go('home'); });
    return;
  }
  ctx.restore();
};

/* ---------- input ---------- */
MC.wireInput = function(canvas){
  var UI = MC.UI;
  var pos = function(e){
    var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {left:0, top:0};
    return {x:e.clientX - r.left, y:e.clientY - r.top};
  };
  // mouse (preview.html)
  var mouseDown = false;
  if(typeof document !== 'undefined'){
    canvas.addEventListener('mousedown', function(e){
      mouseDown = true;
      var p = pos(e), s = UI.current;
      if(s && s.touchStart) s.touchStart('m', p.x, p.y);
    });
    canvas.addEventListener('mousemove', function(e){
      if(!mouseDown) return;
      var p = pos(e), s = UI.current;
      if(s && s.touchMove) s.touchMove('m', p.x, p.y);
    });
    var mouseUp = function(e){
      if(!mouseDown) return;
      mouseDown = false;
      var p = pos(e), s = UI.current;
      if(s && s.touchEnd) s.touchEnd('m', p.x, p.y);
      else UI.tap(p.x, p.y);
    };
    canvas.addEventListener('mouseup', mouseUp);
    canvas.addEventListener('mouseleave', function(){ mouseDown = false; });
    // touch
    canvas.addEventListener('touchstart', function(e){
      e.preventDefault();
      for(var i=0;i<e.changedTouches.length;i++){
        var t = e.changedTouches[i], p = pos(t), s = UI.current;
        if(s && s.touchStart) s.touchStart(t.identifier, p.x, p.y);
      }
    }, {passive:false});
    canvas.addEventListener('touchmove', function(e){
      e.preventDefault();
      for(var i=0;i<e.changedTouches.length;i++){
        var t = e.changedTouches[i], p = pos(t), s = UI.current;
        if(s && s.touchMove) s.touchMove(t.identifier, p.x, p.y);
      }
    }, {passive:false});
    var touchEnd = function(e){
      e.preventDefault();
      for(var i=0;i<e.changedTouches.length;i++){
        var t = e.changedTouches[i], p = pos(t), s = UI.current;
        if(s && s.touchEnd) s.touchEnd(t.identifier, p.x, p.y);
        else UI.tap(p.x, p.y);
      }
    };
    canvas.addEventListener('touchend', touchEnd, {passive:false});
    canvas.addEventListener('touchcancel', touchEnd, {passive:false});
  }
  // TikTok native touch events (tt.onTouchStart etc. if exposed)
  var t = MC.tt();
  if(t && t.onTouchStart && !t.__mcWired){
    t.__mcWired = true;
    try {
      t.onTouchStart(function(res){
        (res.touches||[]).forEach(function(th){
          var s = UI.current;
          if(s && s.touchStart) s.touchStart(th.identifier, th.clientX, th.clientY);
        });
      });
      t.onTouchMove(function(res){
        (res.touches||[]).forEach(function(th){
          var s = UI.current;
          if(s && s.touchMove) s.touchMove(th.identifier, th.clientX, th.clientY);
        });
      });
      var end = function(res){
        (res.touches||[]).forEach(function(th){
          var s = UI.current;
          if(s && s.touchEnd) s.touchEnd(th.identifier, th.clientX, th.clientY);
          else UI.tap(th.clientX, th.clientY);
        });
      };
      t.onTouchEnd && t.onTouchEnd(end);
      t.onTouchCancel && t.onTouchCancel(end);
    } catch(e){}
  }
};

/* ---------- browser auto-boot (preview.html) ---------- */
if(typeof document !== 'undefined' && typeof window !== 'undefined'){
  var __mcBoot = function(){
    var canvas = document.getElementById('game');
    if(!canvas) return;
    var w = window.innerWidth, h = window.innerHeight;
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#f5f0e6';
    MC.boot(canvas, w, h);
    window.addEventListener('resize', function(){
      MC.resizeCanvas(canvas, window.innerWidth, window.innerHeight, MC.UI.dpr);
      MC.UI.init(window.innerWidth, window.innerHeight, MC.UI.dpr);
      var s = MC.UI.current;
      if(s && s.layout) s.layout();
      if(s && s.enter && MC.UI.currentName === 'mapquiz'){ /* keep state, refit */ }
      MC.UI.markDirty();
    });
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __mcBoot);
  else __mcBoot();
}
