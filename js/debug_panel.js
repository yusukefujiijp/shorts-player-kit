/*!
Project:  shorts-player-kit
File:     js/debug_panel.js
Role:     Debug Panel UI（QuickBar=2段固定 / Stop ACK 可視化 / 展開パネルに状態チップ）
Depends:  window.__player / __ttsFlags / __ttsVoiceMap / __dbgConfig (optional)
Policy:
  - このファイルは UI の「構造と状態（data属性/クラス）」のみを制御する。
  - 見た目（色・余白・サイズ・レイアウト）は style.css が唯一の出所。
  - 禁止: element.style.* の直接指定、<style> ノード注入、動的 CSS テキスト生成。
  - 折り畳みは data-collapsed="true|false" で表現し、表示/レイアウトは CSS が決める。
*/
(function(){
  'use strict';

  /* ====================== Config & Defaults ===================== */
  var CFG_IN   = (window.__dbgConfig || {});
  var VOICE_IN = CFG_IN.voice || {};
  var SECTIONS = Object.assign(
    { status:true, note:false, controls:true, goto:true, ttsFlags:true, voices:true, baseRate:false },
    (CFG_IN.sections||{})
  );
  var BUTTONS  = Object.assign(
    { prev:true, next:true, play:false, stop:false, restart:true, goto:true, hardreload:true, hardstop:false },
    (CFG_IN.buttons||{})
  );
  var LOCKS    = Object.assign({ allowTTSFlagEdit:true, allowVoiceSelect:true }, (CFG_IN.locks||{}));
  var FLAGS0   = (CFG_IN.ttsFlagsDefault || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true });

  var QUICKBAR = Object.assign(
    { enabled:true, mode:'twoRows', items:{ play:true, stop:true, next:true, ack:true } },
    (CFG_IN.quickbar||{})
  );
  var BADGES   = (CFG_IN.badges && typeof CFG_IN.badges==='object') ? CFG_IN.badges : {};
  var BADGE_MOTION = (BADGES.motion==='static'||BADGES.motion==='off') ? BADGES.motion : 'auto';

  /* =========================== Host ============================= */
  var host = document.getElementById('debug-panel');
  if (!host){
    host = document.createElement('div');
    host.id='debug-panel';
    document.body.appendChild(host);
  }
  host.setAttribute('data-ready','true'); // 可視化デバッグ用のフラグ（CSSには影響しない）

  /* =========== Panel height → CSS 変数伝搬（rAF合流・一本化） =========== */
  // CSS は --debug-panel-h を参照（旧名 --content-pad-bottom は CSS 側でフォールバック）
  (function initInsetSync(){
    var de = document.documentElement;
    var rafId = 0, dirty = true;
    var ro = null;
    function measureAndApply(){
      rafId = 0; dirty = false;
      try{
        var h = host ? Math.max(0, Math.ceil(host.getBoundingClientRect().height)) : 0;
        // 正準名のみを出力（旧名は CSS フォールバックに委ねる）
        de.style.setProperty('--debug-panel-h', h + 'px');
      }catch(_){}
    }
    function schedule(){
      if (dirty) return;
      dirty = true;
      if (!rafId) rafId = requestAnimationFrame(measureAndApply);
    }
    // 初回（DOM構築直後）
    schedule();
    requestAnimationFrame(schedule); // 遅延描画（フォント/アイコン）対策で追撃
    // パネル自身のサイズ変化
    try{ ro = new ResizeObserver(schedule); ro.observe(host); }catch(_){}
    // ビューポート変化（端末UIのせり上がり等）
    var vv = window.visualViewport;
    if (vv){
      vv.addEventListener('resize', schedule);
      vv.addEventListener('scroll', schedule);
    }
    window.addEventListener('resize', schedule, {passive:true});
    window.addEventListener('orientationchange', function(){ setTimeout(schedule, 50); }, {passive:true});
  })();

  /* =========================== Markup =========================== */
  host.innerHTML =
    '<div class="qb-bar">'+
      '<div class="qb-row row1">'+
        '<button id="dbg-toggle" class="dbg-toggle" title="展開/折り畳み">🐞 Debug <span id="dbg-arrow"></span></button>'+
        (QUICKBAR.items.play? '<button data-act="play" class="qb-btn play" aria-label="Play">▶︎</button>':'')+
        (QUICKBAR.items.stop? '<button data-act="stop" class="qb-btn stop" aria-label="Stop">■</button>':'')+
        (QUICKBAR.items.next? '<button data-act="next" class="qb-btn next" aria-label="Next">➡︎</button>':'')+
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

  //（高さ同期は initInsetSync 内の rAF で自動実行）

  function $(s){ return host.querySelector(s); }
  var tgl      = $('#dbg-toggle');
  var arrow    = $('#dbg-arrow');
  var statusEl = $('#dbg-status');
  var gotoInp  = $('#dbg-goto');
  var ackEl    = $('#qb-ack');
  var chipsEl  = $('#dbg-statechips');

  /* ================== Swipe to Toggle Panel =================== */
  (function initSwipeToToggle(){
    var swipeTarget = $('.qb-bar'); // スワイプ操作の対象はクイックバー
    if (!swipeTarget || !tgl) return; // 対象要素やトグルボタンがなければ何もしない

    var touchStartY = 0;
    var touchCurrentY = 0;
    var isSwiping = false;
    var swipeThreshold = 40; // 40px以上のスワイプで判定

    // スワイプ開始
    swipeTarget.addEventListener('touchstart', function(e){
      // 2本指以上の操作は無視
      if (e.touches.length > 1) return;
      isSwiping = true;
      touchStartY = e.touches[0].clientY;
      touchCurrentY = e.touches[0].clientY;
    }, {passive: true});

    // スワイプ中
    swipeTarget.addEventListener('touchmove', function(e){
      if (!isSwiping) return;
      touchCurrentY = e.touches[0].clientY;
    }, {passive: true});

    // スワイプ終了
    swipeTarget.addEventListener('touchend', function(e){
      if (!isSwiping) return;
      isSwiping = false;

      var deltaY = touchCurrentY - touchStartY;
      var isCollapsed = (host.getAttribute('data-collapsed') === 'true');

      // 上方向へのスワイプ（パネルを開く）
      if (deltaY < -swipeThreshold && isCollapsed) {
        tgl.click(); // 既存のトグルボタンをクリックして開く
      }
      // 下方向へのスワイプ（パネルを閉じる）
      else if (deltaY > swipeThreshold && !isCollapsed) {
        tgl.click(); // 既存のトグルボタンをクリックして閉じる
      }
    }, {passive: true});
  })();

  /* [Hotfix] lightweight logger used by telemetry handlers
     - 呼び出し元: TTS テレメトリ（player:tts-chunk / player:tts-quiet 等）
     - 仕様: 最新行を statusEl に表示、履歴は簡易バッファに保持、console にも出力
     - 依存関係: なし（DOM が未用意でも安全に no-op）
  */
  var __dbgLogStore = [];
  function pushLog(msg){
    var line = String(msg==null ? '' : msg);
    try{
      var ts = new Date().toLocaleTimeString();
      line = '[' + ts + '] ' + line;
    }catch(_){}
    __dbgLogStore.push(line);
    if (__dbgLogStore.length > 200) __dbgLogStore.shift();
    try{ if (statusEl) statusEl.textContent = line; }catch(_){}
    try{ console.log('%c[debug-panel]', 'color:#6cf', line); }catch(_){}
  }

  /* [Hotfix] renderLabBadges が参照時に未定義となるケースの補填
     - 既存仕様: BADGE_MOTION に応じて pulse クラスを付与し speaking/paused/pending を可視化
     - 呼び出し側: loop() 内で毎フレーム呼ばれる（コスト低）
  */
  function renderLabBadges(ss){
    if(!chipsEl) return;
    // BADGE_MOTION は冒頭の設定に基づく（'auto' | 'static' | 'off'）
    var pulse = (BADGE_MOTION==='off') ? '' : (BADGE_MOTION==='auto' ? ' pulse' : '');
    chipsEl.innerHTML =
      '<span class="lab-badge lab-badge--speaking'+(ss && ss.speaking ? ' on' : '')+pulse+'">speaking</span>'+
      '<span class="lab-badge lab-badge--paused'  +(ss && ss.paused   ? ' on' : '')+pulse+'">paused</span>'+
      '<span class="lab-badge lab-badge--pending' +(ss && ss.pending  ? ' on' : '')+pulse+'">pending</span>';
  }

  // 折り畳み（localStorageに保持）→ data-collapsed & .collapsedへ反映（両互換）
  (function initUI(){
    var key='dbg.panel.collapsed.v3';
    var collapsed=(function(){
      try{ var s=localStorage.getItem(key); if(s!=null) return (s==='true'); }catch(_){}
      return !!CFG_IN.collapsedDefault;
    })();

    host.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
    host.classList.toggle('collapsed', !!collapsed);
    if (arrow) arrow.textContent = collapsed? '▸':'▾';

    if (tgl) tgl.addEventListener('click', function(){
      var now = (host.getAttribute('data-collapsed') === 'false');
      var willCollapsed = now ? 'true' : 'false';
      host.setAttribute('data-collapsed', willCollapsed);
      host.classList.toggle('collapsed', willCollapsed === 'true');
      if(arrow) arrow.textContent = (willCollapsed==='true') ? '▸' : '▾';
      try{ localStorage.setItem(key, String(willCollapsed==='true')); }catch(_){}
      // setTimeout(syncPanelInset, 0); // 高さ同期は ResizeObserver が自動で行う
    });
  })();

  /* ============================ Flags =========================== */
  var FLAGS = (window.__ttsFlags = window.__ttsFlags || Object.assign({}, FLAGS0));
  function h(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=String(txt); return e; }

  function renderFlags(){
    if(!SECTIONS.ttsFlags) return;
    var box=$('#dbg-flags'); if(!box) return;
    box.innerHTML='';
    box.appendChild(h('h3',null,'TTS Flags'));
    ['readTag','readTitleKey','readTitle','readNarr'].forEach(function(k){
      var id='dbg-flag-'+k;
      var line=h('div','dbg-row');
      var c=h('input'); c.type='checkbox'; c.id=id; c.checked=!!FLAGS[k];
      c.addEventListener('change', function(){
        FLAGS[k]=!!c.checked;
        try{ localStorage.setItem('dbg.tts.flags.v4', JSON.stringify(FLAGS)); }catch(_){}
      });
      var lab=h('label'); lab.htmlFor=id; lab.textContent=k;
      line.appendChild(c); line.appendChild(lab); box.appendChild(line);
    });
    try{
      var saved=localStorage.getItem('dbg.tts.flags.v4');
      if(saved){ var o=JSON.parse(saved); if(o && typeof o==='object') Object.assign(FLAGS, o); }
    }catch(_){}
  }
  renderFlags();

  /* ============================ Voices ========================== */
  var VOICE_FILTER = { jaOnly: (VOICE_IN.filter && typeof VOICE_IN.filter.jaOnly==='boolean') ? !!VOICE_IN.filter.jaOnly : true };
  function voicesCatalog(){
    try{
      var arr=(window.__ttsUtils && __ttsUtils.getCatalog && __ttsUtils.getCatalog({ jaOnly: !!VOICE_FILTER.jaOnly }))||[];
      return Array.isArray(arr)?arr:[];
    }catch(_){ return []; }
  }
  function currentVoiceId(role){
    var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {});
    var cur=vm[role]||'';
    if(cur && typeof cur==='object'){
      return cur.id || cur.voiceURI || (((cur.lang||'')+'|'+(cur.name||''))||'');
    }
    return cur||'';
  }

  function renderVoices(){
    if(!SECTIONS.voices) return;
    var box=$('#dbg-voices'); if(!box) return;
    box.innerHTML='';
    box.appendChild(h('h3',null,'Voices'));
    var roles=['tag','titleKey','title','narr'];
    var list=voicesCatalog();
    roles.forEach(function(role){
      var line=h('div','dbg-row');
      line.appendChild(h('span','dbg-row-label',role));
      var sel=h('select');
      var auto=new Option('Auto',''); sel.appendChild(auto);
      list.forEach(function(v){
        var id=v.id || v.voiceURI || ((v.lang||'')+'|'+(v.name||''));
        var o=new Option((v.label||v.name||id)+' ['+(v.lang||'-')+']', id);
        sel.appendChild(o);
      });
      sel.value = currentVoiceId(role);
      sel.onchange = function(){
        var id=sel.value;
        var vm=(window.__ttsVoiceMap = window.__ttsVoiceMap || {});
        if(!id) delete vm[role]; else vm[role]=id;
        try{ localStorage.setItem('dbg.voice.'+role, id); }catch(_){}
      };
      box.appendChild(line); line.appendChild(sel);
    });
    var cnt=list.length;
    var note=h('div','voices-note','['+cnt+' voices]');
    box.appendChild(note);
  }
  renderVoices();
  try{
    if('speechSynthesis' in window){
      window.speechSynthesis.addEventListener('voiceschanged', function(){ setTimeout(renderVoices, 0); }, {passive:true});
    }
  }catch(_){}

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

  /* ====================== TTS chunk telemetry ==================== */
  var lastChunkNote = '';
  window.addEventListener('player:tts-chunk', function(ev){
    var d=ev && ev.detail || {};
    var tag = (d.phase||'') + ' ' + (d.index||0)+'/'+(d.total||0);
    if (d.ms!=null) tag += ' '+(d.ms|0)+'ms';
    lastChunkNote = '[chunk '+tag+']';
    pushLog('tts:'+lastChunkNote+' len='+((d.len|0))+(d.reason?(' '+d.reason):''));
  }, {passive:true});
  window.addEventListener('player:tts-quiet', function(ev){
    var d=ev && ev.detail || {};
    pushLog('quiet: '+(d.passed?'ok':'skip')+' '+(d.quietMs|0)+'ms @'+(d.index||0)+'/'+(d.total||0));
  }, {passive:true});

  /* ============================ Actions ========================= */
  host.addEventListener('click', function(e){
    var t=e.target;
    while(t && t!==host && !(t.tagName==='BUTTON' && t.hasAttribute('data-act'))) t=t.parentNode;
    if(!t||t===host) return;
    var act=t.getAttribute('data-act')||'';
    var P=(window.__player||{});
    switch(act){
      case 'prev':     if(P.prev)     P.prev();     break;
      case 'play':     try{ speechSynthesis.cancel(); }catch(_){ } if(P.play) P.play(); break;
      case 'stop':     try{ if(P.stop) P.stop(); }catch(_){ } break;
      case 'next':     if(P.next)     P.next();     break;
      case 'restart':  if(P.restart)  P.restart();  break;
      case 'goto':
        if(P.goto && gotoInp){
          var n=(Number(gotoInp.value)|0); if(n>=1) P.goto(n-1);
        }
        break;
      case 'hardreload':
        try{ if(P.stopHard) P.stopHard(); }catch(_){}
        try{
          if('caches' in window){
            caches.keys().then(function(xs){ return Promise.all(xs.map(function(k){ return caches.delete(k); })); })
              .finally(function(){
                var u=new URL(location.href);
                u.searchParams.set('rev', String(Date.now()));
                location.replace(String(u));
              });
          }else{
            var u2=new URL(location.href);
            u2.searchParams.set('rev', String(Date.now()));
            location.replace(String(u2));
          }
        }catch(_){ location.reload(); }
        break;
      case 'hardstop':
        try{ if(P.stopHard) P.stopHard(); }catch(_){}
        break;
    }
  });

  if (gotoInp){
    gotoInp.addEventListener('keydown', function(ev){
      if(ev.key==='Enter'){
        var P=(window.__player||{});
        var n=(Number(gotoInp.value)|0);
        if(P.goto && n>=1) P.goto(n-1);
      }
    });
  }

  /* ====================== Event-driven Status =================== */
  window.addEventListener('player:tts-state', function(ev){
    try{
      var d=(ev && ev.detail)||{};
      // renderLabBadgesFromState から renderLabBadges への統合
      renderLabBadges(d);
    }catch(_){}
  });

  window.addEventListener('player:status', function(ev){
    try{
      if(!statusEl) return;
      var d=(ev && ev.detail)||{};
      var idx=(d.index|0)||0, total=(d.total|0)||0;
      // This is now mainly handled by pushLog, but we keep a basic page status update
      // for cases where no logs are being generated.
      var currentPageStatus = 'Page '+(idx+1)+'/'+total+(d.playing?' | ▶︎ playing':' | ■ idle');
      // Only update if the status is not already showing a recent log message
      if(!statusEl.textContent.startsWith('[')) {
        statusEl.textContent = currentPageStatus;
      }
    }catch(_){}
  });

  /* ========================= Fallback Loop ====================== */
  // 既存互換: イベントが来なくても最低限の表示を維持
  var lastIdx=-1, lastTotal=-1;
  (function loop(){
    var P=window.__player||null; if(!P||!P.info){ requestAnimationFrame(loop); return; }
    var info=P.info(), scene=(P.getScene&&P.getScene())||null;
    var ss=(window.speechSynthesis||{});
    renderLabBadges(ss); // ← 定義済み（欠落対策済み）

    if (gotoInp && (info.index!==lastIdx || info.total!==lastTotal)){
      gotoInp.placeholder=(info.total>0)?((info.index+1)+' / '+info.total):'page#';
      lastIdx=info.index; lastTotal=info.total;
    }
    // 高さ同期は initInsetSync の rAF に集約済み
    requestAnimationFrame(loop);
  })();
})();