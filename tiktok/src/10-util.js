/* ============================================================
 * 10-util.js — pure utilities (ported verbatim from web versions)
 * ============================================================ */
'use strict';

MC.xmur3 = function(str){
  for(var i=0,h=1779033703^str.length;i<str.length;i++){
    h=Math.imul(h^str.charCodeAt(i),3432918353);
    h=h<<13|h>>>19;
  }
  return function(){
    h=Math.imul(h^h>>>16,2246822507);
    h=Math.imul(h^h>>>13,3266489909);
    return (h^=h>>>16)>>>0;
  };
};
MC.mulberry32 = function(a){
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
};
MC.seededShuffle = function(arr,rand){
  var a=arr.slice();
  for(var i=a.length-1;i>0;i--){
    var j=Math.floor(rand()*(i+1));
    var t=a[i];a[i]=a[j];a[j]=t;
  }
  return a;
};
MC.todayStr = function(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
MC.yesterdayStr = function(){
  var y=new Date(); y.setDate(y.getDate()-1);
  return MC.todayStr(y);
};
MC.normSafe = function(s){
  return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
    .trim();
};
MC.nospace = function(s){ return s.replace(/ /g, ''); };
MC.clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };

/* JSON storage helpers over MC.storageGet/Set */
MC.storeGetJSON = function(key){
  try { return JSON.parse(MC.storageGet(key)) || {}; }
  catch(e){ return {}; }
};
MC.storeSetJSON = function(key, obj){
  try { MC.storageSet(key, JSON.stringify(obj)); } catch(e){}
};
