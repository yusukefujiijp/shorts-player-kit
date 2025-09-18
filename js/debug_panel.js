/*!
Project:  shorts-player-kit
File:     js/debug_panel.js
Role:     Debug Panel UI（QuickBar=2段固定 / Stop ACK 可視化 / 展開パネルに状態チップ）
Depends:  window.__player / __ttsFlags / __ttsVoiceMap / __dbgConfig (optional)

/**
 * 重要ポリシー：
 * - このファイルは UI の「構造と状態（data属性/クラス）」のみ制御する。
 * - 見た目（色・余白・サイズ・レイアウト）は style.css が唯一の出所。
 * - 禁止：element.style.* の直接指定、<style> ノード注入、CSSテキスト生成。
 * - 折畳みは data-collapsed="true|false" で行い、CSS が display 等を決定する。
 */

(function(){
  'use strict';

  /* ====================== Config & Defaults ===================== */
  var CFG_IN   = (window.__dbgConfig || {});
  var VOICE_IN = CFG_IN.voice || {};
  var SECTIONS = Object.assign({ status:true, note:false, controls:true, goto:true, ttsFlags:true, voices:true, baseRate:false }, (CFG_IN.sections||{}));
  var BUTTONS  = Object.assign({ prev:true, next:true, play:false, stop:false, restart:true, goto:true, hardreload:true, hardstop:false }, (CFG_IN.buttons||{}));
  var LOCKS    = Object.assign({ allowTTSFlagEdit:true, allowVoiceSelect:true }, (CFG_IN.locks||{}));
  var FLAGS0   = (CFG_IN.ttsFlagsDefault || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true });

  var QUICKBAR = Object.assign({ enabled:true, mode:'twoRows', items:{ play:true, stop:true, ack:true } }, (CFG_IN.quickbar||{}));
  var BADGES   = (CFG_IN.badges && typeof CFG_IN.badges==='object') ? CFG_IN.badges : {};
  var BADGE_MOTION = (BADGES.motion==='static'||BADGES.motion==='off') ? BADGES.motion : 'auto';

  /* =========================== Host ============================= */
  var host = document.getElementById('debug-panel');
  if (!host){ host = document.createElement('div'); host.id='debug-panel'; document.body.appendChild(host); }

  /* =========================== Markup =========================== */
  host.innerHTML =
    '<div class="qb-bar">'+
      '<div class="qb-row row1">'+
        '<button id="dbg-toggle" class="dbg-toggle" title="展開/折り畳み">🐞 Debug <span id="dbg-arrow"></span></button>'+
        (QUICKBAR.items.play? '<button data-act="play" class="qb-btn play" aria-label="Play">▶︎</button>':'')+
        (QUICKBAR.items.stop? '<button data-act="stop" class="qb-btn stop" aria-label="Stop">■</button>':'')+
        (QUICKBAR.items.ack?  '<span id="qb-ack" class="qb-ack is-idle" role="status" aria-live="polite" aria-atomic="true"><span class="qb-dot" aria-hidden="true"></span> Idle</span>':'')+
      '</div>'+
      '<div class="qb-row row2"><span id="dbg-status" class="dbg-status">Ready.</span></div>'+
    '</div>'+
    '<div id="dbg-body" class="dbg-body">'+
      '<div id="dbg-statechips" class="lab-badges" aria-hidden="false"></div>'+
      '<div id="dbg-controls" class="dbg-controls">'+
        (BUTTONS.prev?      '<button data-act="prev">⟵ Prev</button>':'')+
        (BUTTONS.next?      '<button data-act="next">Next ⟶</button>':'')+
        (BUTTONS.restart?   '<button data-act="restart">↻ Restart</button>':'')+
        (BUTTONS.goto?      '<label class="goto"><span>Goto:</span><input id="dbg-goto" type="number" min="1" step="1" inputmode="numeric" placeholder="page#"><button data-act="goto">Go</button></label>':'')+
        (BUTTONS.hardreload?'<button data-act="hardreload" class="warn">⟲ Hard Reload</button>':'')+
        (BUTTONS.hardstop?  '<button data-act="hardstop" class="warn">⛔ Hard Stop</button>':'')+
      '</div>'+
      (SECTIONS.ttsFlags? '<div id="dbg-flags" class="sec"></div>':'')+
      (SECTIONS.voices?   '<div id="dbg-voices" class="sec"></div>':'')+
    '</div>';

  function $(s){ return host.querySelector(s); }
  var body   = $('#dbg-body');
  var tgl    = $('#dbg-toggle');
  var arrow  = $('#dbg-arrow');
  var statusEl = $('#dbg-status');
  var gotoInp  = $('#dbg-goto');
  var ackEl    = $('#qb-ack');
  var chipsEl  = $('#dbg-statechips');

  // 折り畳み（localStorageに保持）→ data-collapsed へ反映
  (function initUI(){
    var key='dbg.panel.collapsed.v3';
    var collapsed=(function(){ try{ var s=localStorage.getItem(key); if(s!=null) return (s==='true'); }catch(_){ } return !!CFG_IN.collapsedDefault; })();
    host.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
    if (arrow) arrow.textContent = collapsed? '▸':'▾';
    if (tgl) tgl.addEventListener('click', function(){
      var now = (host.getAttribute('data-collapsed') === 'false');
      host.setAttribute('data-collapsed', now ? 'true' : 'false');
      if(arrow) arrow.textContent = now ? '▸' : '▾';
      try{ localStorage.setItem(key, String(!now)); }catch(_){}
    });
  })();

  /* ============================ Flags =========================== */
  var FLAGS = (window.__ttsFlags = window.__ttsFlags || Object.assign({}, FLAGS0));
  function h(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=String(txt); return e; }

  function renderFlags(){ if(!SECTIONS.ttsFlags) return; var box=$('#dbg-flags'); if(!box) return; box.innerHTML='';
    box.appendChild(h('h3',null,'TTS Flags'));
    ['readTag','readTitleKey','readTitle','readNarr'].forEach(function(k){
      var id='dbg-flag-'+k; var line=h('div','dbg-row');
      var c=h('input'); c.type='checkbox'; c.id=id; c.checked=!!FLAGS[k];
      c.addEventListener('change', function(){ FLAGS[k]=!!c.checked; try{ localStorage.setItem('dbg.tts.flags.v4', JSON.stringify(FLAGS)); }catch(_){} });
      var lab=h('label'); lab.htmlFor=id; lab.textContent=k;
      line.appendChild(c); line.appendChild(lab); box.appendChild(line);
    });
    try{ var saved=localStorage.getItem('dbg.tts.flags.v4'); if(saved){ var o=JSON.parse(saved); if(o && typeof o==='object') Object.assign(FLAGS, o); } }catch(_){}
  }
  renderFlags();

  /* ============================ Voices ========================== */
  var VOICE_FILTER = { jaOnly: (VOICE_IN.filter && typeof VOICE_IN.filter.jaOnly==='boolean') ? !!VOICE_IN.filter.jaOnly : true };
  function voicesCatalog(){ try{ var arr=(window.__ttsUtils && __ttsUtils.getCatalog && __ttsUtils.getCatalog({ jaOnly: !!VOICE_FILTER.jaOnly }))||[]; return Array.isArray(arr)?arr:[]; }catch(_){ return []; } }
  function currentVoiceId(role){ var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {}); var cur=vm[role]||''; if(cur && typeof cur==='object'){ return cur.id || cur.voiceURI || (((cur.lang||'')+'|'+(cur.name||''))||''); } return cur||''; }

  function renderVoices(){ if(!SECTIONS.voices) return; var box=$('#dbg-voices'); if(!box) return; box.innerHTML=''; box.appendChild(h('h3',null,'Voices'));
    var roles=['tag','titleKey','title','narr'];
    var list=voicesCatalog();
    roles.forEach(function(role){
      var line=h('div','dbg-row');
      line.appendChild(h('span','dbg-row-label',role));
      var sel=h('select');
      var auto=new Option('Auto',''); sel.appendChild(auto);
      list.forEach(function(v){ var id=v.id || v.voiceURI || ((v.lang||'')+'|'+(v.name||'')); var o=new Option((v.label||v.name||id)+' ['+(v.lang||'-')+']', id); sel.appendChild(o); });
      sel.value = currentVoiceId(role);
      sel.onchange = function(){ var id=sel.value; var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {}); if(!id) delete vm[role]; else vm[role]=id; try{ localStorage.setItem('dbg.voice.'+role, id); }catch(_){} };
      box.appendChild(line); line.appendChild(sel);
    });
    var cnt=list.length; var note=h('div',null,'['+cnt+' voices]'); note.style.opacity='.7'; note.style.fontSize='12px'; box.appendChild(note);
  }
  renderVoices();
  try{ if('speechSynthesis' in window){ window.speechSynthesis.addEventListener('voiceschanged', function(){ setTimeout(renderVoices, 0); }, {passive:true}); } }catch(_){ }

  /* ============================ Stop ACK ======================== */
  var stopAck = { pending:false, confirmed:false, ts:0, latencyMs:0, context:'' };
  var ackTimer = 0;

  function setAckIdle(){
    if(!ackEl) return;
    ackEl.className = 'qb-ack is-idle';
    ackEl.innerHTML = '<span class="qb-dot" aria-hidden="true"></span> Idle';
  }

  function setAckPending(){
    if(!ackEl) return;
    ackEl.className = 'qb-ack is-pending';
    ackEl.innerHTML = '<span class="qb-dot" aria-hidden="true"></span> Stopping…';
  }

  function setAckStopped(){
    if(!ackEl) return;
    ackEl.className = 'qb-ack is-stopped';
    ackEl.innerHTML = '<span class="qb-dot" aria-hidden="true"></span> Stopped '+(stopAck.latencyMs|0)+'ms';
    clearTimeout(ackTimer);
    ackTimer = setTimeout(setAckIdle, 1600);
  }

  setAckIdle();

  window.addEventListener('player:stop-ack', function(ev){
    stopAck.pending=true; stopAck.confirmed=false;
    stopAck.ts = (ev && ev.detail && ev.detail.ts) ? ev.detail.ts : Date.now();
    setAckPending();
  });
  window.addEventListener('player:stop-confirm', function(ev){
    stopAck.pending=false; stopAck.confirmed=true;
    stopAck.latencyMs = (ev && ev.detail && ev.detail.latencyMs)|0;
    stopAck.context   = (ev && ev.detail && ev.detail.context)||'';
    setAckStopped();
  });

  /* ============================ Actions ========================= */
  host.addEventListener('click', function(e){
    var t=e.target; while(t && t!==host && !(t.tagName==='BUTTON' && t.hasAttribute('data-act'))) t=t.parentNode;
    if(!t||t===host) return;
    var act=t.getAttribute('data-act')||''; var P=(window.__player||{});
    switch(act){
      case 'prev':     if(P.prev)     P.prev();     break;
      case 'play':     try{ speechSynthesis.cancel(); }catch(_){} if(P.play) P.play(); break;
      case 'stop':     try{ if(P.stop) P.stop(); }catch(_){} break;
      case 'next':     if(P.next)     P.next();     break;
      case 'restart':  if(P.restart)  P.restart();  break;
      case 'goto':     if(P.goto && gotoInp){ var n=(Number(gotoInp.value)|0); if(n>=1) P.goto(n-1); } break;
      case 'hardreload':
        try{ if(P.stopHard) P.stopHard(); }catch(_){}
        try{
          if('caches' in window){
            caches.keys().then(function(xs){ return Promise.all(xs.map(function(k){ return caches.delete(k); })); }).finally(function(){
              var u=new URL(location.href); u.searchParams.set('rev', String(Date.now())); location.replace(String(u));
            });
          }else{
            var u2=new URL(location.href); u2.searchParams.set('rev', String(Date.now())); location.replace(String(u2));
          }
        }catch(_){ location.reload(); }
        break;
      case 'hardstop': try{ if(P.stopHard) P.stopHard(); }catch(_){} break;
    }
  });

  if (gotoInp){
    gotoInp.addEventListener('keydown', function(ev){
      if(ev.key==='Enter'){ var P=(window.__player||{}); var n=(Number(gotoInp.value)|0); if(P.goto && n>=1) P.goto(n-1); }
    });
  }

  /* ========================= Status Polling ===================== */
  function renderLabBadges(ss){
    if(!chipsEl) return;
    var pulse = (BADGE_MOTION==='off') ? '' : (BADGE_MOTION==='auto' ? ' pulse' : '');
    chipsEl.innerHTML =
      '<span class="lab-badge lab-badge--speaking'+(ss.speaking?' on':'')+pulse+'">speaking</span>'+
      '<span class="lab-badge lab-badge--paused'  +(ss.paused  ?' on':'')+pulse+'">paused</span>'+
      '<span class="lab-badge lab-badge--pending' +(ss.pending ?' on':'')+pulse+'">pending</span>';
  }

  var lastIdx=-1, lastTotal=-1;
  (function loop(){
    var P=window.__player||null; if(!P||!P.info){ requestAnimationFrame(loop); return; }
    var info=P.info(), scene=(P.getScene&&P.getScene())||null;
    var ss=(window.speechSynthesis||{});
    renderLabBadges(ss);

    if (statusEl){
      var ver=(scene && (scene.version || scene.type)) || '-';
      statusEl.textContent = 'Page '+(info.index+1)+'/'+info.total+' | '+ver+(info.playing?' | ▶︎ playing':' | ■ idle');
    }
    if(gotoInp && (info.index!==lastIdx || info.total!==lastTotal)){
      gotoInp.placeholder=(info.total>0)?((info.index+1)+' / '+info.total):'page#';
      lastIdx=info.index; lastTotal=info.total;
    }
    requestAnimationFrame(loop);
  })();
})();