/*!
Project:  shorts-player-kit
File:     js/debug_panel.js
Role:     Debug Panel (Stop手応えの可視化 + Hard Stopラボ機能 + 既存操作/フラグ/ボイス)
Depends:  window.__player / __playerCore / __ttsFlags / __ttsVoiceMap / __dbgConfig (optional)
Notes (delta):
  - Stop＝ページ末停止の“手応え”をUI化（即時ACK/確定ACKの表示）
  - Hard Stop（強制停止）ボタンをラボ機能として追加（debug_config.js の buttons.hardstop で露出制御）
  - 状態ダッシュボード：page index / playingLock / stopRequested / stopped / speechSynthesis 状態（speaking/paused/pending）
  - 既存の操作（prev/next/play/stop/restart/goto/hardreload）と TTS フラグ／ボイス選択を維持
  - 依存：player.core.js が発火する CustomEvent
      - 'player:stop-ack'       { ts }
      - 'player:stop-confirm'  { latencyMs, context }
*/

(function(){
  'use strict';

  /* ====================== Config & Defaults ===================== */
  var CFG_IN = (window.__dbgConfig || {});
  var VOICE_IN = CFG_IN.voice || {};
  var SECTIONS = Object.assign({ status:true, note:false, controls:true, goto:true, ttsFlags:true, voices:true, baseRate:false }, (CFG_IN.sections||{}));
  var BUTTONS  = Object.assign({ prev:true, next:true, play:true, stop:true, restart:true, goto:true, hardreload:true, hardstop:false }, (CFG_IN.buttons||{}));
  var LOCKS    = Object.assign({ allowTTSFlagEdit:true, allowVoiceSelect:true }, (CFG_IN.locks||{}));
  var RATE     = Object.assign({ min:0.5, max:2.0, step:0.1 }, (CFG_IN.rate||{}));
  var ROLES    = Object.assign({ min:0.5, max:2.0, step:0.1, defaultAbs:1.4 }, (CFG_IN.rolesRate||{}));
  var FLAGS0   = (CFG_IN.ttsFlagsDefault || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true });
  var PERSIST  = Object.assign({
    panelCollapsedKey:'dbg.panel.collapsed.v3',
    ttsFlagsKey:'dbg.tts.flags.v4',
    roleRatesKey:'dbg.tts.role.v3',
    voiceTagKey:'dbg.voice.tag',
    voiceTitleKeyKey:'dbg.voice.titleKey',
    voiceTitleKey:'dbg.voice.title',
    voiceNarrKey:'dbg.voice.narr'
  }, (CFG_IN.persist||{}));
  var VOICE_DEF = Object.assign({ tag:null, titleKey:null, title:null, narr:null }, (VOICE_IN.defaults||{}));
  var VOICE_FILTER = { jaOnly: (VOICE_IN.filter && typeof VOICE_IN.filter.jaOnly==='boolean') ? !!VOICE_IN.filter.jaOnly : true };

  /* =========================== Host ============================= */
  var host = document.getElementById('debug-panel');
  if (!host){ host = document.createElement('div'); host.id='debug-panel'; document.body.appendChild(host); }
  function rootStyle(el){ el.style.position='fixed'; el.style.left='0'; el.style.right='0'; el.style.bottom='0'; el.style.zIndex='2147483647'; el.style.pointerEvents='auto'; el.style.fontFamily='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; el.style.color='#fff'; el.style.boxSizing='border-box'; el.style.paddingLeft='env(safe-area-inset-left,0px)'; el.style.paddingRight='env(safe-area-inset-right,0px)'; }
  function styleBtn(b){ b.style.appearance='none'; b.style.border='1px solid var(--b, rgba(255,255,255,.35))'; b.style.background='var(--bg, rgba(255,255,255,.08))'; b.style.color='#fff'; b.style.borderRadius='6px'; b.style.cursor='pointer'; b.style.fontSize='12px'; b.style.lineHeight='1'; b.style.padding='0 10px'; b.style.height='34px'; b.style.minHeight='34px'; }
  function styleField(el,minW){ el.style.border='1px solid rgba(255,255,255,.25)'; el.style.background='rgba(0,0,0,.20)'; el.style.color='#fff'; el.style.borderRadius='6px'; el.style.fontSize='12px'; el.style.lineHeight='1.1'; el.style.padding='0 8px'; el.style.height='34px'; el.style.minHeight='34px'; if(minW) el.style.minWidth=minW; }
  function styleCheck(c){ c.style.width='16px'; c.style.height='16px'; c.style.minHeight='0'; c.style.verticalAlign='middle'; }
  function h(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=String(txt); return e; }
  function btn(label, cls){ var b=h('button','dbg-btn '+(cls||''), label); return b; }
  function badge(label, cls){ var s=h('span','dbg-badge '+(cls||''), label); return s; }
  function row(label, value){ var r=h('div','dbg-row'); r.appendChild(h('span','dbg-row-label',label)); var v=h('span','dbg-row-val'); if(value!=null) v.textContent=String(value); r.appendChild(v); return {root:r, val:v}; }

  rootStyle(host);
  host.innerHTML =
    '<div class="dbg-bar" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(0,0,0,.82);border-top:1px solid rgba(255,255,255,.15);backdrop-filter:blur(4px);">'+
      '<button id="dbg-toggle" title="展開/折り畳み" style="--b:rgba(255,255,255,.35);--bg:rgba(255,255,255,.10);">🐞 Debug <span id="dbg-arrow"></span></button>'+
      '<span id="dbg-status" style="font-size:12px;opacity:.95">Ready.</span>'+
    '</div>'+
    '<div id="dbg-body" style="max-height:46vh;overflow:auto;padding:8px;background:rgba(0,0,0,.70);border-top:1px solid rgba(255,255,255,.15);padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));">'+
      '<div id="dbg-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'+
        (BUTTONS.prev?      '<button data-act="prev">⟵ Prev</button>':'')+
        (BUTTONS.play?      '<button data-act="play" style="--b:rgba(0,200,255,.55);--bg:rgba(0,200,255,.18);">▶︎ Play</button>':'')+
        (BUTTONS.stop?      '<button data-act="stop" style="--b:rgba(255,120,120,.55);--bg:rgba(255,120,120,.18);">■ Stop</button>':'')+
        (BUTTONS.next?      '<button data-act="next">Next ⟶</button>':'')+
        (BUTTONS.restart?   '<button data-act="restart">↻ Restart</button>':'')+
        (BUTTONS.goto?      '<label class="goto" style="display:inline-flex;align-items:center;gap:6px;margin-left:6px;"><span style="font-size:12px;opacity:.9;">Goto:</span><input id="dbg-goto" type="number" min="1" step="1" inputmode="numeric" placeholder="page#" style="width:72px;"><button data-act="goto">Go</button></label>':'')+
        (BUTTONS.hardreload?'<button data-act="hardreload" class="warn">⟲ Hard Reload</button>':'')+
        (BUTTONS.hardstop?  '<button data-act="hardstop" class="warn">⛔ Hard Stop</button>':'')+
      '</div>'+
      '<div id="dbg-ack" style="margin:4px 0 8px 0;font-size:12px;display:none;"></div>'+
      (SECTIONS.baseRate?('<div id="dbg-rate" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0;">'+
        '<span style="opacity:.85;font-size:12px;">Rate:</span>'+
        '<input id="rateRange" type="range" style="width:200px;height:28px;">'+
        '<input id="rateNum" type="number" style="width:70px;">'+
      '</div>'):'')+
      (SECTIONS.ttsFlags?('<div id="dbg-flags" class="sec"></div>'):'')+
      (SECTIONS.voices?('<div id="dbg-voices" class="sec"></div>'):'')+
      (SECTIONS.status?('<div id="dbg-statusbox" class="sec"></div>'):'')+
    '</div>';

  function $(s){ return host.querySelector(s); }
  var bar=$('.dbg-bar'), body=$('#dbg-body'), tgl=$('#dbg-toggle'), arrow=$('#dbg-arrow');
  var statusEl=$('#dbg-status'), gotoInp=$('#dbg-goto');
  var ackEl=$('#dbg-ack');

  // 開閉
  (function initUI(){
    var collapsed = (function(){ try{ var s=localStorage.getItem(PERSIST.panelCollapsedKey); if(s!=null) return (s==='true'); }catch(_){} return !!CFG_IN.collapsedDefault; })();
    if (arrow) arrow.textContent = collapsed ? '▸':'▾';
    if (body)  body.style.display = collapsed ? 'none':'block';
    if (tgl) tgl.addEventListener('click', function(){ var now=(body && body.style.display!=='none'); if(body) body.style.display= now? 'none':'block'; if(arrow) arrow.textContent = now? '▸':'▾'; try{ localStorage.setItem(PERSIST.panelCollapsedKey, String(!now)); }catch(_){} });
  })();

  /* ============================ Flags =========================== */
  var FLAGS = (window.__ttsFlags = window.__ttsFlags || Object.assign({}, FLAGS0));
  function renderFlags(){ if(!SECTIONS.ttsFlags) return; var box=$('#dbg-flags'); if(!box) return; box.innerHTML='';
    var title=h('h3',null,'TTS Flags'); box.appendChild(title);
    ['readTag','readTitleKey','readTitle','readNarr'].forEach(function(k){
      var id='dbg-flag-'+k; var line=h('div');
      var c=h('input'); c.type='checkbox'; c.id=id; c.checked=!!FLAGS[k]; styleCheck(c);
      c.onchange=function(){ FLAGS[k]=!!c.checked; try{ localStorage.setItem(PERSIST.ttsFlagsKey, JSON.stringify(FLAGS)); }catch(_){} };
      var lab=h('label'); lab.htmlFor=id; lab.textContent=k;
      line.appendChild(c); line.appendChild(lab); box.appendChild(line);
    });
    try{ var saved=localStorage.getItem(PERSIST.ttsFlagsKey); if(saved){ var o=JSON.parse(saved); if(o && typeof o==='object') Object.assign(FLAGS, o); } }catch(_){ }
  }
  renderFlags();

  /* ============================ Voices ========================== */
  function voicesCatalog(){ try{ var arr=(window.__ttsUtils && __ttsUtils.getCatalog && __ttsUtils.getCatalog({ jaOnly: !!VOICE_FILTER.jaOnly }))||[]; return Array.isArray(arr)?arr:[]; }catch(_){ return []; } }
  function currentVoiceId(role){ var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {}); var cur=vm[role]||''; if(cur && typeof cur==='object'){ return cur.id || cur.voiceURI || (((cur.lang||'')+'|'+(cur.name||''))||''); } return cur||''; }
  function renderVoices(){ if(!SECTIONS.voices) return; var box=$('#dbg-voices'); if(!box) return; box.innerHTML=''; box.appendChild(h('h3',null,'Voices'));
    var roles=['tag','titleKey','title','narr'];
    var list=voicesCatalog();
    roles.forEach(function(role){
      var line=h('div','dbg-row');
      line.appendChild(h('span','dbg-row-label',role));
      var sel=h('select'); styleField(sel,'140px');
      var auto=new Option('Auto',''); sel.appendChild(auto);
      list.forEach(function(v){ var id=v.id || v.voiceURI || ((v.lang||'')+'|'+(v.name||'')); var o=new Option((v.label||v.name||id)+' ['+(v.lang||'-')+']', id); sel.appendChild(o); });
      sel.value = currentVoiceId(role);
      sel.onchange = function(){ var id=sel.value; var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {}); if(!id) delete vm[role]; else vm[role]=id; try{ localStorage.setItem('dbg.voice.'+role, id); }catch(_){} };
      box.appendChild(line); line.appendChild(sel);
    });
    var cnt=list.length; var note=h('div',null,'['+cnt+' voices]'); note.style.opacity='.7'; note.style.fontSize='12px'; box.appendChild(note);
    var rf=btn('Refresh Voices'); rf.onclick=function(){ try{ if(window.speechSynthesis){ var u=new SpeechSynthesisUtterance(' '); u.volume=0; u.lang='ja-JP'; u.onend=function(){ setTimeout(renderVoices,0); }; try{ speechSynthesis.speak(u); }catch(_){} } }catch(_){} setTimeout(renderVoices,300); setTimeout(renderVoices,1200); };
    styleBtn(rf); box.appendChild(rf);
  }
  renderVoices();
  try{ if('speechSynthesis' in window){ window.speechSynthesis.addEventListener('voiceschanged', function(){ setTimeout(renderVoices, 0); }, {passive:true}); } }catch(_){ }

  /* ============================ Status ========================== */
  var stopAck = { pending:false, confirmed:false, ts:0, latencyMs:0, context:'' };
  function showAckPending(){ if(!ackEl) return; ackEl.style.display='block'; ackEl.innerHTML='Stop: '+('<span class="dbg-badge off">Stopping…</span>'); }
  function showAckStopped(){ if(!ackEl) return; ackEl.style.display='block'; ackEl.innerHTML='Stop: '+('<span class="dbg-badge on">Stopped</span>')+' <span style="opacity:.7">'+(stopAck.latencyMs|0)+'ms</span>'+(stopAck.context? ' <span style="opacity:.7">['+stopAck.context+']</span>':'' ); }
  function clearAck(){ if(!ackEl) return; ackEl.style.display='none'; ackEl.innerHTML=''; }

  window.addEventListener('player:stop-ack', function(ev){ stopAck.pending=true; stopAck.confirmed=false; stopAck.ts = (ev && ev.detail && ev.detail.ts) ? ev.detail.ts : Date.now(); showAckPending(); });
  window.addEventListener('player:stop-confirm', function(ev){ stopAck.pending=false; stopAck.confirmed=true; stopAck.latencyMs = (ev && ev.detail && ev.detail.latencyMs)|0; stopAck.context = (ev && ev.detail && ev.detail.context)||''; showAckStopped(); });

  /* ============================ Actions ========================= */
  function hardReload(){ try{ if('caches' in window){ caches.keys().then(function(xs){ return Promise.all(xs.map(function(k){ return caches.delete(k); })); }).finally(function(){ var u=new URL(location.href); u.searchParams.set('rev', String(Date.now())); location.replace(String(u)); }); } else { var u=new URL(location.href); u.searchParams.set('rev', String(Date.now())); location.replace(String(u)); } }catch(_){ location.reload(); } }

  host.addEventListener('click', function(e){ var t=e.target; while(t && t!==host && !(t.tagName==='BUTTON' && t.hasAttribute('data-act'))) t=t.parentNode; if(!t||t===host) return; var act=t.getAttribute('data-act')||''; var P=(window.__player||{});
    switch(act){
      case 'prev':     clearAck(); if(P.prev)     P.prev();     break;
      case 'play':     clearAck(); try{ speechSynthesis.cancel(); }catch(_){} if(P.play)     P.play();     break;
      case 'stop':     try{ if(P.stop) P.stop(); }catch(_){} break; // 既定: ページ末停止（手応えはACKで可視化）
      case 'next':     clearAck(); if(P.next)     P.next();     break;
      case 'restart':  clearAck(); if(P.restart)  P.restart();  break;
      case 'goto':     clearAck(); if(P.goto && gotoInp){ var n=(Number(gotoInp.value)|0); if(n>=1) P.goto(n-1); } break;
      case 'hardreload': try{ if(P.stopHard) P.stopHard(); }catch(_){} hardReload(); break;
      case 'hardstop':  try{ if(P.stopHard) P.stopHard(); }catch(_){} break;
      default: break;
    }
  });

  if (gotoInp){ gotoInp.addEventListener('keydown', function(ev){ if(ev.key==='Enter'){ var P=(window.__player||{}); clearAck(); var n=(Number(gotoInp.value)|0); if(P.goto && n>=1) P.goto(n-1); } }); }

  /* ========================= Status Polling ===================== */
  var lastIdx=-1, lastTotal=-1; (function loop(){ var P=window.__player||null; if(!P||!P.info){ requestAnimationFrame(loop); return; } var info=P.info(), scene=(P.getScene&&P.getScene())||null; if(statusEl){ var ver=(scene && (scene.version || scene.type)) || '-'; var ss=(window.speechSynthesis||{}); var sbadge = '<span class="dbg-badge '+(ss.speaking?'on':'')+'">speaking</span>'+'<span class="dbg-badge '+(ss.paused?'on':'')+'">paused</span>'+'<span class="dbg-badge '+(ss.pending?'on':'')+'">pending</span>'; var base='Page '+(info.index+1)+'/'+info.total+' | '+ver+(info.playing?' | ▶︎ playing':' | ■ idle')+' | '+sbadge; statusEl.innerHTML=base; } if(gotoInp && (info.index!==lastIdx || info.total!==lastTotal)){ gotoInp.placeholder=(info.total>0)?((info.index+1)+' / '+info.total):'page#'; lastIdx=info.index; lastTotal=info.total; } requestAnimationFrame(loop); })();

  /* ============================ Minimal CSS ===================== */
  (function injectCSS(){ if(document.getElementById('debug-panel-style')) return; var css=[
    '#debug-panel .dbg-btn.warn{background:#fff5f5;border-color:#ffd5d5;color:#b00020;}',
    '#debug-panel .dbg-badge{display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#eee;font-size:11px;}',
    '#debug-panel .dbg-badge.on{background:#dff6dd;color:#137333;}',
    '#debug-panel .dbg-badge.off{background:#fde7e9;color:#a61b2b;}',
    '#debug-panel .dbg-row{display:flex;align-items:center;gap:8px;margin:4px 0;}',
    '#debug-panel .dbg-row-label{opacity:.7;min-width:72px;}',
    '#debug-panel h3{margin:6px 0 4px 0; font-size:12px; opacity:.75;}',
  ].join('\n'); var st=document.createElement('style'); st.id='debug-panel-style'; st.textContent=css; document.head.appendChild(st); })();
})();
