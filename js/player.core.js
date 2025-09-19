/*!
Project:  shorts-player-kit
File:     js/player.core.js
Role:     Player Core (page-end stop default + Stop ACK UI hooks + Hard Stop hook)
UX:       Emits UI-friendly custom events for TTS/playing states (Phase2)
Roadmap:  Phase3/4/6 — TTS watchdog hardening, event-bus hooks, QuickBar Next連携
Notes (delta):
  - Stopは「ページ末で静停止」を既定化（押下時は自動遷移だけを遮断し、当該ページの読み上げは完了させる）
  - Stop押下の“手応え”を可視化するため、即時ACK/確定ACKのカスタムイベントを追加
  - 即時ACK: window.dispatchEvent(new CustomEvent('player:stop-ack', {detail:{ts}}))
  - 確定ACK: window.dispatchEvent(new CustomEvent('player:stop-confirm', {detail:{latencyMs, context}}))
  - Hard Stop（強制停止）APIを公開（__player.stopHard）: cancel() + 短い整定待機
  - 再生系操作の先頭で resume() を儀式化（ensureResumed）し、音声起動の安定性を確保
  - speakパイプ: scrub → stripMarkdownLight → runtime speechFixes → speakOrWait（watchdog付き）
*/

(() => {
'use strict';

/* ======================= Feature flags ======================= */
const TTS_ENABLED = (typeof window.TTS_ENABLED === 'boolean') ? window.TTS_ENABLED : true;
window.__ttsFlags = window.__ttsFlags || { readTag: true, readTitleKey: true, readTitle: true, readNarr: true };

/* ======================= Core State ========================== */
const State = { scenes: [], idx: 0, playingLock: false };
const Ctrl = {
  stopRequested: false,   // Stop押下直後の要求（ページ末で停止）
  stopped: false,         // Stopが確定し、次遷移や再生を抑止中
  stopReqAt: 0,           // Stop受付時刻（ACKレイテンシ計測用）
  lastCancelAt: 0,        // 直近 cancel() の時刻（Hard Stop整定用）
  activationDone:false    // 初回可聴ワンショット済み
};

/* ======================= UI-facing State ===================== */
// Debug UI 等が subscribe しやすいよう、TTS/再生状態を集約して発火
const UiState = { speaking:false, paused:false, pending:false, playing:false };
function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent(name, { detail })); }catch(_){ } }
function emitTtsState(next){
  const n = {
    speaking: (next.speaking ?? UiState.speaking),
    paused:   (next.paused   ?? UiState.paused),
    pending:  (next.pending  ?? UiState.pending),
  };
  if (n.speaking!==UiState.speaking || n.paused!==UiState.paused || n.pending!==UiState.pending){
    UiState.speaking = n.speaking;
    UiState.paused   = n.paused;
    UiState.pending  = n.pending;
    emit('player:tts-state', { speaking:UiState.speaking, paused:UiState.paused, pending:UiState.pending });
  }
}
function emitPlaying(on){
  const v = !!on;
  if (UiState.playing === v) return;
  UiState.playing = v;
  // 既存UI後方互換: playing は維持しつつ、index/total/canPrev/canNext を追加
  const total=(State.scenes||[]).length;
  emit('player:status', {
    playing: UiState.playing,
    index: State.idx,
    total,
    canPrev: (State.idx>0),
    canNext: (State.idx+1<total)
  });
}
// Stop要求の可視化（ACKとは別に "pending" をUIに共有）
const setPending = (p)=> emitTtsState({ pending: !!p });

/* ======================= Utils =============================== */
const nowMs = () => (window.performance && performance.now ? performance.now() : Date.now());
const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms|0)));

