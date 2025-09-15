/*!
Project:  shorts-player-kit
File:     js/player.core.js
Role:     Player Core (Stop→Gotoサイレント/soft-stop＋TTS安定)
Notes (delta):
  - Stop＝現在ページへ「サイレントGoto」＋ pause() に再定義（音優先）
  - playScene/runContentSpeech に opts.silent を導入（silent 時は発話・自動遷移なし）
  - ensureResumed() を新設：再生系操作の先頭で resume() を徹底
  - Hard Stop は例外API（__player.stopHard）として cancel() を隔離し整定待機
  - 初回活性（ユーザー操作内の可聴ワンショット）を維持
  - speakパイプ: scrub → stripMarkdownLight → runtime speechFixes → speakOrWait
*/

(() => {
  'use strict';

  /* ======================= Feature flags ======================= */
  const TTS_ENABLED = (typeof window.TTS_ENABLED === 'boolean') ? window.TTS_ENABLED : true;
  window.__ttsFlags = window.__ttsFlags || { readTag: true, readTitleKey: true, readTitle: true, readNarr: true };

  /* ======================= Core State ========================== */
  const State = { scenes: [], idx: 0, playingLock: false };
  const Ctrl  = {
    stopped: false,         // Stop（Gotoサイレント）状態
    lastCancelAt: 0,        // 直近 cancel() 時刻（Hard Stop用）
    activationDone: false   // 初回可聴ワンショット済み
  };

  /* ======================= Utils =============================== */
  const nowMs = () => (performance && performance.now ? performance.now() : Date.now());
  const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms|0)));

  /* =================== Activation (first user tap) ============= */
  function installActivationOnce() {
    if (Ctrl.activationDone || !('speechSynthesis' in window)) return;
    const handler = () => {
      if (Ctrl.activationDone) return;
      Ctrl.activationDone = true;
      try {
        const u = new SpeechSynthesisUtterance('あ'); // 可聴・極短
        u.lang = 'ja-JP'; u.rate = 1.0; u.volume = 0.06;
        speechSynthesis.speak(u);
      } catch (_) {}
      ['pointerdown','click','touchend','keydown'].forEach(t => document.removeEventListener(t, handler, true));
    };
    ['pointerdown','click','touchend','keydown'].forEach(t => document.addEventListener(t, handler, {capture:true, once:true}));
  }
  installActivationOnce(); // iOS系の自動再生規制に対処（初回はユーザー操作内が安全）。 [oai_citation:6‡developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay?utm_source=chatgpt.com)

  /* =================== Background / Version / Color ============ */
  function ensureBgLayer() {
    let bg = document.getElementById('bgColor');
    if (!bg) { bg = document.createElement('div'); bg.id = 'bgColor'; document.body.insertBefore(bg, document.body.firstChild || null); }
    const s = bg.style;
    s.position = 'fixed'; s.left = s.top = '0'; s.right = s.bottom = '0';
    s.zIndex = '0'; s.pointerEvents = 'none';
    s.transition = s.transition || 'background-color 1.2s ease';
    s.transform = 'translateZ(0)';
    return bg;
  }
  let __bannerDefault = '';
  function setBannerText(txt) {
    try { const el = document.getElementById('banner'); if (!el) return; const s = String(txt || '').trim(); el.textContent = s || ' '; } catch (_) {}
  }
  function setBg(c) { try { if (!c) return; document.body.style.backgroundColor = c; ensureBgLayer().style.backgroundColor = c; } catch (_) {} }
  function applyVersionToBody(scene) {
    const v = (scene && (scene.version || scene.uiVersion)) || 'A';
    const b = document.body;
    b.classList.remove('version-A', 'version-B', 'version-T');
    b.classList.add(v === 'B' ? 'version-B' : v === 'T' ? 'version-T' : 'version-A');
  }
  function applyReadableTextColor(base, el) {
    try {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(base || '').trim()); if (!m) return;
      const h = m[1], r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      const Y = 0.299*r + 0.587*g + 0.114*b;
      (el || document.getElementById('content') || document.body).style.color = (Y < 140) ? '#fff' : '#111';
    } catch (_) {}
  }

  /* ========================= Scene Surface ===================== */
  function ensureSceneSurface() {
    ensureBgLayer();
    let root = document.getElementById('content');
    if (!root) { root = document.createElement('div'); root.id = 'content';
      root.style.cssText = 'position:relative;z-index:10;width:100%;text-align:center;';
      document.body.appendChild(root);
    }
    root.innerHTML = '';
    return root;
  }
  function createSceneShell() { const el = document.createElement('div'); el.className = 'scene'; return el; }
  function setTextInScene(sceneEl, selector, text) {
    let el = sceneEl.querySelector(selector);
    if (!el) { el = document.createElement('div'); el.className = selector.replace(/^[.#]/,''); sceneEl.appendChild(el); }
    el.textContent = String(text || '');
    if (selector === '.narr') el.style.whiteSpace = 'pre-line';
  }
  function setText(idOrKey, s) {
    const map = { title_key: '.title_key', titleKey: '.title_key', title: '.title', symbol: '.symbol', narr: '.narr' };
    const sel = map[idOrKey] || '.narr', root = document.getElementById('content'); if (!root) return;
    const sc = root.querySelector('.scene') || root; setTextInScene(sc, sel, s);
  }

  /* ========================= Effects Hook ====================== */
  function runEffectIfAny(scene, anchor) {
    if (!scene || !scene.effect) return;
    if (!window.__effects || typeof __effects.run !== 'function') return;
    try { __effects.run(scene.effect, anchor || document.body, scene); } catch (_) {}
  }

  /* ========================= Voices (non-blocking) ============= */
  function getVoicesSafe() { try { return window.speechSynthesis.getVoices() || []; } catch (_) { return []; } }
  let jpVoice = null;
  function refreshJPVoice() {
    const list = getVoicesSafe();
    jpVoice = list.find(v => /^ja(-JP)?/i.test(v.lang)) || list.find(v => /日本語/.test(v.name)) || null;
  }
  refreshJPVoice();
  try { window.speechSynthesis.addEventListener('voiceschanged', () => { refreshJPVoice(); }); } catch (_) {} // 声一覧は遅延到着。 [oai_citation:7‡developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event?utm_source=chatgpt.com)

  function voiceById(key) {
    if (!key) return null;
    const list = getVoicesSafe();
    let v = list.find(x => x.voiceURI === key); if (v) return v;
    if (key.includes('|')) { const [lang,name] = key.split('|'); v = list.find(x => x.lang === lang && x.name === name); if (v) return v; }
    return list.find(x => x.name === key) || list.find(x => x.lang === key) || null;
  }
  function chooseVoice(role) {
    const vm = window.__ttsVoiceMap || {}, map = vm[role];
    if (map) {
      if (typeof map === 'string') { const v = voiceById(map); if (v) return v; }
      else if (map && typeof map === 'object') {
        try { if (typeof SpeechSynthesisVoice !== 'undefined' && map instanceof SpeechSynthesisVoice) return map; } catch (_) {}
        const key = map.voiceURI || ((map.lang||'') + '|' + (map.name||'')); const v = voiceById(key); if (v) return v;
      }
    }
    try { if (window.__ttsUtils && typeof __ttsUtils.pick === 'function') { const p = __ttsUtils.pick(role); if (p && p.id) { const v = voiceById(p.id); if (v) return v; } } } catch (_) {}
    return jpVoice || null; // 未到着でも u.voice 未設定で開始可。 [oai_citation:8‡developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis?utm_source=chatgpt.com)
  }

  /* ========================= TTS Rate ========================== */
  function clampAbs(v){ const n = Number(v); if (!Number.isFinite(n)) return 1.4; return Math.max(0.5, Math.min(2.0, n)); }
  function effRateFor(role='narr', base=1.4){ try { if (window.__ttsUtils && typeof __ttsUtils.getRateForRole==='function') return clampAbs(__ttsUtils.getRateForRole(base, role)); } catch(_){} return clampAbs(base); }
  function rateFor(role='narr'){ return effRateFor(role, 1.4); }

  /* ========================= Priming =========================== */
  async function primeTTS() {
    if (!TTS_ENABLED || window.ttsPrimed) return;
    await new Promise(res => {
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.lang = 'ja-JP'; const v = chooseVoice('narr') || jpVoice; if (v) u.voice = v;
        u.volume = 0; u.rate = 1.0;
        let done=false; const fin=()=>{ if(!done){done=true; window.ttsPrimed=true; res();} };
        u.onend=fin; u.onerror=fin; speechSynthesis.speak(u);
        setTimeout(fin, 800);
      } catch(_){ window.ttsPrimed=true; res(); }
    });
  }

  /* ========================= Markdown / Scrub ================== */
  function stripMarkdownLight(s){
    return String(s||'')
      .replace(/\*\*(.+?)\*\*/g,'$1')
      .replace(/__(.+?)__/g,'$1')
      .replace(/\*(.+?)\*/g,'$1')
      .replace(/_(.+?)_/g,'$1')
      .replace(/`([^`]+)`/g,'$1')
      .replace(/$begin:math:display$([^$end:math:display$]+)\]$begin:math:text$([^)]+)$end:math:text$/g,'$1')
      .replace(/$begin:math:display$([^$end:math:display$]+)\]/g,'$1');
  }
  function getSpeechFixes(){ try { const o = window.speechFixes; return (o && typeof o==='object') ? o : {}; } catch(_){ return {}; } }
  function scrub(text){
    let s = String(text||''); // surrogate-pair の粗取り（絵文字帯）
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'');
    s = s.replace(/[:：]/g,'').trim();
    return s;
  }
  function splitChunksJa(s, maxLen=120){
    const t = scrub(s); if(!t) return [];
    const seps='。！？?!\n', raw=[]; let buf='';
    for(let i=0;i<t.length;i++){ const ch=t[i]; buf+=ch;
      if(seps.indexOf(ch)!==-1){ while(i+1<t.length && /\s/.test(t[i+1])){ buf+=t[++i]; }
        if(buf.trim()){ raw.push(buf.trim()); buf=''; } } }
    if(buf.trim()) raw.push(buf.trim());
    const out=[]; for(let seg of raw){ while(seg.length>maxLen){ out.push(seg.slice(0,maxLen)); seg=seg.slice(maxLen);} if(seg) out.push(seg); }
    return out;
  }

  /* ========== Resume ritual（再生直前の標準儀式） ============== */
  async function ensureResumed(){
    try { if ('speechSynthesis' in window && speechSynthesis.paused) { speechSynthesis.resume(); } } catch(_){}
    await sleep(300); // 端末差で resume 反映に猶予。paused/speaking は MDN 定義。 [oai_citation:9‡developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/paused?utm_source=chatgpt.com)
    const elapsed = nowMs() - (Ctrl.lastCancelAt || 0);
    if (elapsed >= 0 && elapsed < 280) await sleep(280 - elapsed); // Hard Stop直後の整定
  }

  /* ========================= TTS Core ========================== */
  function speakStrict(text, rate = rateFor('narr'), role='narr'){
    return new Promise(async (resolve)=>{
      if(!TTS_ENABLED) return resolve();
      const cleaned = stripMarkdownLight(scrub(text)); if(!cleaned) return resolve();

      await ensureResumed();

      const u = new SpeechSynthesisUtterance(cleaned);
      u.lang = 'ja-JP'; const v = chooseVoice(role) || jpVoice; if (v) u.voice = v;
      const eff = effRateFor(role, rate); u.rate = eff;

      let settled=false, started=false, fallbackTried=false;
      const done=()=>{ if(!settled){ settled=true; resolve(); } };
      u.onstart = ()=>{ started=true; }; // start/end は MDN 仕様イベント。 [oai_citation:10‡developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/start_event?utm_source=chatgpt.com)
      u.onend   = done; u.onerror = done;

      try { speechSynthesis.speak(u); } catch(_){ return done(); }

      setTimeout(async ()=>{
        if(!started && !settled && !fallbackTried){
          fallbackTried=true;
          try { if('speechSynthesis' in window) speechSynthesis.resume(); } catch(_){}
          await sleep(280);
          if(!started && !settled){
            await hardStop(); // 例外救済
            const u2 = new SpeechSynthesisUtterance(cleaned);
            u2.lang='ja-JP'; if(v) u2.voice=v; u2.rate=eff;
            u2.onstart=()=>{ started=true; }; u2.onend=done; u2.onerror=done;
            try { speechSynthesis.speak(u2); } catch(_){ return done(); }
          }
        }
      }, 700);

      const guardMs = Math.min(45000, 800 + (cleaned.length * 110) / Math.max(0.5, eff));
      setTimeout(done, guardMs);
    });
  }

  async function speakOrWait(text, rate = rateFor('narr'), role='narr'){
    const cleaned = stripMarkdownLight(scrub(text)); if(!cleaned) return;
    const eff = effRateFor(role, rate);
    if(TTS_ENABLED){ const parts = splitChunksJa(cleaned); for(const p of parts){ await speakStrict(p, eff, role); } }
    else { await sleep(Math.min(20000, 800 + (cleaned.length * 100) / Math.max(0.5, eff))); }
  }

  /* =========== TTS sanitize bridge（narrTTS優先） ============== */
  let __ttsSanModule = null;
  async function __getNarrForTTS(scene){
    try {
      __ttsSanModule = __ttsSanModule || await import('./tts_sanitize.js');
      if (__ttsSanModule && typeof __ttsSanModule.getTtsText === 'function') return __ttsSanModule.getTtsText(scene);
    } catch(_){}
    const _fallbackBasic = s => String(s||'')
      .replace(/[\u2300-\u23FF\uFE0F]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g,'')
      .replace(/[⏱⏲⏰⌛️]/g,'');
    return _fallbackBasic(scene && (scene.narrTTS || scene.narr));
  }

  /* ========================= Renderers ========================= */
  function removeAllPlayButtons(){ try { document.querySelectorAll('#playBtn, .playBtn').forEach(b=>b.remove()); } catch(_){} }

  function renderPlaceholder(scene){
    applyVersionToBody(scene || { uiVersion: 'T' });
    setBg((scene && scene.base) || '#000');
    const root = ensureSceneSurface();
    const btn = document.createElement('button');
    btn.id='playBtn'; btn.className='playBtn'; btn.textContent='▶︎';
    btn.style.zIndex='2000'; btn.style.pointerEvents='auto';
    root.appendChild(btn);

    const start = (ev)=>{
      if(ev) ev.preventDefault();
      btn.disabled = true;
      if (!Ctrl.activationDone) { try { const u=new SpeechSynthesisUtterance('あ'); u.lang='ja-JP'; u.volume=0.06; u.rate=1.0; speechSynthesis.speak(u); Ctrl.activationDone=true; } catch(_){} }
      primeTTS().catch(()=>{});
      removeAllPlayButtons();
      requestAnimationFrame(()=>{ gotoNext(); });
    };
    btn.addEventListener('click', start, { passive:false });
    btn.addEventListener('touchend', start, { passive:false });
  }

  function renderContent(scene){
    removeAllPlayButtons();
    applyVersionToBody(scene);
    setBg(scene.base || '#000');
    const root = ensureSceneSurface();
    try { document.body.style.setProperty('--symbol-bg-color', String(scene.base || 'transparent')); } catch(_){}
    const sc = createSceneShell();
    if (scene.sectionTag){ const tag=document.createElement('div'); tag.className='section-tag'; tag.textContent=String(scene.sectionTag); sc.appendChild(tag); }
    if (scene.title_key){ const tk=document.createElement('div'); tk.className='title_key'; tk.textContent=String(scene.title_key||''); sc.appendChild(tk); }
    if (scene.title){ const t=document.createElement('div'); t.className='title'; t.textContent=String(scene.title||''); sc.appendChild(t); }
    if (scene.symbol){ const band=document.createElement('div'); band.className='symbol-bg'; const sym=document.createElement('div'); sym.className='symbol'; sym.textContent=String(scene.symbol||''); band.appendChild(sym); sc.appendChild(band); }
    if (scene.narr){ const n=document.createElement('div'); n.className='narr'; n.textContent=String(scene.narr||''); sc.appendChild(n); }
    root.appendChild(sc);
    applyReadableTextColor(scene.base || '#000', root);
    runEffectIfAny(scene, root);
  }

  function renderEffect(scene){
    removeAllPlayButtons();
    applyVersionToBody(scene || { uiVersion: 'T' });
    setBg(scene.base || '#000');
    const root = ensureSceneSurface();
    runEffectIfAny(scene, root);
  }

  /* =============== Scene type & sequencing ===================== */
  function getSceneType(scene){
    if (!scene) return 'unknown';
    if (typeof scene.type === 'string') return scene.type;
    if (scene.version === 'A' || scene.version === 'B' || scene.version === 'T') return 'content';
    return 'content';
  }

  async function runContentSpeech(scene, opts = {}){
    const { silent=false } = opts;
    if (silent) return;             // サイレント指示なら読まない
    if (Ctrl.stopped) return;       // Stop中は読まない

    const f = (window.__ttsFlags || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true });
    const muted = !TTS_ENABLED;

    if (!muted && f.readTag && scene.sectionTag){
      const t = String(scene.sectionTag).replace(/^#/, '').replace(/_/g, ' ');
      await speakOrWait(t, rateFor('tag'), 'tag');
    }
    if (!muted && f.readTitleKey && scene.title_key){ await speakOrWait(scene.title_key, rateFor('titleKey'), 'titleKey'); }
    if (!muted && f.readTitle && scene.title){ await speakOrWait(scene.title, rateFor('title'), 'title'); }
    if (f.readNarr && scene.narr){
      const narrSafe = await __getNarrForTTS(scene);
      await speakOrWait(narrSafe, rateFor('narr'), 'narr');
    }
  }

  async function playScene(scene, opts = {}){
    if (!scene) return;
    const { silent=false } = opts;
    const kind = getSceneType(scene);

    switch(kind){
      case 'placeholder':
        renderPlaceholder(scene);
        break;
      case 'content':
        if (State.playingLock) break;
        State.playingLock = true;
        try {
          renderContent(scene);
          await primeTTS();
          await runContentSpeech(scene, { silent });
        } finally { State.playingLock = false; }
        if (!Ctrl.stopped && !silent && typeof gotoNext === 'function') await gotoNext();
        break;
      case 'effect':
        if (State.playingLock) break;
        State.playingLock = true;
        try {
          renderEffect(scene);
          const raw = (scene.t ?? scene.duration ?? scene.durationMs ?? scene.effectDuration ?? 1200);
          const ms = Math.max(0, Math.min(60000, Number(raw) || 1200));
          await sleep(ms);
        } finally { State.playingLock = false; }
        if (!Ctrl.stopped && !silent && typeof gotoNext === 'function') await gotoNext();
        break;
      default:
        if (State.playingLock) break;
        State.playingLock = true;
        try {
          renderContent(scene);
          await primeTTS();
          await runContentSpeech(scene, { silent });
        } finally { State.playingLock = false; }
        if (!Ctrl.stopped && !silent && typeof gotoNext === 'function') await gotoNext();
        break;
    }
  }

  async function gotoPage(i, opts = {}){
    if (!Array.isArray(State.scenes)) return;
    if (i < 0 || i >= State.scenes.length) return;
    if (!opts.skipResume) await ensureResumed();  // Stop時は resume スキップ可能
    State.idx = i;
    await playScene(State.scenes[i], { silent: !!opts.silent });
  }
  async function gotoNext(opts = {}){ if (!opts.skipResume) await ensureResumed(); await gotoPage(State.idx + 1, opts); }
  async function gotoPrev(opts = {}){ if (!opts.skipResume) await ensureResumed(); await gotoPage(State.idx - 1, opts); }

  /* ============================ Boot =========================== */
  async function boot(){
    try {
      const res = await fetch('./scenes.json', { cache: 'no-cache' });
      const data = await res.json();
      const scenes = data.scenes || data || [];
      State.scenes = scenes;

      try { const vm = (data && data.videoMeta) || {};
        __bannerDefault = vm.bannerText || vm.triviaTitle || vm.thumbnailText || vm.theme || '';
        setBannerText(__bannerDefault);
      } catch(_){}

      try {
        if (window.__ttsUtils && data && data.videoMeta && data.videoMeta.tts) { __ttsUtils.setup(data.videoMeta.tts); }
        else if (window.__ttsUtils) { __ttsUtils.setup({}); }
        const VC = (window.__dbgConfig && window.__dbgConfig.voice) || null;
        if (window.__ttsUtils && VC && VC.filter && typeof VC.filter.jaOnly==='boolean') { __ttsUtils.setup({ filter: { jaOnly: !!VC.filter.jaOnly } }); }
        window.__ttsVoiceMap = window.__ttsVoiceMap || {};
        if (VC && VC.defaults) {
          ['tag','titleKey','title','narr'].forEach(k=>{ if(!window.__ttsVoiceMap[k] && VC.defaults[k]) window.__ttsVoiceMap[k] = VC.defaults[k]; });
        }
      } catch(_){}

      await gotoPage(0);
    } catch(e){
      console.error('Failed to load scenes.json', e);
      ensureSceneSurface(); setBg('#000');
      const root = document.getElementById('content'); const sc = createSceneShell();
      setTextInScene(sc, '.title', 'scenes.json の読み込みに失敗しました'); root.appendChild(sc);
    }
  }

  /* ========================= Public API ======================== */
  async function hardStop(){
    try {
      if ('speechSynthesis' in window) { speechSynthesis.cancel(); Ctrl.lastCancelAt = nowMs(); await sleep(280); } // 整定
    } catch(_){}
    Ctrl.stopped = true;
  }
  function softStop(){
    Ctrl.stopped = true;
    try { if ('speechSynthesis' in window) speechSynthesis.pause(); } catch(_){}
  }
  function clearStop(){ Ctrl.stopped = false; }

  window.__player = window.__player || {
    next:    () => { clearStop(); return gotoNext(); },
    prev:    () => { clearStop(); return gotoPrev(); },
    play:    () => {
      if (Ctrl.stopped) { clearStop(); return gotoPage(State.idx); } // 冒頭から再開
      clearStop(); return gotoNext();
    },
    // Stop＝Gotoサイレント：画面と起点をリセット（曖昧停止でOKという要件に最適化）
    stop:    () => { softStop(); return gotoPage(State.idx, { skipResume:true, silent:true }); },
    // 例外用の強制停止
    stopHard:() => { return hardStop(); },
    restart: () => { clearStop(); return gotoPage(0); },
    goto:    (i) => { clearStop(); return gotoPage(i|0); },
    info:    () => ({ index: State.idx, total: (State.scenes||[]).length, playing: !!State.playingLock, stopped: !!Ctrl.stopped }),
    getScene:() => (State.scenes && State.scenes[State.idx]) || null
  };

  window.__playerCore = Object.assign((window.__playerCore || {}), {
    gotoNext, gotoPrev, gotoPage, rateFor, effRateFor, chooseVoice, primeTTS,
    softStop, hardStop, clearStop, ensureResumed
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot, { once:true });

  /* ============== voiceschanged: 発話中断しない最適化 ========= */
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', () => { refreshJPVoice(); }); // 声リストの遅延更新。 [oai_citation:11‡developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event?utm_source=chatgpt.com)
    }
  } catch(_){}
})();