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
*/

;(function() {
  'use strict';

  /* ---------- mount (self) ---------- */
  var host = document.getElementById('debug-panel');
  if (!host) {
    host = document.createElement('div');
    host.id = 'debug-panel';
    document.body.appendChild(host);
  }

  /* ---------- config ---------- */
  var IN = (window.__dbgConfig || {});
  var VOICE_CFG = IN.voice || {};
  var CFG = {
    collapsedDefault: (typeof IN.collapsedDefault === 'boolean') ? IN.collapsedDefault : false,
    sections: Object.assign({
      status: true,
      note: false,
      controls: true,
      goto: true,
      ttsFlags: true,
      voices: true,
      baseRate: false
    }, (IN.sections || {})),
    buttons: Object.assign({
      prev: true, next: true, play: true, stop: true, restart: true, goto: true
    }, (IN.buttons || {})),
    locks: Object.assign({
      allowTTSFlagEdit: true, allowVoiceSelect: true
    }, (IN.locks || {})),
    rate: Object.assign({ min: 0.5, max: 2.0, step: 0.1 }, (IN.rate || {})),
    rolesRate: Object.assign({ min: 0.5, max: 2.0, step: 0.1, defaultAbs: 1.4 }, (IN.rolesRate || {})),
    // 既定フラグの一元管理（TitleKey=ON 等）
    ttsFlagsDefault: (IN.ttsFlagsDefault || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true }),
    // 永続化キー
    persist: Object.assign({
      panelCollapsedKey: 'dbg.panel.collapsed.v3',
      ttsFlagsKey:       'dbg.tts.flags.v4',
      roleRatesKey:      'dbg.tts.role.v3',
      voiceTagKey:       'dbg.voice.tag',
      voiceTitleKeyKey:  'dbg.voice.titleKey',
      voiceTitleKey:     'dbg.voice.title',
      voiceNarrKey:      'dbg.voice.narr'
    }, (IN.persist || {})),
    // 既定ボイス／フィルタ
    voiceDefaults: Object.assign({ tag:null, titleKey:null, title:null, narr:null }, (VOICE_CFG.defaults || {})),
    voiceHints: Object.assign({ tag:[], titleKey:[], title:[], narr:[] }, (VOICE_CFG.hints || {})),
    voiceFilter: { jaOnly: (VOICE_CFG.filter && typeof VOICE_CFG.filter.jaOnly === 'boolean') ? !!VOICE_CFG.filter.jaOnly : true }
  };

  var LS_KEY = CFG.persist.panelCollapsedKey;
  var LS_RATE_KEY = 'dbg.tts.rate'; // 互換
  var LS_ROLE_KEYS = {
    tag: 'dbg.tts.role.tag', titleKey: 'dbg.tts.role.titleKey',
    title: 'dbg.tts.role.title', narr: 'dbg.tts.role.narr'
  };
  var LS_VOICE_KEYS = {
    tag: CFG.persist.voiceTagKey,
    titleKey: CFG.persist.voiceTitleKeyKey,
    title: CFG.persist.voiceTitleKey,
    narr: CFG.persist.voiceNarrKey
  };

  var collapsed = !!CFG.collapsedDefault;
  try {
    if (typeof IN.collapsedDefault !== 'boolean') {
      var s = localStorage.getItem(LS_KEY);
      if (s != null) collapsed = (s === 'true');
    }
  } catch(_) {}

  /* ---------- base inline styles (no CSS dependency) ---------- */
  function rootStyle(el) {
    el.style.position = 'fixed';
    el.style.left = '0'; el.style.right = '0'; el.style.bottom = '0';
    el.style.zIndex = '2147483647';
    el.style.pointerEvents = 'auto';
    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    el.style.color = '#fff'; el.style.boxSizing = 'border-box';
    el.style.paddingLeft = 'env(safe-area-inset-left,0px)';
    el.style.paddingRight = 'env(safe-area-inset-right,0px)';
    // transformは付けない（iOSのselectポップオーバ干渉を避ける）
  }
  function styleBtn(b){
    b.style.appearance='none';
    b.style.border='1px solid var(--b, rgba(255,255,255,.35))';
    b.style.background='var(--bg, rgba(255,255,255,.08))';
    b.style.color='#fff'; b.style.borderRadius='6px';
    b.style.cursor='pointer'; b.style.fontSize='12px'; b.style.lineHeight='1';
    b.style.padding='0 10px'; b.style.height='34px'; b.style.minHeight='34px';
  }
  function styleField(el, minW){
    el.style.border='1px solid rgba(255,255,255,.25)';
    el.style.background='rgba(0,0,0,.20)'; el.style.color='#fff';
    el.style.borderRadius='6px'; el.style.fontSize='12px'; el.style.lineHeight='1.1';
    el.style.padding='0 8px'; el.style.height='34px'; el.style.minHeight='34px';
    if (minW) el.style.minWidth=minW;
  }
  function styleCheck(c){ c.style.width='16px'; c.style.height='16px'; c.style.minHeight='0'; c.style.verticalAlign='middle'; }

  /* ---------- DOM build ---------- */
  rootStyle(host);
  host.innerHTML =
    '<div class="dbg-bar" style="display:flex;align-items:center;gap:8px;'+
    'padding:6px 8px;background:rgba(0,0,0,.82);border-top:1px solid rgba(255,255,255,.15);backdrop-filter:blur(4px);">'+
    '<button id="dbg-toggle" title="展開/折り畳み" style="--b:rgba(255,255,255,.35);--bg:rgba(255,255,255,.10);">🐞 Debug <span id="dbg-arrow">' + (collapsed?'▸':'▾') + '</span></button>'+
    '<span id="dbg-status" style="font-size:12px;opacity:.95">Ready.</span>'+
    '</div>'+
    '<div id="dbg-body" style="'+(collapsed?'display:none;':'display:block;')+
    'max-height:46vh;overflow:auto;padding:8px;background:rgba(0,0,0,.70);border-top:1px solid rgba(255,255,255,.15);padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));">'+

    // controls & goto
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

    // (optional) base Rate row
    (CFG.sections.baseRate ? (
      '<div id="dbg-rate" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'+
      '<span style="opacity:.85;font-size:12px;">Rate:</span>'+
      '<input id="rateRange" type="range" min="'+CFG.rate.min+'" max="'+CFG.rate.max+'" step="'+CFG.rate.step+'" value="1.2" style="width:200px;height:28px;">'+
      '<input id="rateNum" type="number" min="'+CFG.rate.min+'" max="'+CFG.rate.max+'" step="'+CFG.rate.step+'" value="1.2" style="width:70px;">'+
      '</div>'
    ) : '')+

    // Role absolute rates
    '<div id="dbg-roles" style="display:flex;flex-direction:column;gap:10px;margin:6px 0;">'+
    '<div style="display:flex;align-items:center;gap:8px;"><span style="opacity:.85;font-size:12px;">Role Rate ×</span></div>'+
    '<div class="role-line" data-role="tag" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">Tag</span>'+
    '<input id="mulTagR" type="range" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:200px;height:28px;">'+
    '<input id="mulTagN" type="number" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:70px;">'+
    '</div>'+
    '<div class="role-line" data-role="titleKey" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">TitleKey</span>'+
    '<input id="mulTKR" type="range" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:200px;height:28px;">'+
    '<input id="mulTKN" type="number" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:70px;">'+
    '</div>'+
    '<div class="role-line" data-role="title" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">Title</span>'+
    '<input id="mulTR" type="range" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:200px;height:28px;">'+
    '<input id="mulTN" type="number" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:70px;">'+
    '</div>'+
    '<div class="role-line" data-role="narr" style="display:flex;align-items:center;gap:8px;">'+
    '<span style="width:64px;opacity:.85;font-size:12px;">Narr</span>'+
    '<input id="mulNR" type="range" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:200px;height:28px;">'+
    '<input id="mulNN" type="number" min="'+CFG.rolesRate.min+'" max="'+CFG.rolesRate.max+'" step="'+CFG.rolesRate.step+'" value="'+CFG.rolesRate.defaultAbs+'" style="width:70px;">'+
    '<button id="mulReset" title="Reset role rates" style="--b:rgba(255,255,255,.35);--bg:rgba(255,255,255,.10);margin-left:8px;">Reset</button>'+
    '</div>'+
    '</div>'+

    // Voices + Flags unified
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

  // [Hard Reload Button] — DOM構築完了後に #dbg-controls へ追加
  (function addHardReloadBtn(){
    var c = document.getElementById('dbg-controls'); if (!c) return;
    var b = document.createElement('button');
    b.setAttribute('data-act','hardreload');
    b.textContent = '⟲ Hard Reload';
    c.appendChild(b);
    try {
      // styleBtn は同スコープだが安全のため直指定
      b.style.border='1px solid rgba(255,255,255,.35)';
      b.style.background='rgba(255,255,255,.08)';
      b.style.color='#fff'; b.style.borderRadius='6px';
      b.style.cursor='pointer'; b.style.fontSize='12px';
      b.style.lineHeight='1'; b.style.padding='0 10px';
      b.style.height='34px'; b.style.minHeight='34px';
    } catch(_) {}
  })();

  /* ---------- refs ---------- */
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

  /* ---------- style unify ---------- */
  Array.prototype.forEach.call(host.querySelectorAll('#dbg-controls button, #v-refresh, #mulReset, #dbg-toggle'), styleBtn);
  if (gotoInp) styleField(gotoInp);
  [vTag, vTK, vT, vN].forEach(function(sel){ if (sel){ styleField(sel,'110px'); sel.style.padding='0 6px'; } });
  if (rateNum) styleField(rateNum,'70px');
  ['#mulTagN','#mulTKN','#mulTN','#mulNN'].forEach(function(sel){ var el=host.querySelector(sel); if (el) styleField(el,'70px'); });
  [ckTag, ckTK, ckT, ckN].forEach(function(c){ if (c) styleCheck(c); });

  /* ---------- collapse ---------- */
  function setCollapsed(v){
    collapsed=!!v;
    if (body) body.style.display = collapsed ? 'none':'block';
    if (arrow) arrow.textContent = collapsed ? '▸':'▾';
    try{ localStorage.setItem(LS_KEY, String(collapsed)); }catch(_){}
    host.style.pointerEvents = collapsed ? 'none':'auto';
    if (bar) bar.style.pointerEvents = 'auto';
  }
  if (tgl){ tgl.addEventListener('click', function(){ setCollapsed(!collapsed); }); }
  setCollapsed(collapsed);

  /* ---------- TTS flags (unified) ---------- */
  var FLAGS_LS = CFG.persist.ttsFlagsKey;
  function F(){
    if (!window.__ttsFlags) window.__ttsFlags = Object.assign({}, CFG.ttsFlagsDefault);
    return window.__ttsFlags;
  }
  function loadFlagsFromLS(){
    try {
      var s = localStorage.getItem(FLAGS_LS);
      if (s){ var obj = JSON.parse(s); if (obj && typeof obj==='object') Object.assign(F(), obj); }
    } catch(_){}
  }
  function saveFlagsToLS(){
    try { localStorage.setItem(FLAGS_LS, JSON.stringify(F())); } catch(_){}
  }
  function pushFlags(){
    var f=F();
    if (ckTag) ckTag.checked = !!f.readTag;
    if (ckTK)  ckTK.checked  = !!f.readTitleKey;
    if (ckT)   ckT.checked   = !!f.readTitle;
    if (ckN)   ckN.checked   = !!f.readNarr;
    if (!CFG.locks.allowTTSFlagEdit){ [ckTag,ckTK,ckT,ckN].forEach(function(x){ if(x) x.disabled=true; }); }
  }
  function pullFlags(){
    var f=F();
    if (ckTag) f.readTag      = !!ckTag.checked;
    if (ckTK)  f.readTitleKey = !!ckTK.checked;
    if (ckT)   f.readTitle    = !!ckT.checked;
    if (ckN)   f.readNarr     = !!ckN.checked;
    saveFlagsToLS();
  }
  loadFlagsFromLS();
  [ckTag,ckTK,ckT,ckN].forEach(function(x){ if (x && CFG.locks.allowTTSFlagEdit){ x.addEventListener('change', pullFlags); }});
  pushFlags();

  /* ---------- base rate (optional) ---------- */
  if (CFG.sections.baseRate){
    function clampRate(v){ v=Number(v); if(!isFinite(v)) return 1.2; return Math.min(CFG.rate.max, Math.max(CFG.rate.min, v)); }
    function applyRate(v, persist){
      var r=clampRate(v);
      if (rateRange) rateRange.value=String(r);
      if (rateNum)   rateNum.value=String(r);
      try{ (window.__ttsUtils && __ttsUtils.setRate) && __ttsUtils.setRate(r); }catch(_){}
      if (persist){ try{ localStorage.setItem(LS_RATE_KEY,String(r)); }catch(_){ } }
    }
    (function initRate(){
      var v=1.2; try{ var s=localStorage.getItem(LS_RATE_KEY); if (s!=null) v=Number(s);}catch(_){}
      applyRate(v,false);
    })();
    if (rateRange){ rateRange.addEventListener('input', function(){ applyRate(rateRange.value,false); });
                    rateRange.addEventListener('change',function(){ applyRate(rateRange.value,true ); }); }
    if (rateNum){   rateNum.addEventListener('input', function(){ applyRate(rateNum.value,false);   });
                    rateNum.addEventListener('change',function(){ applyRate(rateNum.value,true );   }); }
  }

  /* ---------- role absolute rates ---------- */
  function clampAbs(v){ v=Number(v); if(!isFinite(v)) return CFG.rolesRate.defaultAbs||1.4; return Math.min(CFG.rolesRate.max, Math.max(CFG.rolesRate.min, v)); }
  function readRoleFromLS(){
    var out={ tag:1.4, titleKey:1.4, title:1.4, narr:1.4 };
    try{ Object.keys(LS_ROLE_KEYS).forEach(function(k){ var s=localStorage.getItem(LS_ROLE_KEYS[k]); if(s!=null) out[k]=clampAbs(s); }); }catch(_){}
    return out;
  }
  function saveRoleToLS(map){ try{ Object.keys(map).forEach(function(k){ localStorage.setItem(LS_ROLE_KEYS[k], String(clampAbs(map[k]))); }); }catch(_){} }
  function applyRoleUI(map){
    if (mulTagR) mulTagR.value=String(map.tag);   if (mulTagN) mulTagN.value=String(map.tag);
    if (mulTKR) mulTKR.value=String(map.titleKey); if (mulTKN) mulTKN.value=String(map.titleKey);
    if (mulTR)  mulTR.value=String(map.title);    if (mulTN)  mulTN.value=String(map.title);
    if (mulNR)  mulNR.value=String(map.narr);     if (mulNN)  mulNN.value=String(map.narr);
  }
  function runtimeSetRole(m){
    try{
      if (window.__ttsRuntime && __ttsRuntime.setRoleMultipliers) __ttsRuntime.setRoleMultipliers(m);
      else if (window.__ttsUtils && __ttsUtils.setRateRole) __ttsUtils.setRateRole(m);
    }catch(_){}
  }
  function applyRole(map, persist){
    var m={ tag:clampAbs(map.tag), titleKey:clampAbs(map.titleKey), title:clampAbs(map.title), narr:clampAbs(map.narr) };
    applyRoleUI(m); runtimeSetRole(m); if (persist) saveRoleToLS(m);
  }
  (function initRole(){
    var def={ tag:CFG.rolesRate.defaultAbs, titleKey:CFG.rolesRate.defaultAbs, title:CFG.rolesRate.defaultAbs, narr:CFG.rolesRate.defaultAbs };
    var m=Object.assign(def, readRoleFromLS()); applyRole(m,false);
  })();
  function bindRolePair(rangeEl, numEl){
    if (!rangeEl || !numEl) return;
    rangeEl.addEventListener('input', function(){ numEl.value=rangeEl.value; applyRole(readRoleUI(), false); });
    rangeEl.addEventListener('change',function(){ numEl.value=rangeEl.value; applyRole(readRoleUI(), true ); });
    numEl.addEventListener('input', function(){ rangeEl.value=clampAbs(numEl.value); applyRole(readRoleUI(), false); });
    numEl.addEventListener('change',function(){ rangeEl.value=clampAbs(numEl.value); applyRole(readRoleUI(), true ); });
  }
  function readRoleUI(){
    return {
      tag:clampAbs(mulTagR&&mulTagR.value||CFG.rolesRate.defaultAbs),
      titleKey:clampAbs(mulTKR&&mulTKR.value||CFG.rolesRate.defaultAbs),
      title:clampAbs(mulTR&&mulTR.value||CFG.rolesRate.defaultAbs),
      narr:clampAbs(mulNR&&mulNR.value||CFG.rolesRate.defaultAbs)
    };
  }
  bindRolePair(mulTagR,mulTagN); bindRolePair(mulTKR,mulTKN); bindRolePair(mulTR,mulTN); bindRolePair(mulNR,mulNN);
  if (mulReset){ mulReset.addEventListener('click', function(){ applyRole({ tag:CFG.rolesRate.defaultAbs, titleKey:CFG.rolesRate.defaultAbs, title:CFG.rolesRate.defaultAbs, narr:CFG.rolesRate.defaultAbs }, true); }); }

  /* ---------- voices + flags ---------- */
  function VM(){ return (window.__ttsVoiceMap || (window.__ttsVoiceMap = { tag:null, titleKey:null, title:null, narr:null })); }

  function loadVoiceFromLS(){
    try{
      var vm = VM();
      Object.keys(LS_VOICE_KEYS).forEach(function(k){
        var s = localStorage.getItem(LS_VOICE_KEYS[k]);
        if (s) vm[k] = s; // string id として保持（解決は player.core 側で安全）
      });
    }catch(_){}
  }
  function saveVoiceToLS(){
    try{
      var vm = VM();
      Object.keys(LS_VOICE_KEYS).forEach(function(k){
        var v = vm[k];
        var id = (v && typeof v==='object') ? (v.id || v.voiceURI || (((v.lang||'')+'|'+(v.name||''))||'')) : (v || '');
        if (id) localStorage.setItem(LS_VOICE_KEYS[k], id); else localStorage.removeItem(LS_VOICE_KEYS[k]);
      });
    }catch(_){}
  }
  function seedVoiceDefaultsFromConfig(){
    var defs = CFG.voiceDefaults || {};
    var vm = VM();
    ['tag','titleKey','title','narr'].forEach(function(k){
      if (!vm[k] && defs[k]) vm[k] = defs[k]; // 例: 'ja-JP|Kyoko'
    });
  }

  function catalog(){
    try{
      var arr = (window.__ttsUtils && __ttsUtils.getCatalog && __ttsUtils.getCatalog({ jaOnly: !!CFG.voiceFilter.jaOnly })) || [];
      return Array.isArray(arr) ? arr : [];
    }catch(_){ return []; }
  }

  function currentIdForRole(role){
    var cur = VM()[role] || '';
    if (cur && typeof cur === 'object'){
      return cur.id || cur.voiceURI || (((cur.lang||'')+'|'+(cur.name||'')) || '');
    }
    return cur || '';
  }

  function fillSelect(sel, key){
    if (!sel) return;
    var cat=catalog(), curId=currentIdForRole(key);
    sel.innerHTML='';
    var opt=document.createElement('option'); opt.value=''; opt.textContent='Auto'; sel.appendChild(opt);
    for (var i=0;i<cat.length;i++){
      var o=document.createElement('option');
      o.value=cat[i].id; o.textContent=cat[i].label || cat[i].name || ('voice '+i);
      o.setAttribute('data-name', cat[i].name || '');
      o.setAttribute('data-lang', cat[i].lang || '');
      if (o.value===curId) o.selected=true;
      sel.appendChild(o);
    }
    // 変更: 件数ゼロでも disable にしない（Autoのみでも開ける）
    sel.disabled = !CFG.locks.allowVoiceSelect;
  }

  function renderVoices(){
    fillSelect(vTag,'tag'); fillSelect(vTK,'titleKey'); fillSelect(vT,'title'); fillSelect(vN,'narr');
    var cnt = catalog().length;
    if (vCount) vCount.textContent = '['+cnt+' voices]';
    if (statusEl){
      var base = statusEl.textContent || 'Ready.';
      statusEl.textContent = base.replace(/\s*\[\d+\s+voices\]$/,'') + ' ['+cnt+' voices]';
    }
  }

  function forceVoicesRefresh(){
    try{
      if (window.speechSynthesis){
        try { window.speechSynthesis.getVoices(); }catch(_){}
        var u=new SpeechSynthesisUtterance(' ');
        u.volume=0; u.rate=1.0; u.lang='ja-JP';
        u.onend=function(){ setTimeout(renderVoices,0); };
        try { window.speechSynthesis.speak(u); }catch(_){}
      }
    }catch(_){}
    setTimeout(renderVoices, 250);
    setTimeout(renderVoices, 800);
    setTimeout(renderVoices, 1600);
  }

  // 初期シード：LS -> config.defaults -> 描画
  loadVoiceFromLS();
  seedVoiceDefaultsFromConfig();
  renderVoices();
  setTimeout(renderVoices, 400);

  // voice イベント購読
  if (window.speechSynthesis && window.speechSynthesis.addEventListener){
    try { window.speechSynthesis.addEventListener('voiceschanged', renderVoices, {passive:true}); } catch(_){}
  } else if (window.speechSynthesis){
    var prev = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = function(){
      try { typeof prev==='function' && prev.apply(this, arguments); }catch(_){}
      renderVoices();
    };
  }
  window.addEventListener('ttsvoicesready', renderVoices);
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible') setTimeout(renderVoices, 0);
  }, {passive:true});

  if (vRef){ vRef.addEventListener('click', forceVoicesRefresh); }

  // Voice選択の変更を VM + LS に反映、次発話から即反映されるようキューをクリア
  [vTag, vTK, vT, vN].forEach(function(sel, idx) {
    if (!sel) return;
    sel.addEventListener('change', function() {
      var roleKey = ['tag','titleKey','title','narr'][idx];
      var opt = sel.options[sel.selectedIndex] || null;
      if (!opt || !opt.value) {
        VM()[roleKey] = null; // Auto
      } else {
        VM()[roleKey] = {
          id: opt.value,
          voiceURI: opt.value,
          name: opt.getAttribute('data-name') || '',
          lang: opt.getAttribute('data-lang') || ''
        };
      }
      saveVoiceToLS();
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch(_){}
    });
  });

  // フラグ: UI↔state 同期（起動時に一往復）
  (function ensureFlags(){
    pullFlags();
    pushFlags();
  })();

  /* ---------- controls ---------- */
  host.addEventListener('click', function(e){
    var t=e.target;
    while (t && t!==host && !(t.tagName==='BUTTON' && t.hasAttribute('data-act'))) t=t.parentNode;
    if (!t || t===host) return;

    var act = t.getAttribute('data-act'), P=(window.__player||{});

    if (act==='prev'    && P.prev)    P.prev();
    if (act==='play'    && P.play)    P.play();
    if (act==='stop'    && P.stop)    P.stop();
    if (act==='next'    && P.next)    P.next();
    if (act==='restart' && P.restart) P.restart();
    if (act==='goto'    && P.goto && gotoInp){ var n=(Number(gotoInp.value)|0); if (n>=1) P.goto(n-1); }

    // hardreload はクリックハンドラ「内」に置く（act のスコープ内）
    if (act==='hardreload') {
      try {
        if ('caches' in window) {
          caches.keys().then(function(keys){
            return Promise.all(keys.map(function(id){ return caches.delete(id); }));
          }).finally(function(){
            var u=new URL(location.href);
            u.searchParams.set('rev', Date.now()); // クエリバスター
            location.replace(u.toString());        // 履歴を汚さず再読込
          });
        } else {
          var u=new URL(location.href);
          u.searchParams.set('rev', Date.now());
          location.replace(u.toString());
        }
      } catch(_) {
        location.reload(); // 最終フォールバック
      }
      return;
    }
  });

  if (gotoInp){
    gotoInp.addEventListener('keydown', function(ev){
      if (ev.key==='Enter'){
        var P=(window.__player||{}); var n=(Number(gotoInp.value)|0);
        if (P.goto && n>=1) P.goto(n-1);
      }
    });
  }

  /* ---------- render loop (status) ---------- */
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