/* =================== Activation (first user tap) ============= */
function installActivationOnce() {
  if (Ctrl.activationDone || !('speechSynthesis' in window)) return;
  const handler = () => {
    if (Ctrl.activationDone) return;
    Ctrl.activationDone = true;
    try { const u = new SpeechSynthesisUtterance('あ'); u.lang='ja-JP'; u.rate=1.0; u.volume=0.06; speechSynthesis.speak(u); } catch(_){}
    ['pointerdown','click','touchend','keydown'].forEach(t => document.removeEventListener(t, handler, true));
  };
  ['pointerdown','click','touchend','keydown'].forEach(t => document.addEventListener(t, handler, { capture:true, once:true }));
}
installActivationOnce();

/* =================== Background / Version / Color ============ */
function ensureBgLayer(){ let bg=document.getElementById('bgColor'); if(!bg){ bg=document.createElement('div'); bg.id='bgColor'; document.body.insertBefore(bg, document.body.firstChild||null);} const s=bg.style; s.position='fixed'; s.left=s.top='0'; s.right=s.bottom='0'; s.zIndex='0'; s.pointerEvents='none'; s.transition=s.transition||'background-color 1.2s ease'; s.transform='translateZ(0)'; return bg; }
let __bannerDefault='';
function setBannerText(txt){ try{ const el=document.getElementById('banner'); if(!el) return; const s=String(txt||'').trim(); el.textContent=s || ' '; } catch(_){} }
function setBg(c){ try{ if(!c) return; document.body.style.backgroundColor=c; ensureBgLayer().style.backgroundColor=c; } catch(_){} }
function applyVersionToBody(scene){ const v=(scene&&(scene.version||scene.uiVersion))||'A'; const b=document.body; b.classList.remove('version-A','version-B','version-T'); b.classList.add(v==='B'?'version-B':(v==='T'?'version-T':'version-A')); }
function applyReadableTextColor(base, el){ try{ const m=/^#?([0-9a-f]{6})$/i.exec(String(base||'').trim()); if(!m) return; const h=m[1], r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16); const Y=0.299*r+0.587*g+0.114*b; (el||document.getElementById('content')||document.body).style.color=(Y<140)?'#fff':'#111'; } catch(_){} }

/* ========================= Scene Surface ===================== */
function ensureSceneSurface(){ ensureBgLayer(); let root=document.getElementById('content'); if(!root){ root=document.createElement('div'); root.id='content'; document.body.appendChild(root);} root.innerHTML=''; return root; }
function createSceneShell(){ const el=document.createElement('div'); el.className='scene'; return el; }
function setTextInScene(sceneEl, selector, text){
  let el=sceneEl.querySelector(selector);
  if(!el){
    el=document.createElement('div');
    el.className=selector.replace(/^[.#]/,'');
    sceneEl.appendChild(el);
  }
  el.textContent=String(text||'');
  // NOTE: white-space は CSS (.narr { white-space: pre-line; }) に委譲
}
function setText(idOrKey, s){ const map={ title_key:'.title_key', titleKey:'.title_key', title:'.title', symbol:'.symbol', narr:'.narr' }; const sel=map[idOrKey]||'.narr', root=document.getElementById('content'); if(!root) return; const sc=root.querySelector('.scene')||root; setTextInScene(sc, sel, s); }

/* ========================= Effects Hook ====================== */
function runEffectIfAny(scene, anchor){ if(!scene||!scene.effect) return; if(!window.__effects||typeof __effects.run!=='function') return; try{ __effects.run(scene.effect, anchor||document.body, scene);}catch(_){} }

/* ========================= Voices (non-blocking) ============= */
function getVoicesSafe(){ try{ return window.speechSynthesis.getVoices()||[]; } catch(_){ return []; } }
let jpVoice=null; function refreshJPVoice(){ const list=getVoicesSafe(); jpVoice = list.find(v=>/^ja(-JP)?/i.test(v.lang)) || list.find(v=>/日本語/.test(v.name)) || null; }
refreshJPVoice();
try{ window.speechSynthesis.addEventListener('voiceschanged', ()=>{ refreshJPVoice(); }); }catch(_){ }

function voiceById(key){ if(!key) return null; const list=getVoicesSafe(); let v=list.find(x=>x.voiceURI===key); if(v) return v; if(key.includes('|')){ const [lang,name]=key.split('|'); v=list.find(x=>x.lang===lang && x.name===name); if(v) return v; } return list.find(x=>x.name===key)||list.find(x=>x.lang===key)||null; }
function chooseVoice(role){ const vm=window.__ttsVoiceMap||{}, map=vm[role]; if(map){ if(typeof map==='string'){ const v=voiceById(map); if(v) return v; } else if(map && typeof map==='object'){ try{ if(typeof SpeechSynthesisVoice!=='undefined' && map instanceof SpeechSynthesisVoice) return map; }catch(_){} const key=map.voiceURI||((map.lang||'')+'|'+(map.name||'')); const v=voiceById(key); if(v) return v; } }
  try{ if(window.__ttsUtils && typeof __ttsUtils.pick==='function'){ const p=__ttsUtils.pick(role); if(p&&p.id){ const v=voiceById(p.id); if(v) return v; } } }catch(_){}
  return jpVoice || null; // 未到着でも u.voice 未設定で開始可
}

/* ========================= TTS Rate ========================== */
function clampAbs(v){ const n=Number(v); if(!Number.isFinite(n)) return 1.4; return Math.max(0.5, Math.min(2.0, n)); }
function effRateFor(role='narr', base=1.4){ try{ if(window.__ttsUtils && typeof __ttsUtils.getRateForRole==='function') return clampAbs(__ttsUtils.getRateForRole(base, role)); }catch(_){} return clampAbs(base); }
function rateFor(role='narr'){ return effRateFor(role, 1.4); }

/* ========================= Priming =========================== */
async function primeTTS(){ if(!TTS_ENABLED || window.ttsPrimed) return; await new Promise(res=>{ try{ const u=new SpeechSynthesisUtterance(' '); u.lang='ja-JP'; const v=chooseVoice('narr')||jpVoice; if(v) u.voice=v; u.volume=0; u.rate=1.0; let done=false; const fin=()=>{ if(!done){ done=true; window.ttsPrimed=true; res(); } }; u.onend=fin; u.onerror=fin; speechSynthesis.speak(u); setTimeout(fin, 800); }catch(_){ window.ttsPrimed=true; res(); } }); }

/* ========================= Markdown / Scrub ================== */
function stripMarkdownLight(s){ return String(s||'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/\*(.+?)\*/g,'$1').replace(/_(.+?)_/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1').replace(/\[([^\]]+)\]/g,'$1'); }
function getSpeechFixes(){ try{ const o=window.speechFixes; return (o && typeof o==='object')? o : {}; }catch(_){ return {}; } }
function scrub(text){ let s=String(text||''); s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,''); s = s.replace(/[:：]/g,'').trim(); return s; }
function splitChunksJa(s, maxLen=120){ const t=scrub(s); if(!t) return []; const seps='。！？?!\n', raw=[]; let buf=''; for(let i=0;i<t.length;i++){ const ch=t[i]; buf+=ch; if(seps.indexOf(ch)!==-1){ while(i+1<t.length && /\s/.test(t[i+1])){ buf+=t[++i]; } if(buf.trim()){ raw.push(buf.trim()); buf=''; } } } if(buf.trim()) raw.push(buf.trim()); const out=[]; for(let seg of raw){ while(seg.length>maxLen){ out.push(seg.slice(0,maxLen)); seg=seg.slice(maxLen);} if(seg) out.push(seg);} return out; }

/* ========== Resume ritual（再生直前の標準儀式） ============== */
async function ensureResumed(){ try{ if('speechSynthesis' in window && speechSynthesis.paused){ speechSynthesis.resume(); } }catch(_){} await sleep(300); const elapsed=nowMs() - (Ctrl.lastCancelAt||0); if(elapsed>=0 && elapsed<280) await sleep(280 - elapsed); }

/* ========================= Stop ACK / State ================== */
function requestSoftStop(){ if(!Ctrl.stopRequested){ Ctrl.stopRequested = true; Ctrl.stopReqAt = nowMs(); try{ window.dispatchEvent(new CustomEvent('player:stop-ack', { detail:{ ts: Ctrl.stopReqAt } })); }catch(_){} } }
function finalizeStopIfNeeded(context){
  if(Ctrl.stopRequested && !Ctrl.stopped){
    Ctrl.stopped = true;
    const t = nowMs(); const lat = Math.max(0, Math.round(t - (Ctrl.stopReqAt||t)));
    try{ window.dispatchEvent(new CustomEvent('player:stop-confirm', { detail:{ latencyMs: lat, context: String(context||'') } })); }catch(_){}
    setPending(false);
  }
}
function clearStop(){ Ctrl.stopRequested = false; Ctrl.stopped = false; }

/* ========================= TTS Core ========================== */
function speakStrict(text, rate = rateFor('narr'), role='narr'){
  return new Promise(async (resolve)=>{
    if(!TTS_ENABLED) return resolve();
    const cleaned = stripMarkdownLight(scrub(text)); if(!cleaned) return resolve();

    await ensureResumed();

    const fixes = getSpeechFixes();
    let speakText = cleaned; for(const k of Object.keys(fixes)){ if(!k) continue; speakText = speakText.split(k).join(String(fixes[k]??'')); }
    if(!speakText.trim()) return resolve();

    const u = new SpeechSynthesisUtterance(speakText);
    u.lang='ja-JP'; const v=chooseVoice(role)||jpVoice; if(v) u.voice=v; const eff=effRateFor(role, rate); u.rate=eff;

    let settled=false, started=false, fallbackTried=false;
    const done=()=>{ if(!settled){ settled=true; resolve(); } };
    u.onstart=()=>{ started=true; /* chunk単位の開始。全体 speaking は speakOrWait 側で管理 */ };
    // pause/resume は発火しない実装もあるが、来たらUIへ橋渡し
    u.onpause = ()=>{ emitTtsState({ paused:true  }); };
    u.onresume= ()=>{ emitTtsState({ paused:false }); };
    u.onend=done;
    u.onerror=(ev)=>{ try{ emit('player:tts-error', { role, reason: (ev && ev.error) || 'error' }); }catch(_){} done(); };

    try{ speechSynthesis.speak(u); }catch(_){ return done(); }

    setTimeout(async ()=>{
      if(!started && !settled && !fallbackTried){
        fallbackTried=true; try{ if('speechSynthesis' in window) speechSynthesis.resume(); }catch(_){ }
        await sleep(280);
        if(!started && !settled){
          // 最終救済：Hard Stop→再発話（1回だけ）
          try{ speechSynthesis.cancel(); Ctrl.lastCancelAt = nowMs(); }catch(_){ }
          await sleep(280);
          const u2=new SpeechSynthesisUtterance(speakText); u2.lang='ja-JP'; if(v) u2.voice=v; u2.rate=eff; u2.onstart=()=>{ started=true; }; u2.onend=done; u2.onerror=done;
          try{ speechSynthesis.speak(u2); }catch(_){ return done(); }
        }
      }
    }, 700);

    // Phase3: 文字数×係数 + 初期猶予。上限は 45s のまま（iOS/Safari ガード）
    const guardMs = Math.min(45000, 800 + (speakText.length * 110) / Math.max(0.5, eff));
    setTimeout(done, guardMs);
  });
}

async function speakOrWait(text, rate = rateFor('narr'), role='narr'){
  const cleaned = stripMarkdownLight(scrub(text)); if(!cleaned) return;
  const eff = effRateFor(role, rate);
  if(TTS_ENABLED){
    const parts = splitChunksJa(cleaned);
    emitTtsState({ speaking:true });          // 全体 speaking をON
    emit('player:tts-start', { role, length: cleaned.length, rate: eff });
    try{
      for(const p of parts){ await speakStrict(p, eff, role); }
    } finally {
      emitTtsState({ speaking:false, paused:false }); // 終了時に確実にOFF
      emit('player:tts-end', { role });
    }
  } else {
    await sleep(Math.min(20000, 800 + (cleaned.length * 100) / Math.max(0.5, eff)));
  }
}

/* =========== TTS sanitize bridge（narrTTS優先） ============== */
let __ttsSanModule = null;
async function __getNarrForTTS(scene){
  try{ __ttsSanModule = __ttsSanModule || await import('./tts_sanitize.js'); if(__ttsSanModule && typeof __ttsSanModule.getTtsText==='function') return __ttsSanModule.getTtsText(scene); }catch(_){}
  const _fallbackBasic = s => String(s||'').replace(/[\u2300-\u23FF\uFE0F]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/g,'').replace(/[⏱⏲⏰⌛️]/g,'');
  return _fallbackBasic(scene && (scene.narrTTS || scene.narr));
}

/* ========================= Renderers ========================= */
function removeAllPlayButtons(){ try{ document.querySelectorAll('#playBtn, .playBtn').forEach(b=>b.remove()); }catch(_){} }

function renderPlaceholder(scene){
  applyVersionToBody(scene || { uiVersion: 'T' });
  setBg((scene && scene.base) || '#000');
  const root = ensureSceneSurface();
  const btn = document.createElement('button');
  btn.id='playBtn';
  btn.className='playBtn';
  btn.textContent='▶︎';
  root.appendChild(btn);
  const start=(ev)=>{ if(ev) ev.preventDefault(); btn.disabled=true; if(!Ctrl.activationDone){ try{ const u=new SpeechSynthesisUtterance('あ'); u.lang='ja-JP'; u.volume=0.06; u.rate=1.0; speechSynthesis.speak(u); Ctrl.activationDone=true; }catch(_){} } primeTTS().catch(()=>{}); removeAllPlayButtons(); requestAnimationFrame(()=>{ gotoNext(); }); };
  btn.addEventListener('click', start, { passive:false });
  btn.addEventListener('touchend', start, { passive:false });
}

function renderContent(scene){
  removeAllPlayButtons();
  applyVersionToBody(scene); setBg(scene.base || '#000');
  const root=ensureSceneSurface();
  try{ document.body.style.setProperty('--symbol-bg-color', String(scene.base || 'transparent')); }catch(_){}
  const sc=createSceneShell();
  if(scene.sectionTag){ const tag=document.createElement('div'); tag.className='section-tag'; tag.textContent=String(scene.sectionTag); sc.appendChild(tag); }
  if(scene.title_key){ const tk=document.createElement('div'); tk.className='title_key'; tk.textContent=String(scene.title_key||''); sc.appendChild(tk); }
  if(scene.title){ const t=document.createElement('div'); t.className='title'; t.textContent=String(scene.title||''); sc.appendChild(t); }
  if(scene.symbol){ const band=document.createElement('div'); band.className='symbol-bg'; const sym=document.createElement('div'); sym.className='symbol'; sym.textContent=String(scene.symbol||''); band.appendChild(sym); sc.appendChild(band); }
  if(scene.narr){ const n=document.createElement('div'); n.className='narr'; n.textContent=String(scene.narr||''); sc.appendChild(n); }
  root.appendChild(sc);
  applyReadableTextColor(scene.base || '#000', root);
  runEffectIfAny(scene, root);
}

function renderEffect(scene){ removeAllPlayButtons(); applyVersionToBody(scene || { uiVersion:'T' }); setBg(scene.base || '#000'); const root=ensureSceneSurface(); runEffectIfAny(scene, root); }

/* =============== Scene type & sequencing ===================== */
function getSceneType(scene){ if(!scene) return 'unknown'; if(typeof scene.type==='string') return scene.type; if(scene.version==='A'||scene.version==='B'||scene.version==='T') return 'content'; return 'content'; }

async function runContentSpeech(scene){
  const f = (window.__ttsFlags || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true });
  const muted = !TTS_ENABLED;
  if(!muted && f.readTag && scene.sectionTag){ const t=String(scene.sectionTag).replace(/^#/,'').replace(/_/g,' '); await speakOrWait(t, rateFor('tag'), 'tag'); }
  if(!muted && f.readTitleKey && scene.title_key){ await speakOrWait(scene.title_key, rateFor('titleKey'), 'titleKey'); }
  if(!muted && f.readTitle && scene.title){ await speakOrWait(scene.title, rateFor('title'), 'title'); }
  if(f.readNarr && scene.narr){ const narrSafe = await __getNarrForTTS(scene); await speakOrWait(narrSafe, rateFor('narr'), 'narr'); }
}

async function playScene(scene){
  if(!scene) return;
  const kind = getSceneType(scene);
  emit('player:scene-willstart', { index: State.idx, kind, scene });
  switch(kind){
    case 'placeholder':
      renderPlaceholder(scene);
      emit('player:scene-didrender', { index: State.idx, kind });
      break;
    case 'content':
      if(State.playingLock) break; State.playingLock = true;
      try{
        emitPlaying(true);
        renderContent(scene);
        emit('player:scene-didrender', { index: State.idx, kind });
        await primeTTS();
        await runContentSpeech(scene);
      } finally {
        State.playingLock = false;
        emitPlaying(false);
      }
      emit('player:scene-didfinish', { index: State.idx, kind });
      if(Ctrl.stopRequested){ finalizeStopIfNeeded('content'); break; }
      if(!Ctrl.stopped && typeof gotoNext==='function') await gotoNext();
      break;
    case 'effect':
      if(State.playingLock) break; State.playingLock = true;
      try{
        emitPlaying(true);
        renderEffect(scene);
        emit('player:scene-didrender', { index: State.idx, kind });
        const raw=(scene.t ?? scene.duration ?? scene.durationMs ?? scene.effectDuration ?? 1200);
        const ms=Math.max(0, Math.min(60000, Number(raw)||1200));
        await sleep(ms);
      } finally { State.playingLock = false; emitPlaying(false); }
      emit('player:scene-didfinish', { index: State.idx, kind });
      if(Ctrl.stopRequested){ finalizeStopIfNeeded('effect'); break; }
      if(!Ctrl.stopped && typeof gotoNext==='function') await gotoNext();
      break;
    default:
      if(State.playingLock) break; State.playingLock = true;
      try{ renderContent(scene); await primeTTS(); await runContentSpeech(scene); } finally { State.playingLock = false; }
      emit('player:scene-didrender', { index: State.idx, kind:'content' });
      emit('player:scene-didfinish', { index: State.idx, kind:'content' });
      if(Ctrl.stopRequested){ finalizeStopIfNeeded('content'); break; }
      if(!Ctrl.stopped && typeof gotoNext==='function') await gotoNext();
      break;
  }
}

async function gotoPage(i){
  if(!Array.isArray(State.scenes)) return;
  if(i<0||i>=State.scenes.length) return;
  await ensureResumed();
  emit('player:navigation-queued', { from: State.idx, to: i });
  State.idx=i;
  try{ window.dispatchEvent(new CustomEvent('player:page', { detail:{ index:i, total:(State.scenes||[]).length, scene: State.scenes[i] } })); }catch(_){}
  emit('player:navigation-applied', { index: i, total:(State.scenes||[]).length });
  await playScene(State.scenes[i]);
}
async function gotoNext(){
  await ensureResumed();
  const N=(State.scenes||[]).length;
  if(State.idx + 1 >= N){ try{ window.dispatchEvent(new CustomEvent('player:end')); }catch(_){} return; }
  emit('player:navigation-queued', { from: State.idx, to: State.idx+1 });
  await gotoPage(State.idx + 1);
}
async function gotoPrev(){
  await ensureResumed();
  if(State.idx - 1 < 0){ try{ window.dispatchEvent(new CustomEvent('player:begin')); }catch(_){} return; }
  emit('player:navigation-queued', { from: State.idx, to: State.idx-1 });
  await gotoPage(State.idx - 1);
}

/* ============================ Boot =========================== */
async function boot(){
  try{
    const res=await fetch('./scenes.json', { cache:'no-cache' });
    const data=await res.json();
    const scenes=data.scenes || data || [];
    State.scenes = scenes;

    try{ const vm=(data && data.videoMeta)||{}; __bannerDefault = vm.bannerText || vm.triviaTitle || vm.thumbnailText || vm.theme || ''; setBannerText(__bannerDefault); }catch(_){ }

    try{
      // tts-utils セットアップ
      if(window.__ttsUtils && data && data.videoMeta && data.videoMeta.tts){ __ttsUtils.setup(data.videoMeta.tts); }
      else if(window.__ttsUtils){ __ttsUtils.setup({}); }
      // debug_config 側の voice.filter → tts-utils へ
      const VC=(window.__dbgConfig && window.__dbgConfig.voice)||null;
      if(window.__ttsUtils && VC && VC.filter && typeof VC.filter.jaOnly==='boolean'){ __ttsUtils.setup({ filter:{ jaOnly:!!VC.filter.jaOnly } }); }
      // defaults → __ttsVoiceMap（未設定ロールのみ）
      window.__ttsVoiceMap = window.__ttsVoiceMap || {};
      if(VC && VC.defaults){ ['tag','titleKey','title','narr'].forEach(k=>{ if(!window.__ttsVoiceTMap[k] && VC.defaults[k]) window.__ttsVoiceMap[k]=VC.defaults[k]; }); }
    }catch(_){ }

    await gotoPage(0);
  }catch(e){
    console.error('Failed to load scenes.json', e);
    ensureSceneSurface(); setBg('#000'); const root=document.getElementById('content'); const sc=createSceneShell(); setTextInScene(sc,'.title','scenes.json の読み込みに失敗しました'); root.appendChild(sc);
  }
}

/* ========================= Public API ======================== */
async function hardStop(){
  requestSoftStop(); // UI的には止めたい意図を共有
  setPending(true);
  try{ if('speechSynthesis' in window){ speechSynthesis.cancel(); Ctrl.lastCancelAt=nowMs(); await sleep(280); } }catch(_){}
  Ctrl.stopped = true; // 強制停止は即確定
  finalizeStopIfNeeded('hard');
}

window.__player = window.__player || {
  next: () => { clearStop(); return gotoNext(); },
  prev: () => { clearStop(); return gotoPrev(); },
  play: () => { if(Ctrl.stopped || Ctrl.stopRequested){ clearStop(); return gotoPage(State.idx); } clearStop(); return gotoNext(); },
  stop: () => { requestSoftStop(); /* 既定: ページ末で停止（pause/cancelは行わない）*/ },
  stopHard:() => { return hardStop(); },
  restart: () => { clearStop(); return gotoPage(0); },
  goto: (i) => { clearStop(); return gotoPage(i|0); },
  info: () => {
    const total=(State.scenes||[]).length;
    return {
      index: State.idx,
      total,
      playing: !!State.playingLock,
      stopRequested: !!Ctrl.stopRequested,
      stopped: !!Ctrl.stopped,
      canPrev: (State.idx>0),
      canNext: (State.idx+1<total)
    };
  },
  getScene:() => (State.scenes && State.scenes[State.idx]) || null
};

window.__playerCore = Object.assign((window.__playerCore || {}), {
  gotoNext, gotoPrev, gotoPage, rateFor, effRateFor, chooseVoice, primeTTS,
  // Stop周り
  ensureResumed, hardStop,
});

if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
else document.addEventListener('DOMContentLoaded', boot, { once:true });

/* ============== voiceschanged: 発話中断しない最適化 ========= */
try{ if('speechSynthesis' in window){ window.speechSynthesis.addEventListener('voiceschanged', ()=>{ refreshJPVoice(); }); } }catch(_){ }
})();
