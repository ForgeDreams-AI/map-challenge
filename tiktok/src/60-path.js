/* ============================================================
 * 60-path.js — SVG path strings -> Path2D + bounding boxes.
 * Data uses only M/L/Z commands. Strategy: try the native
 * `new Path2D(d)` first (works in browsers and most mini-game
 * runtimes); fall back to a tiny manual parser. Bounding boxes
 * are computed from the parsed coordinates (Path2D has no bbox).
 * ============================================================ */
'use strict';

/* Parse "M12.3,45.6L78,90Z..." into {cmds:[{c:'M',x,y}...], bbox} */
MC.parsePath = function(d){
  var cmds = [];
  var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  var re = /([MLZ])\s*(-?\d+(?:\.\d+)?)?(?:[,\s]+(-?\d+(?:\.\d+)?))?/gi;
  var m;
  while((m = re.exec(d))){
    var c = m[1].toUpperCase();
    if(c === 'Z'){ cmds.push({c:'Z'}); continue; }
    var x = parseFloat(m[2]), y = parseFloat(m[3]);
    if(isNaN(x) || isNaN(y)) continue;
    cmds.push({c:c, x:x, y:y});
    if(x<minX)minX=x; if(y<minY)minY=y;
    if(x>maxX)maxX=x; if(y>maxY)maxY=y;
  }
  if(!isFinite(minX)){ minX=minY=maxX=maxY=0; }
  return {cmds:cmds, bbox:{x:minX, y:minY, w:maxX-minX, h:maxY-minY}};
};

MC._pathCache = new Map();   // d-string -> {path2d, bbox}

/* Build (and cache) a Path2D for an SVG path string. */
MC.path2d = function(d){
  var hit = MC._pathCache.get(d);
  if(hit) return hit.path2d;
  var p2d = null;
  var P2D = (typeof Path2D !== 'undefined') ? Path2D : null;
  if(P2D){
    try { p2d = new P2D(d); } catch(e){ p2d = null; }
  }
  if(!p2d && P2D){
    // manual replay
    try {
      var parsed = MC.parsePath(d);
      p2d = new P2D();
      parsed.cmds.forEach(function(k){
        if(k.c==='M') p2d.moveTo(k.x,k.y);
        else if(k.c==='L') p2d.lineTo(k.x,k.y);
        else if(k.c==='Z') p2d.closePath();
      });
    } catch(e){ p2d = null; }
  }
  var parsed2 = MC.parsePath(d);
  MC._pathCache.set(d, {path2d:p2d, bbox:parsed2.bbox});
  return p2d;
};

MC.pathBBox = function(d){
  var hit = MC._pathCache.get(d);
  if(hit) return hit.bbox;
  MC.path2d(d);
  return MC._pathCache.get(d).bbox;
};

/* Enlarge tiny regions with invisible hit circles (like the web game:
 * bbox diagonal < 16 units -> circle r = max(diag/2*1.6, 8)). */
MC.SMALL_DIAG = 16;
MC.hitCircle = function(d){
  var b = MC.pathBBox(d);
  var diag = Math.hypot(b.w, b.h);
  if(diag >= MC.SMALL_DIAG) return null;
  return {x:b.x+b.w/2, y:b.y+b.h/2, r:Math.max(diag/2*1.6, 8)};
};
