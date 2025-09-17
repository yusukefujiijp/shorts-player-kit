/*!
Project:  shorts-player-kit
File:     js/debug_panel.js
Role:     Debug Panel（閉バー=最小Play/Stop+停止チップ / 展開=詳細とTTS）
Depends:  window.__player / __playerCore / __ttsFlags / __ttsVoiceMap / __dbgConfig (optional)
Events:   'player:stop-ack'     { ts }
          'player:stop-confirm' { latencyMs, context }
*/

(function(){
  'use strict';

  /* ====================== Config intake ====================== */
  var IN = (window.__dbgConfig || {});
  var VOICE_IN = IN.voice || {};
  var SECTIONS = Object.assign(
    { status:true, note:false, controls:true, goto:true, ttsFlags:true, voices:true, baseRate:false },
    (IN.sections||{})
  );
  var BUTTONS = Object.assign(
    { prev:true, next:true, play:true, stop:true, restart:true, goto:true, hardreload:true, hardstop:false },
    (IN.buttons||{})
  );
  var LOCKS  = Object.assign({ allowTTSFlagEdit:true, allowVoiceSelect:true }, (IN.locks||{}));
  var RATE   = Object.assign({ min:0.5, max:2.0, step:0.1 }, (IN.rate||{}));
  var ROLES  = Object.assign({ min:0.5, max:2.0, step:0.1, defaultAbs:1.4 }, (IN.rolesRate||{}));
  var FLAGS0 = (IN.ttsFlagsDefault || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true });
  var PERSIST= Object.assign({
    panelCollapsedKey:'dbg.panel.collapsed.v3',
    ttsFlagsKey:'dbg.tts.flags.v4',
    roleRatesKey:'dbg.tts.role.v3',
    voiceTagKey:'dbg.voice.tag',
    voiceTitleKeyKey:'dbg.voice.titleKey',
    voiceTitleKey:'dbg.voice.title',
    voiceNarrKey:'dbg.voice.narr'
  }, (IN.persist||{}));
  var VOICE_DEF    = Object.assign({ tag:null, titleKey:null, title:null, narr:null }, (VOICE_IN.defaults||{}));
  var VOICE_FILTER = { jaOnly: (VOICE_IN.filter && typeof VOICE_IN.filter.jaOnly==='boolean') ? !!VOICE_IN.filter.jaOnly : true };

  /* Quick Bar（設定） */
  var QB = (IN.quickbar && typeof IN.quickbar === 'object') ? {
    enabled: !!IN.quickbar.enabled,
    items: Object.assign({ play:true, stop:true, stopStatus:true }, (IN.quickbar.items||{}))
  } : { enabled:false, items:{ play:true, stop:true, stopStatus:true } };

  /* 展開ステータスバッジのモーション方針 */
  var BADGES = (IN.badges && typeof IN.badges==='object') ? IN.badges : {};
  var BADGE_MOTION = (BADGES.motion==='static' || BADGES.motion==='off') ? BADGES.motion : 'auto';

  /* ============================ Host ============================ */
  var host = document.getElementById('debug-panel');
  if (!host){ host = document.createElement('div'); host.id='debug-panel'; document.body.appendChild(host); }

  function rootStyle(el){
    el.style.position='fixed'; el.style.left='0'; el.style.right='0'; el.style.bottom='0';
    el.style.zIndex='2147483647'; el.style.pointerEvents='auto';
    el.style.fontFamily='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    el.style.color='#fff'; el.style.boxSizing='border-box';
    el.style.paddingLeft='env(safe-area-inset-left,0px)'; el.style.paddingRight='env(safe-area-inset-right,0px)';
  }
  function styleBtn(b){ b.style.appearance='none'; b.style.border='1px solid var(--b, rgba(255,255,255,.35))';
    b.style.background='var(--bg, rgba(255,255,255,.08))'; b.style.color='#fff'; b.style.borderRadius='10px';
    b.style.cursor='pointer'; b.style.fontSize='14px'; b.style.lineHeight='1'; b.style.padding='0 12px';
    b.style.height='40px'; b.style.minHeight='40px'; }
  function styleIconBtn(b){ styleBtn(b); b.style.width='40px'; b.style.padding='0'; b.style.display='inline-flex'; b.style.alignItems='center'; b.style.justifyContent='center'; }
  function styleField(el,minW){ el.style.border='1px solid rgba(255,255,255,.25)'; el.style.background='rgba(0,0,0,.20)'; el.style.color='#fff';
    el.style.borderRadius='6px'; el.style.fontSize='12px'; el.style.lineHeight='1.1'; el.style.padding='0 8px';
    el.style.height='34px'; el.style.minHeight='34px'; if(minW) el.style.minWidth=minW; }
  function styleCheck(c){ c.style.width='16px'; c.style.height='16px'; c.style.minHeight='0'; c.style.verticalAlign='middle'; }
  function h(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=String(txt); return e; }

  rootStyle(host);
  host.innerHTML =
    '<div class="dbg-bar" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(0,0,0,.82);border-top:1px solid rgba(255,255,255,.15);backdrop-filter:blur(4px);">'+
      '<button id="dbg-toggle" title="展開/折り畳み" style="--b:rgba(255,255,255,.35);--bg:rgba(255,255,255,.10);">🐞 Debug <span id="dbg-arrow"></span></button>'+
      (QB.enabled && QB.items.play ? '<button id="qb-play" class="qb-btn" data-act="play">▶︎</button>' : '')+
      (QB.enabled && QB.items.stop ? '<button id="qb-stop" class="qb-btn" data-act="stop">■</button>' : '')+
      '<span id="dbg-status" style="font-size:12px;opacity:.95;white-space:nowrap;">Ready.</span>'+
      (QB.enabled && QB.items.stopStatus ? '<span class="qb-sep"></span><span id="qb-ack" class="dbg-chip" style="display:none;"></span>' : '')+
    '</div>'+
    '<div id="dbg-body" class="dbg-body" style="max-height:46vh;overflow:auto;padding:8px;background:rgba(0,0,0,.70);border-top:1px solid rgba(255,255,255,.15);padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));">'+
      '<div id="dbg-state-chips"></div>'+
      (SECTIONS.controls ? '<div id="dbg-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'
       + (BUTTONS.prev?'<button data-act="prev">⟵ Prev</button>':'')
       + (BUTTONS.play?'<button data-act="play" style="--b:rgba(0,200,255,.55);--bg:rgba(0,200,255,.18);">▶︎ Play</button>':'')
       + (BUTTONS.stop?'<button data-act="stop" style="--b:rgba(255,120,120,.55);--bg:rgba(255,120,120,.18);">■ Stop</button>':'')
       + (BUTTONS.next?'<button data-act="next">Next ⟶</button>':'')
       + (BUTTONS.restart?'<button data-act="restart">↻ Restart</button>':'')
       + (BUTTONS.goto?'<label class="goto" style="display:inline-flex;align-items:center;gap:6px;margin-left:6px;"><span style="font-size:12px;opacity:.9;">Goto:</span><input id="dbg-goto" type="number" min="1" step="1" inputmode="numeric" placeholder="page#" style="width:72px;"><button data-act="goto">Go</button></label>':'')
       + (BUTTONS.hardreload?'<button data-act="hardreload" class="warn">⟲ Hard Reload</button>':'')
       + (BUTTONS.hardstop?'<button data-act="hardstop" class="warn">⛔ Hard Stop</button>':'')
     +'</div>' : '')+
      (SECTIONS.status? '<div id="dbg-statusbox" class="sec" style="margin:6px 0;"></div>':'' )+
      (SECTIONS.baseRate?('<div id="dbg-rate" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'+
        '<span style="opacity:.85;font-size:12px;">Rate:</span>'+
        '<input id="rateRange" type="range" style="width:200px;height:28px;">'+
        '<input id="rateNum" type="number" style="width:70px;">'+
      '</div>'):'')+
      (SECTIONS.ttsFlags? '<div id="dbg-flags" class="sec"></div>':'' )+
      (SECTIONS.voices?   '<div id="dbg-voices" class="sec"></div>':'' )+
    '</div>';

  /* ========= refs ========= */
  function $(s){ return host.querySelector(s); }
  var body   = $('#dbg-body');
  var tgl    = $('#dbg-toggle');
  var arrow  = $('#dbg-arrow');
  var statusEl = $('#dbg-status');
  var gotoInp  = $('#dbg-goto');
  var qbAckEl  = $('#qb-ack');       // Quick Bar右端の停止フィードバック
  var chipsBox = $('#dbg-state-chips'); // 展開パネル上部のspeaking/paused/pending

  /* ========= init styles / events ========= */
  (function initUI(){
    var collapsed = (function(){
      try{ var s=localStorage.getItem(PERSIST.panelCollapsedKey); if(s!=null) return (s==='true'); }catch(_){}
      return !!IN.collapsedDefault;
    })();
    if (arrow) arrow.textContent = collapsed ? '▸':'▾';
    if (body)  body.style.display = collapsed ? 'none':'block';
    if (tgl) tgl.addEventListener('click', function(){
      var now = (body && body.style.display!=='none');
      if (body) body.style.display = now ? 'none':'block';
      if (arrow) arrow.textContent = now ? '▸':'▾';
      try{ localStorage.setItem(PERSIST.panelCollapsedKey, String(!now)); }catch(_){}
    });
  })();

  /* ============================ Flags ============================ */
  var FLAGS = (window.__ttsFlags = window.__ttsFlags || Object.assign({}, FLAGS0));
  function renderFlags(){
    if (!SECTIONS.ttsFlags) return;
    var box=$('#dbg-flags'); if(!box) return;
    box.innerHTML='';
    var title=h('h3',null,'TTS Flags'); box.appendChild(title);
    ['readTag','readTitleKey','readTitle','readNarr'].forEach(function(k){
      var id='dbg-flag-'+k; var line=h('div');
      var c=document.createElement('input'); c.type='checkbox'; c.id=id; c.checked=!!FLAGS[k]; styleCheck(c);
      c.onchange=function(){ FLAGS[k]=!!c.checked; try{ localStorage.setItem(PERSIST.ttsFlagsKey, JSON.stringify(FLAGS)); }catch(_){ } };
      var lab=document.createElement('label'); lab.htmlFor=id; lab.textContent=k;
      line.appendChild(c); line.appendChild(lab); box.appendChild(line);
    });
    try{ var saved=localStorage.getItem(PERSIST.ttsFlagsKey); if(saved){ var o=JSON.parse(saved); if(o&&typeof o==='object') Object.assign(FLAGS,o); } }catch(_){}
  }
  renderFlags();

  /* ============================ Voices =========================== */
  function voicesCatalog(){ try{ var arr=(window.__ttsUtils && __ttsUtils.getCatalog && __ttsUtils.getCatalog({ jaOnly:!!VOICE_FILTER.jaOnly }))||[]; return Array.isArray(arr)?arr:[]; }catch(_){ return []; } }
  function currentVoiceId(role){ var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {}); var cur=vm[role]||''; if(cur && typeof cur==='object'){ return cur.id || cur.voiceURI || (((cur.lang||'')+'|'+(cur.name||''))||''); } return cur||''; }
  function renderVoices(){
    if (!SECTIONS.voices) return;
    var box=$('#dbg-voices'); if(!box) return; box.innerHTML='';
    box.appendChild(h('h3',null,'Voices'));
    var roles=['tag','titleKey','title','narr']; var list=voicesCatalog();
    roles.forEach(function(role){
      var line=h('div','dbg-row'); line.appendChild(h('span','dbg-row-label',role));
      var sel=document.createElement('select'); styleField(sel,'140px');
      sel.appendChild(new Option('Auto',''));
      list.forEach(function(v){ var id=v.id || v.voiceURI || ((v.lang||'')+'|'+(v.name||'')); sel.appendChild(new Option((v.label||v.name||id)+' ['+(v.lang||'-')+']', id)); });
      sel.value=currentVoiceId(role);
      sel.onchange=function(){ var id=sel.value; var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {}); if(!id) delete vm[role]; else vm[role]=id; try{ localStorage.setItem('dbg.voice.'+role, id); }catch(_){} };
      box.appendChild(line); line.appendChild(sel);
    });
    var cnt=list.length; var note=h('div',null,'['+cnt+' voices]'); note.style.opacity='.7'; note.style.fontSize='12px'; box.appendChild(note);
    var rf=document.createElement('button'); rf.textContent='Refresh Voices'; styleBtn(rf);
    rf.onclick=function(){ try{ if(window.speechSynthesis){ var u=new SpeechSynthesisUtterance(' '); u.volume=0; u.lang='ja-JP'; u.onend=function(){ setTimeout(renderVoices,0); }; try{ speechSynthesis.speak(u); }catch(_){ } } }catch(_){} setTimeout(renderVoices,300); setTimeout(renderVoices,1200); };
    box.appendChild(rf);
  }
  renderVoices();
  try{ if('speechSynthesis' in window){ window.speechSynthesis.addEventListener('voiceschanged', function(){ setTimeout(renderVoices,0); }, {passive:true}); } }catch(_){}

  /* ====================== Stop ACK (expanded) ===================== */
  // Note: 従来の展開パネル用ACK表示は廃止。QuickBarのチップに一本化。
  var stopAck = { pending:false, confirmed:false, ts:0, latencyMs:0, context:'' };
  function qbShowStopping(){ if(!qbAckEl) return; qbAckEl.className='dbg-chip stopping'; qbAckEl.textContent='Stopping…'; qbAckEl.style.display='inline-flex'; }
  function qbShowStopped(){ if(!qbAckEl) return; qbAckEl.className='dbg-chip stopped'; qbAckEl.textContent='Stopped ✓ '+(stopAck.latencyMs|0)+'ms'; qbAckEl.style.display='inline-flex'; setTimeout(function(){ if(qbAckEl) qbAckEl.style.display='none'; }, 1600); }
  function qbClear(){ if(!qbAckEl) return; qbAckEl.style.display='none'; }

  window.addEventListener('player:stop-ack', function(ev){
    stopAck.pending=true; stopAck.confirmed=false;
    stopAck.ts = (ev && ev.detail && ev.detail.ts) ? ev.detail.ts : Date.now();
    qbShowStopping();
  });
  window.addEventListener('player:stop-confirm', function(ev){
    stopAck.pending=false; stopAck.confirmed=true;
    stopAck.latencyMs = (ev && ev.detail && ev.detail.latencyMs)|0;
    stopAck.context   = (ev && ev.detail && ev.detail.context)||'';
    qbShowStopped();
  });

  /* ============================ Actions ============================ */
  function hardReload(){
    try{
      if ('caches' in window){
        caches.keys().then(function(xs){ return Promise.all(xs.map(function(k){ return caches.delete(k); })); })
        .finally(function(){ var u=new URL(location.href); u.searchParams.set('rev', String(Date.now())); location.replace(String(u)); });
      } else {
        var u=new URL(location.href); u.searchParams.set('rev', String(Date.now())); location.replace(String(u));
      }
    }catch(_){ location.reload(); }
  }

  host.addEventListener('click', function(e){
    var t=e.target; while(t && t!==host && !(t.tagName==='BUTTON' && (t.hasAttribute('data-act') || t.classList.contains('qb-btn')))) t=t.parentNode;
    if (!t || t===host) return;
    var act = t.getAttribute('data-act') || '';
    var P = (window.__player || {});
    function clearQb(){ qbClear(); }

    switch(act){
      case 'play':     clearQb(); try{ speechSynthesis.cancel(); }catch(_){}
                       if(P.play)     P.play();     break;
      case 'stop':     if(P.stop) P.stop();         break; // ページ末停止（ACKで手応え可視化）
      case 'prev':     clearQb(); if(P.prev)     P.prev();     break;
      case 'next':     clearQb(); if(P.next)     P.next();     break;
      case 'restart':  clearQb(); if(P.restart)  P.restart();  break;
      case 'goto':     clearQb(); if(P.goto && gotoInp){ var n=(Number(gotoInp.value)|0); if(n>=1) P.goto(n-1); } break;
      case 'hardreload': try{ if(P.stopHard) P.stopHard(); }catch(_){}
                         hardReload(); break;
      case 'hardstop':  try{ if(P.stopHard) P.stopHard(); }catch(_){} break;
      default: break;
    }
  });

  if (gotoInp){
    gotoInp.addEventListener('keydown', function(ev){
      if (ev.key==='Enter'){ var P=(window.__player||{}); qbClear(); var n=(Number(gotoInp.value)|0); if (P.goto && n>=1) P.goto(n-1); }
    });
  }

  /* ========================= Status Polling ======================== */
  var lastIdx=-1, lastTotal=-1;
  (function loop(){
    var P=window.__player || null;
    if (!P || !P.info){ requestAnimationFrame(loop); return; }
    var info=P.info(), scene=(P.getScene && P.getScene())||null;

    if (statusEl){
      var ver=(scene && (scene.version || scene.type)) || '-';
      statusEl.textContent = 'Page '+(info.index+1)+'/'+info.total+' | '+ver+(info.playing?' | ▶︎ playing':' | ■ idle');
    }

    // 展開パネル最上部のspeaking/paused/pending
    if (chipsBox){
      var ss = (window.speechSynthesis||{});
      var showBadges = (BADGE_MOTION!=='off');
      var motionClass = (BADGE_MOTION==='auto')? ' pulse':'';
      var html = [
        '<span class="dbg-chip speaking'+(ss.speaking?' on':'')+motionClass+'">speaking</span>',
        '<span class="dbg-chip paused'+(ss.paused?' on':'')+motionClass+'">paused</span>',
        '<span class="dbg-chip pending'+(ss.pending?' on':'')+motionClass+'">pending</span>'
      ].join(' ');
      chipsBox.innerHTML = showBadges ? html : '';
    }

    if (gotoInp && (info.index!==lastIdx || info.total!==lastTotal)){
      gotoInp.placeholder = (info.total>0)?((info.index+1)+' / '+info.total):'page#';
      lastIdx=info.index; lastTotal=info.total;
    }
    requestAnimationFrame(loop);
  })();

  /* ============================ Minimal CSS (inline) ============================ */
  (function injectCSS(){
    if (document.getElementById('debug-panel-style')) return;
    var css = [
      '#debug-panel .dbg-status{font-size:12px;opacity:.95;display:flex;align-items:center;gap:8px;}',
      '#debug-panel .dbg-body{max-height:44vh;overflow:auto;padding:8px;background:rgba(0,0,0,.70);border-top:1px solid rgba(255,255,255,.15);}',

      /* QuickBar buttons */
      '#debug-panel .qb-btn{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;width:40px;height:40px;min-height:40px;font-size:18px;line-height:1;cursor:pointer;}',
      '#debug-panel .qb-btn:active{transform:translateY(1px);}',
      '#debug-panel .qb-chip{display:inline-flex;align-items:center;gap:.5em;padding:.28rem .6rem;border-radius:999px;font-weight:700;font-size:12px;line-height:1;border:1px solid transparent;color:#fff;}',
      '#debug-panel .qb-chip[hidden]{display:none;}',
      '#debug-panel .qb-chip.stopping{background:#b45309;border-color:#92400e;}',
      '#debug-panel .qb-chip.stopped{background:#15803d;border-color:#065f46;}',

      /* Expanded badges */
      '#debug-panel .dbg-badge{display:inline-flex;align-items:center;gap:.5em;padding:.28rem .6rem;border-radius:999px;font-weight:700;font-size:12px;line-height:1;border:1px solid transparent;color:#fff;background:#3f3f46;opacity:.75;}',
      '#debug-panel .dbg-badge.on{opacity:1;}',
      '#debug-panel .dbg-badge.speaking{background:#15803d;border-color:#065f46;}',
      '#debug-panel .dbg-badge.paused{background:#b45309;border-color:#92400e;}',
      '#debug-panel .dbg-badge.pending{background:#1d4ed8;border-color:#1e40af;}',

      /* Gentle pulse (expanded only) */
      '#debug-panel .dbg-badge.pulse.on{animation:dbgPulse 1.2s ease-in-out infinite;}',
      '@keyframes dbgPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.25);}70%{box-shadow:0 0 0 6px rgba(255,255,255,0);}100%{box-shadow:0 0 0 0 rgba(255,255,255,0);}}',
      '@media (prefers-reduced-motion:reduce){#debug-panel .dbg-badge.pulse.on{animation:none;}}',

      /* ACK detail chips (expanded) */
      '#debug-panel .dbg-badge.off{background:#6b7280;border-color:#52525b;}',
      '#debug-panel .dbg-badge.on{background:#16a34a;border-color:#065f46;}'
    ].join('\n');
    var st=document.createElement('style'); st.id='debug-panel-style'; st.textContent=css; document.head.appendChild(st);
  })();
})();
