/*!
Project: shorts-player-kit
File:    js/debug_panel.js
Role:    Collapsible debug UI (status/controls/goto/voices+flags/rate) pinned to bottom
Depends: window.__player (optional), window.__ttsFlags (optional), window.__ttsVoiceMap (optional),
         window.__ttsUtils (optional), window.__ttsRuntime (optional), window.__dbgConfig (optional)
Notes:
  - Self-mounts #debug-panel if missing.
  - Always pins bottom with inline fixed positioning (no CSS dependency).
  - iOS防御: voiceschanged / ttsvoicesready / visibilitychange で再描画。
  - 既定ボイス・フラグは debug_config.js に集約（LS > config > Auto の優先で適用）。
  - フェーズ1: 内部の論理分割（view/actions/state/tts）を関数粒度で整理（単一ファイル維持）。
*/

;(function() {
  'use strict';

  /* ============================= view ============================= */
  var host = document.getElementById('debug-panel');
  if (!host) { host = document.createElement('div'); host.id = 'debug-panel'; document.body.appendChild(host); }

  var IN = (window.__dbgConfig || {});
  var VOICE_CFG = IN.voice || {};
  var CFG = {
    collapsedDefault: (typeof IN.collapsedDefault === 'boolean') ? IN.collapsedDefault : false,
    sections: Object.assign({ status:true, note:false, controls:true, goto:true, ttsFlags:true, voices:true, baseRate:false }, (IN.sections||{})),
    buttons:  Object.assign({ prev:true, next:true, play:true, stop:true, restart:true, goto:true }, (IN.buttons||{})),
    locks:    Object.assign({ allowTTSFlagEdit:true, allowVoiceSelect:true }, (IN.locks||{})),
    rate:     Object.assign({ min:0.5, max:2.0, step:0.1 }, (IN.rate||{})),
    rolesRate:Object.assign({ min:0.5, max:2.0, step:0.1, defaultAbs:1.4 }, (IN.rolesRate||{})),
    ttsFlagsDefault: (IN.ttsFlagsDefault || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true }),
    persist: Object.assign({
      panelCollapsedKey:'dbg.panel.collapsed.v3',
      ttsFlagsKey:'dbg.tts.flags.v4',
      roleRatesKey:'dbg.tts.role.v3',
      voiceTagKey:'dbg.voice.tag',
      voiceTitleKeyKey:'dbg.voice.titleKey',
      voiceTitleKey:'dbg.voice.title',
      voiceNarrKey:'dbg.voice.narr'
    }, (IN.persist||{})),
    voiceDefaults: Object.assign({ tag:null, titleKey:null, title:null, narr:null }, (VOICE_CFG.defaults||{})),
    voiceHints:    Object.assign({ tag:[], titleKey:[], title:[], narr:[] }, (VOICE_CFG.hints||{})),
    voiceFilter: { jaOnly: (VOICE_CFG.filter && typeof VOICE_CFG.filter.jaOnly==='boolean') ? !!VOICE_CFG.filter.jaOnly : true }
  };

  var LS_KEY = CFG.persist.panelCollapsedKey;
  var LS_RATE_KEY = 'dbg.tts.rate';
  var LS_ROLE_KEYS = { tag:'dbg.tts.role.tag', titleKey:'dbg.tts.role.titleKey', title:'dbg.tts.role.title', narr:'dbg.tts.role.narr' };
  var LS_VOICE_KEYS = { tag:CFG.persist.voiceTagKey, titleKey:CFG.persist.voiceTitleKeyKey, title:CFG.persist.voiceTitleKey, narr:CFG.persist.voiceNarrKey };

  function rootStyle(el){
    el.style.position='fixed'; el.style.left='0'; el.style.right='0'; el.style.bottom='0'; el.style.zIndex='2147483647';
    el.style.pointerEvents='auto'; el.style.fontFamily='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    el.style.color='#fff'; el.style.boxSizing='border-box';
    el.style.paddingLeft='env(safe-area-inset-left,0px)'; el.style.paddingRight='env(safe-area-inset-right,0px)';
  }
  function styleBtn(b){ b.style.appearance='none'; b.style.border='1px solid var(--b, rgba(255,255,255,.35))';
    b.style.background='var(--bg, rgba(255,255,255,.08))'; b.style.color='#fff'; b.style.borderRadius='6px'; b.style.cursor='pointer';
    b.style.fontSize='12px'; b.style.lineHeight='1'; b.style.padding='0 10px'; b.style.height='34px'; b.style.minHeight='34px'; }
  function styleField(el,minW){ el.style.border='1px solid rgba(255,255,255,.25)'; el.style.background='rgba(0,0,0,.20)'; el.style.color='#fff';
    el.style.borderRadius='6px'; el.style.fontSize='12px'; el.style.lineHeight='1.1'; el.style.padding='0 8px'; el.style.height='34px'; el.style.minHeight='34px';
    if(minW) el.style.minWidth=minW; }
  function styleCheck(c){ c.style.width='16px'; c.style.height='16px'; c.style.minHeight='0'; c.style.verticalAlign='middle'; }

  rootStyle(host);
  host.innerHTML =
    '<div class="dbg-bar" style="display:flex;align-items:center;gap:8px;'+
    'padding:6px 8px;background:rgba(0,0,0,.82);border-top:1px solid rgba(255,255,255,.15);backdrop-filter:blur(4px);">'+
    '<button id="dbg-toggle" title="展開/折り畳み" style="--b:rgba(255,255,255,.35);--bg:rgba(255,255,255,.10);">🐞 Debug <span id="dbg-arrow"></span></button>'+
    '<span id="dbg-status" style="font-size:12px;opacity:.95">Ready.</span>'+
    '</div>'+
    '<div id="dbg-body" style="max-height:46vh;overflow:auto;padding:8px;background:rgba(0,0,0,.70);border-top:1px solid rgba(255,255,255,.15);padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));">'+
    '<div id="dbg-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'+
    '<button data-act="prev">⟵ Prev</button>'+
    '<button data-act="play" style="--b:rgba(0,200,255,.55);--bg:rgba(0,200,255,.18);">▶︎ Play</button>'+
    '<button data-act="stop" style="--b:rgba(255,120,120,.55);--bg:rgba(255,120,120,.18);">■ Stop</button>'+
    '<button data-act="next">Next ⟶</button>'+
    '<button data-act="restart">↻ Restart</button>'+
    '<label class="goto" style="display:inline-flex;align-items:center;gap:6px;margin-left:6px;">'+
    '<span style="font-size:12px;opacity:.9;">Goto:</span>'+
    '<input id="dbg-goto" type="number" min="1" step="1" inputmode="numeric" placeholder="page#" style="width:72px;">'+
    '<button data-act="goto">Go</button>'+
    '</label>'+
    '</div>'+
    // baseRate (off by default)
    (CFG.sections.baseRate?('<div id="dbg-rate" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'+
      '<span style="opacity:.85;font-size:12px;">Rate:</span>'+
      '<input id="rateRange" type="range" style="width:200px;height:28px;">'+
      '<input id="rateNum" type="number" style="width:70px;">'+
    '</div>'):'')+
    '<div id="dbg-roles" style="display:flex;flex-direction:column;gap:10px;margin:6px 0;">'+
    '<div style="display:flex;align-items:center;gap:8px;"><span style="opacity:.85;font-size:12px;">Role Rate ×</span></div>'+
    '<div class="role-line" data-role="tag" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">Tag</span>'+
    '<input id="mulTagR" type="range" style="width:200px;height:28px;">'+
    '<input id="mulTagN" type="number" style="width:70px;">'+
    '</div>'+
    '<div class="role-line" data-role="titleKey" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">TitleKey</span>'+
    '<input id="mulTKR" type="range" style="width:200px;height:28px;">'+
    '<input id="mulTKN" type="number" style="width:70px;">'+
    '</div>'+
    '<div class="role-line" data-role="title" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">Title</span>'+
    '<input id="mulTR" type="range" style="width:200px;height:28px;">'+
    '<input id="mulTN" type="number" style="width:70px;">'+
    '</div>'+
    '<div class="role-line" data-role="narr" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">Narr</span>'+
    '<input id="mulNR" type="range" style="width:200px;height:28px;">'+
    '<input id="mulNN" type="number" style="width:70px;">'+
    '<button id="mulReset" title="Reset role rates" style="--b:rgba(255,255,255,.35);--bg:rgba(255,255,255,.10);margin-left:8px;">Reset</button>'+
    '</div>'+
    '</div>'+
    '<div id="dbg-voices" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0 2px 0;">'+
    '<span style="opacity:.85;font-size:12px;">Voice:</span>'+
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;"><input id="vck-tag" type="checkbox" checked><span>Tag</span><select id="v-tag"></select></label>'+
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;"><input id="vck-titleKey" type="checkbox" checked><span>TitleKey</span><select id="v-titleKey"></select></label>'+
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;"><input id="vck-title" type="checkbox" checked><span>Title</span><select id="v-title"></select></label>'+
    '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;"><input id="vck-narr" type="checkbox" checked><span>Narr</span><select id="v-narr"></select></label>'+
    '<button id="v-refresh" title="Reload voices">↺</button>'+
    '<span id="v-count" style="opacity:.7;font-size:12px;"></span>'+
    '</div>'+
    '</div>';

  function $(s){ return host.querySelector(s); }
  var bar=$('.dbg-bar'), body=$('#dbg-body'), tgl=$('#dbg-toggle'), arrow=$('#dbg-arrow');
  var statusEl=$('#dbg-status'), gotoInp=$('#dbg-goto');
  var rateRange=$('#rateRange'), rateNum=$('#rateNum');
  var mulTagR=$('#mulTagR'), mulTagN=$('#mulTagN');
  var mulTKR=$('#mulTKR'), mulTKN=$('#mulTKN');
  var mulTR=$('#mulTR'),  mulTN=$('#mulTN');
  var mulNR=$('#mulNR'),  mulNN=$('#mulNN');
  var mulReset=$('#mulReset');
  var vTag=$('#v-tag'), vTK=$('#v-titleKey'), vT=$('#v-title'), vN=$('#v-narr'), vRef=$('#v-refresh'), vCount=$('#v-count');
  var ckTag=$('#vck-tag'), ckTK=$('#vck-titleKey'), ckT=$('#vck-title'), ckN=$('#vck-narr');

  // 初期UI細部
  (function initUI(){
    var collapsed = (function(){
      if (typeof IN.collapsedDefault==='boolean') return !!IN.collapsedDefault;
      try{ var s=localStorage.getItem(LS_KEY); if(s!=null) return (s==='true'); }catch(_){}
      return false;
    })();
    if (arrow) arrow.textContent = collapsed ? '▸':'▾';
    if (body)  body.style.display = collapsed ? 'none':'block';
    if (gotoInp) styleField(gotoInp,'72px');
    Array.prototype.forEach.call(host.querySelectorAll('#dbg-controls button, #v-refresh, #mulReset, #dbg-toggle'), styleBtn);
    [vTag,vTK,vT,vN].forEach(function(sel){ if(sel){ styleField(sel,'110px'); sel.style.padding='0 6px'; } });
    ['#mulTagN','#mulTKN','#mulTN','#mulNN'].forEach(function(sel){ var el=host.querySelector(sel); if(el) styleField(el,'70px'); });
    [ckTag,ckTK,ckT,ckN].forEach(function(c){ if(c) styleCheck(c); });

    if (tgl) tgl.addEventListener('click', function(){ // collapse toggle
      var now = (body && body.style.display!=='none');
      if (body) body.style.display = now ? 'none':'block';
      if (arrow) arrow.textContent = now ? '▸':'▾';
      try{ localStorage.setItem(LS_KEY, String(!now)); }catch(_){}
    });
  })();

  // Hard Reload ボタン（DOM構築後に挿入）
  (function addHardReloadBtn(){
    var c=document.getElementById('dbg-controls'); if(!c) return;
    var b=document.createElement('button'); b.setAttribute('data-act','hardreload'); b.textContent='⟲ Hard Reload'; c.appendChild(b);
    try{ styleBtn(b); }catch(_){}
  })();

  /* ============================= state ============================= */
  function F(){ if(!window.__ttsFlags) window.__ttsFlags = Object.assign({}, CFG.ttsFlagsDefault); return window.__ttsFlags; }
  function loadFlags(){ try{ var s=localStorage.getItem(CFG.persist.ttsFlagsKey); if(s){ var o=JSON.parse(s); if(o&&typeof o==='object') Object.assign(F(),o); } }catch(_){ } }
  function saveFlags(){ try{ localStorage.setItem(CFG.persist.ttsFlagsKey, JSON.stringify(F())); }catch(_){ } }
  function pushFlags(){ var f=F(); if(ckTag) ckTag.checked=!!f.readTag; if(ckTK) ckTK.checked=!!f.readTitleKey; if(ckT) ckT.checked=!!f.readTitle; if(ckN) ckN.checked=!!f.readNarr;
    if(!CFG.locks.allowTTSFlagEdit){ [ckTag,ckTK,ckT,ckN].forEach(function(x){ if(x) x.disabled=true; }); } }
  function pullFlags(){ var f=F(); if(ckTag) f.readTag=!!ckTag.checked; if(ckTK) f.readTitleKey=!!ckTK.checked; if(ckT) f.readTitle=!!ckT.checked; if(ckN) f.readNarr=!!ckN.checked; saveFlags(); }
  loadFlags(); [ckTag,ckTK,ckT,ckN].forEach(function(x){ if(x && CFG.locks.allowTTSFlagEdit){ x.addEventListener('change', pullFlags); }}); pushFlags();

  // rate / role rates / voices（値の計算やLS同期は従来と同等の簡約版）
  function clamp(v,min,max){ v=Number(v); if(!isFinite(v)) return min; return Math.max(min, Math.min(max, v)); }
  if (CFG.sections.baseRate){
    var MIN=CFG.rate.min, MAX=CFG.rate.max, STEP=CFG.rate.step;
    if (rateRange){ rateRange.min=MIN; rateRange.max=MAX; rateRange.step=STEP; }
    if (rateNum){   rateNum.min=MIN;   rateNum.max=MAX;   rateNum.step=STEP;   }
    function applyRate(v,persist){ var r=clamp(v,MIN,MAX); if(rateRange) rateRange.value=String(r); if(rateNum) rateNum.value=String(r);
      try{ (window.__ttsUtils && __ttsUtils.setRate) && __ttsUtils.setRate(r); }catch(_){} if(persist){ try{ localStorage.setItem(LS_RATE_KEY,String(r)); }catch(_){ } } }
    (function(){ var v=1.2; try{ var s=localStorage.getItem(LS_RATE_KEY); if(s!=null) v=Number(s);}catch(_){}
      applyRate(v,false); if(rateRange){ rateRange.addEventListener('input', function(){ applyRate(rateRange.value,false); });
                                        rateRange.addEventListener('change',function(){ applyRate(rateRange.value,true ); }); }
      if(rateNum){ rateNum.addEventListener('input', function(){ applyRate(rateNum.value,false); });
                   rateNum.addEventListener('change',function(){ applyRate(rateNum.value,true ); }); }
    })();
  }

  function clampAbs(v){ return clamp(v, CFG.rolesRate.min, CFG.rolesRate.max) }
  function readRoleFromLS(){ var out={ tag:1.4, titleKey:1.4, title:1.4, narr:1.4 }; try{ Object.keys(LS_ROLE_KEYS).forEach(function(k){ var s=localStorage.getItem(LS_ROLE_KEYS[k]); if(s!=null) out[k]=clampAbs(s); }); }catch(_){}
    return out; }
  function saveRoleToLS(map){ try{ Object.keys(map).forEach(function(k){ localStorage.setItem(LS_ROLE_KEYS[k], String(clampAbs(map[k]))); }); }catch(_){ } }
  function applyRoleUI(m){ if(mulTagR) mulTagR.value=String(m.tag); if(mulTagN) mulTagN.value=String(m.tag);
    if(mulTKR) mulTKR.value=String(m.titleKey); if(mulTKN) mulTKN.value=String(m.titleKey);
    if(mulTR) mulTR.value=String(m.title); if(mulTN) mulTN.value=String(m.title);
    if(mulNR) mulNR.value=String(m.narr); if(mulNN) mulNN.value=String(m.narr); }
  function runtimeSetRole(m){ try{ if(window.__ttsRuntime && __ttsRuntime.setRoleMultipliers) __ttsRuntime.setRoleMultipliers(m);
    else if(window.__ttsUtils && __ttsUtils.setRateRole) __ttsUtils.setRateRole(m); }catch(_){ } }
  function applyRole(m,persist){ var v={ tag:clampAbs(m.tag||CFG.rolesRate.defaultAbs), titleKey:clampAbs(m.titleKey||CFG.rolesRate.defaultAbs), title:clampAbs(m.title||CFG.rolesRate.defaultAbs), narr:clampAbs(m.narr||CFG.rolesRate.defaultAbs) };
    applyRoleUI(v); runtimeSetRole(v); if(persist) saveRoleToLS(v); }
  ;(function initRole(){ var def={ tag:CFG.rolesRate.defaultAbs, titleKey:CFG.rolesRate.defaultAbs, title:CFG.rolesRate.defaultAbs, narr:CFG.rolesRate.defaultAbs };
    var cur=Object.assign(def, readRoleFromLS()); applyRole(cur,false);
    function bindPair(r,n){ if(!r||!n) return; r.addEventListener('input', function(){ n.value=r.value; applyRole(readRoleUI(),false); });
      r.addEventListener('change',function(){ n.value=r.value; applyRole(readRoleUI(),true);  });
      n.addEventListener('input', function(){ r.value=clampAbs(n.value); applyRole(readRoleUI(),false); });
      n.addEventListener('change',function(){ r.value=clampAbs(n.value); applyRole(readRoleUI(),true);  }); }
    function readRoleUI(){ return { tag:clampAbs(mulTagR&&mulTagR.value||def.tag), titleKey:clampAbs(mulTKR&&mulTKR.value||def.titleKey),
      title:clampAbs(mulTR&&mulTR.value||def.title), narr:clampAbs(mulNR&&mulNR.value||def.narr) }; }
    bindPair(mulTagR,mulTagN); bindPair(mulTKR,mulTKN); bindPair(mulTR,mulTN); bindPair(mulNR,mulNN);
    if(mulReset){ mulReset.addEventListener('click', function(){ applyRole(def,true); }); }
  })();

  // Voices
  function VM(){ return (window.__ttsVoiceMap || (window.__ttsVoiceMap={ tag:null, titleKey:null, title:null, narr:null })); }
  (function initVoices(){
    try{ var vm=VM(); Object.keys(LS_VOICE_KEYS).forEach(function(k){ var s=localStorage.getItem(LS_VOICE_KEYS[k]); if(s) vm[k]=s; }); }catch(_){}
    ;(function seed(){ var defs=CFG.voiceDefaults||{}; var vm=VM(); ['tag','titleKey','title','narr'].forEach(function(k){ if(!vm[k] && defs[k]) vm[k]=defs[k]; }); })();
    function catalog(){ try{ var arr=(window.__ttsUtils && __ttsUtils.getCatalog && __ttsUtils.getCatalog({ jaOnly:!!CFG.voiceFilter.jaOnly }))||[]; return Array.isArray(arr)?arr:[]; }catch(_){ return []; } }
    function currentId(role){ var cur=VM()[role]||''; if(cur && typeof cur==='object'){ return cur.id || cur.voiceURI || (((cur.lang||'')+'|'+(cur.name||''))||''); } return cur||''; }
    function fillSelect(sel,key){ if(!sel) return; var cat=catalog(), cur=currentId(key); sel.innerHTML='';
      var opt=document.createElement('option'); opt.value=''; opt.textContent='Auto'; sel.appendChild(opt);
      for (var i=0;i<cat.length;i++){ var o=document.createElement('option'); o.value=cat[i].id; o.textContent=cat[i].label||cat[i].name||('voice '+i);
        o.setAttribute('data-name', cat[i].name||''); o.setAttribute('data-lang', cat[i].lang||''); if (o.value===cur) o.selected=true; sel.appendChild(o); }
      sel.disabled = !CFG.locks.allowVoiceSelect; }
    function renderVoices(){ fillSelect(vTag,'tag'); fillSelect(vTK,'titleKey'); fillSelect(vT,'title'); fillSelect(vN,'narr');
      var cnt=(function(){try{ return (window.__ttsUtils && __ttsUtils.getCatalog({jaOnly:!!CFG.voiceFilter.jaOnly})||[]).length; }catch(_){ return 0; }})(); 
      if (vCount) vCount.textContent='['+cnt+' voices]'; if(statusEl){ var base=statusEl.textContent||'Ready.'; statusEl.textContent=base.replace(/\s*\[\d+\s+voices\]$/,'')+' ['+cnt+' voices]'; } }
    renderVoices(); setTimeout(renderVoices,400);
    if (window.speechSynthesis && window.speechSynthesis.addEventListener){ try{ window.speechSynthesis.addEventListener('voiceschanged', renderVoices, {passive:true}); }catch(_){ } }
    else if (window.speechSynthesis){ var prev=window.speechSynthesis.onvoiceschanged; window.speechSynthesis.onvoiceschanged=function(){ try{ typeof prev==='function' && prev.apply(this,arguments); }catch(_){ } renderVoices(); }; }
    window.addEventListener('ttsvoicesready', renderVoices);
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') setTimeout(renderVoices,0); }, {passive:true});
    if (vRef){ vRef.addEventListener('click', function(){ try{ if(window.speechSynthesis){ try{ window.speechSynthesis.getVoices(); }catch(_){}
      var u=new SpeechSynthesisUtterance(' '); u.volume=0; u.rate=1.0; u.lang='ja-JP'; u.onend=function(){ setTimeout(renderVoices,0); }; try{ window.speechSynthesis.speak(u); }catch(_){ } } }catch(_){}
      setTimeout(renderVoices,250); setTimeout(renderVoices,800); setTimeout(renderVoices,1600);
    }); }
  })();

  /* ============================= actions ============================= */
  // 停止フラグと gotoNext ラッパ（player.core.js を変更せず“停止”を実現）
  window.__stopRequested = false;
  (function wrapGotoNextOnce(){
    try{
      if (window.__playerCore && !window.__playerCore.__gotoWrapped && typeof window.__playerCore.gotoNext==='function'){
        var _orig = window.__playerCore.gotoNext;
        window.__playerCore.gotoNext = function(){ if (window.__stopRequested) return; return _orig.apply(this, arguments); };
        window.__playerCore.__gotoWrapped = true;
      }
    }catch(_){}
  })();

  function stopAll(){
    try{ speechSynthesis.cancel(); }catch(_){}
    try{ window.__stopRequested = true; }catch(_){}
    try{ if (window.__player && typeof window.__player.stop==='function'){ window.__player.stop(); } }catch(_){}
  }
  function clearStop(){ try{ window.__stopRequested = false; }catch(_){} }

  function hardReload(){
    try{
      if ('caches' in window){
        caches.keys().then(function(keys){ return Promise.all(keys.map(function(id){ return caches.delete(id); })); })
        .finally(function(){ var u=new URL(location.href); u.searchParams.set('rev', Date.now()); location.replace(u.toString()); });
      } else {
        var u=new URL(location.href); u.searchParams.set('rev', Date.now()); location.replace(u.toString());
      }
    }catch(_){ location.reload(); }
  }

  /* ============================= wire (events) ============================= */
  // controls: 単一点のクリック委譲（actスコープをこの関数内に閉じる）
  host.addEventListener('click', function(e){
    var t=e.target; while (t && t!==host && !(t.tagName==='BUTTON' && t.hasAttribute('data-act'))) t=t.parentNode;
    if (!t || t===host) return;
    var act = t.getAttribute('data-act') || '';
    var P = (window.__player || {});
    switch(act){
      case 'prev':     clearStop(); if(P.prev)     P.prev();     break;
      case 'play':     clearStop(); try{ speechSynthesis.cancel(); }catch(_){}
                       if(P.play)     P.play();     break;
      case 'stop':     stopAll();                       break;
      case 'next':     clearStop(); if(P.next)     P.next();     break;
      case 'restart':  clearStop(); if(P.restart)  P.restart();  break;
      case 'goto':     clearStop(); if(P.goto && gotoInp){ var n=(Number(gotoInp.value)|0); if(n>=1) P.goto(n-1); } break;
      case 'hardreload': stopAll(); hardReload(); break;
      default: break;
    }
  });

  if (gotoInp){
    gotoInp.addEventListener('keydown', function(ev){
      if (ev.key==='Enter'){ var P=(window.__player||{}); clearStop(); var n=(Number(gotoInp.value)|0); if (P.goto && n>=1) P.goto(n-1); }
    });
  }

  /* ============================= render loop (status) ============================= */
  var lastIdx=-1, lastTotal=-1;
  (function loop(){
    var P=window.__player || null;
    if (!P || !P.info){ requestAnimationFrame(loop); return; }
    var info=P.info(), scene=(P.getScene && P.getScene())||null;
    if (statusEl){
      var ver=(scene && (scene.version || scene.type)) || '-';
      var base='Page '+(info.index+1)+'/'+info.total+' | '+ver+(info.playing?' | ▶︎ playing':' | ■ idle');
      statusEl.textContent = base + (vCount && vCount.textContent ? ' '+vCount.textContent : '');
    }
    if (gotoInp && (info.index!==lastIdx || info.total!==lastTotal)){
      gotoInp.placeholder = (info.total>0)?((info.index+1)+' / '+info.total):'page#';
      lastIdx=info.index; lastTotal=info.total;
    }
    requestAnimationFrame(loop);
  })();

})();