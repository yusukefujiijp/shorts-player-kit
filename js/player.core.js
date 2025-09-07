/*!
Project:  shorts-player-kit
File:     js/player.core.js
Role:     Player Core (contract DOM + perRoleAbs TTS + effects hook)
Notes (delta):
  - NEW: stripMarkdownLight() を追加し、太字/斜体/コード/リンクの記号（**, __, *, _, `, [], ()）だけを除去して本文を残す
  - speakStrict(): scrub → stripMarkdownLight → runtime speechFixes の順で整形
  - boot(): 既定で Tag を 'ja-JP|Kyoko' に（既存指定があれば尊重）
*/

(() => {
  'use strict';

  const TTS_ENABLED = (typeof window.TTS_ENABLED === 'boolean') ? window.TTS_ENABLED : true;
  window.__ttsFlags = window.__ttsFlags || { readTag:true, readTitleKey:true, readTitle:true, readNarr:true };
  let __playingLock = false;

  /* ---------------- background & body version ---------------- */
  function ensureBgLayer(){
    let bg = document.getElementById('bgColor');
    if(!bg){ bg = document.createElement('div'); bg.id='bgColor'; document.body.insertBefore(bg, document.body.firstChild||null); }
    const s = bg.style; s.position='fixed'; s.left=s.top='0'; s.right=s.bottom='0';
    s.zIndex='0'; s.pointerEvents='none'; s.transition=s.transition||'background-color 1.2s ease'; s.transform='translateZ(0)';
    return bg;
  }
  function setBg(c){ try{ if(!c) return; document.body.style.backgroundColor=c; ensureBgLayer().style.backgroundColor=c; }catch(_){} }
  function applyVersionToBody(scene){
    const v = (scene && (scene.version||scene.uiVersion)) || 'A';
    const b=document.body; b.classList.remove('version-A','version-B','version-T');
    b.classList.add(v==='B' ? 'version-B' : v==='T' ? 'version-T':'version-A');
  }
  function applyReadableTextColor(base, el){
    try{
      const m=/^#?([0-9a-f]{6})$/i.exec(String(base||'').trim()); if(!m) return;
      const h=m[1], r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
      const Y=0.299*r+0.587*g+0.114*b; (el||document.getElementById('content')||document.body).style.color = (Y<140)?'#fff':'#111';
    }catch(_){}
  }

  /* ---------------- scene surface (contract DOM) -------------- */
  function ensureSceneSurface(){
    ensureBgLayer();
    let root=document.getElementById('content');
    if(!root){ root=document.createElement('div'); root.id='content'; root.style.cssText='position:relative;z-index:10;width:100%;text-align:center;'; document.body.appendChild(root); }
    root.innerHTML=''; return root;
  }
  function createSceneShell(){ const el=document.createElement('div'); el.className='scene'; return el; }
  function setTextInScene(sceneEl, selector, text){
    let el=sceneEl.querySelector(selector); if(!el){ el=document.createElement('div'); el.className=selector.replace(/^[.#]/,''); sceneEl.appendChild(el); }
    el.textContent=String(text||''); if(selector==='.narr') el.style.whiteSpace='pre-line';
  }
  function setText(idOrKey, s){
    const map={ title_key:'.title_key', titleKey:'.title_key', title:'.title', symbol:'.symbol', narr:'.narr' };
    const sel=map[idOrKey]||'.narr', root=document.getElementById('content'); if(!root) return;
    const sc=root.querySelector('.scene')||root; setTextInScene(sc, sel, s);
  }

  /* ---------------- effects hook ---------------- */
  function runEffectIfAny(scene, anchor){ if(!scene||!scene.effect) return; if(!window.__effects||typeof __effects.run!=='function') return;
    try{ __effects.run(scene.effect, anchor||document.body, scene); }catch(_){} }

  /* ---------------- TTS plumbing ---------------- */
  function getVoicesSafe(){ try{ return window.speechSynthesis.getVoices()||[]; }catch(_){ return []; } }
  let jpVoice=null;
  function refreshJPVoice(){ const list=getVoicesSafe(); jpVoice=list.find(v=>/^ja(-JP)?/i.test(v.lang))||list.find(v=>/日本語/.test(v.name))||null; }
  refreshJPVoice(); try{ window.speechSynthesis.addEventListener('voiceschanged', ()=>{ refreshJPVoice(); }); }catch(_){}
  function voiceById(key){
    if(!key) return null; const list=getVoicesSafe();
    let v=list.find(x=>x.voiceURI===key); if(v) return v;
    if(key.includes('|')){ const [lang,name]=key.split('|'); v=list.find(x=>x.lang===lang&&x.name===name); if(v) return v; }
    return list.find(x=>x.name===key)||list.find(x=>x.lang===key)||null;
  }
  function chooseVoice(role){
    const vm=window.__ttsVoiceMap||{}, map=vm[role];
    if(map){ if(typeof map==='string'){ const v=voiceById(map); if(v) return v; }
      else if(map&&typeof map==='object'){ try{ if(typeof SpeechSynthesisVoice!=='undefined' && map instanceof SpeechSynthesisVoice) return map; }catch(_){}
        const key=map.voiceURI||((map.lang||'')+'|'+(map.name||'')); const v=voiceById(key); if(v) return v; } }
    try{ if(window.__ttsUtils&&typeof __ttsUtils.pick==='function'){ const p=__ttsUtils.pick(role); if(p&&p.id){ const v=voiceById(p.id); if(v) return v; } } }catch(_){}
    return jpVoice||null;
  }
  function clampAbs(v){ const n=Number(v); if(!Number.isFinite(n)) return 1.4; return Math.max(0.5, Math.min(2.0, n)); }
  function effRateFor(role='narr', base=1.4){ try{ if(window.__ttsUtils&&typeof __ttsUtils.getRateForRole==='function') return clampAbs(__ttsUtils.getRateForRole(base, role)); }catch(_){}
    return clampAbs(base); }
  function rateFor(role='narr'){ return effRateFor(role, 1.4); }

  async function primeTTS(){
    if(!TTS_ENABLED || window.ttsPrimed) return;
    await new Promise(res=>{
      try{
        const u=new SpeechSynthesisUtterance(' '); u.lang='ja-JP'; const v=chooseVoice('narr')||jpVoice; if(v) u.voice=v;
        u.volume=0; u.rate=1.0; let done=false; const fin=()=>{ if(!done){ done=true; window.ttsPrimed=true; res(); } };
        u.onend=fin; u.onerror=fin; speechSynthesis.speak(u); setTimeout(fin, 800);
      }catch(_){ window.ttsPrimed=true; res(); }
    });
  }

  /* ---------- Markdown soft strip ---------- */
  function stripMarkdownLight(s){
    return s
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\[([^\]]+)\]/g, '$1');
  }

  function getSpeechFixes(){ try{ const o=window.speechFixes; return (o&&typeof o==='object')? o : {}; }catch(_){ return {}; } }

  function scrub(text){
    let s=String(text||'');
    s=s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,''); // emoji 等
    s=s.replace(/[:：]/g,'').trim();
    return s;
  }

  function splitChunksJa(s, maxLen=120){
    const t=scrub(s); if(!t) return [];
    const seps='。！？?!\n', raw=[]; let buf='';
    for(let i=0;i<t.length;i++){ const ch=t[i]; buf+=ch;
      if(seps.indexOf(ch)!==-1){ while(i+1<t.length && /\s/.test(t[i+1])){ buf+=t[++i]; }
        if(buf.trim()){ raw.push(buf.trim()); buf=''; } } }
    if(buf.trim()) raw.push(buf.trim());
    const out=[]; for(let seg of raw){ while(seg.length>maxLen){ out.push(seg.slice(0,maxLen)); seg=seg.slice(maxLen); } if(seg) out.push(seg); }
    return out;
  }

  function speakStrict(text, rate=rateFor('narr'), role='narr'){
    return new Promise(resolve=>{
      const cleaned = stripMarkdownLight(scrub(text));
      if(!cleaned || !TTS_ENABLED) return resolve();

      let speakText = cleaned;
      const fixes = getSpeechFixes();
      for(const k of Object.keys(fixes)){ if(!k) continue; speakText = speakText.split(k).join(String(fixes[k] ?? '')); }
      if(!speakText.trim()) return resolve();

      const u = new SpeechSynthesisUtterance(speakText);
      u.lang='ja-JP'; const v=chooseVoice(role)||jpVoice; if(v) u.voice=v;
      const eff=effRateFor(role, rate); u.rate=eff;
      let settled=false; const done=()=>{ if(!settled){ settled=true; resolve(); } };
      u.onend=done; u.onerror=done;
      try{ speechSynthesis.speak(u); }catch(_){ return done(); }
      const guardMs=Math.min(45000, 800 + (speakText.length*110)/Math.max(0.5, eff));
      setTimeout(done, guardMs);
    });
  }

  async function speakOrWait(text, rate=rateFor('narr'), role='narr'){
    const cleaned = stripMarkdownLight(scrub(text));
    if(!cleaned) return;
    const eff=effRateFor(role, rate);
    if(TTS_ENABLED){ const parts=splitChunksJa(cleaned); for(const p of parts){ await speakStrict(p, eff, role); } }
    else{ const ms=Math.min(20000, 800 + (cleaned.length*100)/Math.max(0.5, eff)); await new Promise(r=>setTimeout(r, ms)); }
  }

  async function runContentSpeech(scene){
    const f=(window.__ttsFlags || {readTag:true, readTitleKey:true, readTitle:true, readNarr:true});
    const muted=!TTS_ENABLED;
    if(!muted && f.readTag && scene.sectionTag){ const t=String(scene.sectionTag).replace(/^#/,'').replace(/_/g,' '); await speakOrWait(t, rateFor('tag'), 'tag'); }
    if(!muted && f.readTitleKey && scene.title_key){ await speakOrWait(scene.title_key, rateFor('titleKey'), 'titleKey'); }
    if(!muted && f.readTitle && scene.title){ await speakOrWait(scene.title, rateFor('title'), 'title'); }
    if(f.readNarr && scene.narr){ await speakOrWait(scene.narr, rateFor('narr'), 'narr'); }
  }

  /* ---------------- renderers ---------------- */
  function removeAllPlayButtons(){ try{ document.querySelectorAll('#playBtn, .playBtn').forEach(b=>b.remove()); }catch(_){} }
  function renderPlaceholder(scene){
    applyVersionToBody(scene||{uiVersion:'T'}); setBg((scene&&scene.base)||'#000'); const root=ensureSceneSurface();
    const btn=document.createElement('button'); btn.id='playBtn'; btn.className='playBtn'; btn.textContent='▶︎'; btn.style.zIndex='2000'; btn.style.pointerEvents='auto'; root.appendChild(btn);
    const start=async(ev)=>{ if(ev) ev.preventDefault(); btn.disabled=true; try{ speechSynthesis.cancel(); await primeTTS(); }catch(_){} removeAllPlayButtons(); requestAnimationFrame(()=>{ gotoNext(); }); };
    btn.addEventListener('click',start,{passive:false}); btn.addEventListener('touchend',start,{passive:false});
  }
  function renderContent(scene){
    try{ speechSynthesis.cancel(); }catch(_){} removeAllPlayButtons();
    applyVersionToBody(scene); setBg(scene.base||'#000'); const root=ensureSceneSurface();
    try{ document.body.style.setProperty('--symbol-bg-color', String(scene.base||'transparent')); }catch(_){}
    const sc=createSceneShell();
    if(scene.sectionTag){ const tag=document.createElement('div'); tag.className='section-tag'; tag.textContent=String(scene.sectionTag); sc.appendChild(tag); }
    if(scene.title_key){ const tk=document.createElement('div'); tk.className='title_key'; tk.textContent=String(scene.title_key||''); sc.appendChild(tk); }
    if(scene.title){ const t=document.createElement('div'); t.className='title'; t.textContent=String(scene.title||''); sc.appendChild(t); }
    if(scene.symbol){ const band=document.createElement('div'); band.className='symbol-bg'; const sym=document.createElement('div'); sym.className='symbol'; sym.textContent=String(scene.symbol||''); band.appendChild(sym); sc.appendChild(band); }
    if(scene.narr){ const n=document.createElement('div'); n.className='narr'; n.textContent=String(scene.narr||''); sc.appendChild(n); }
    root.appendChild(sc); applyReadableTextColor(scene.base||'#000', root); runEffectIfAny(scene, root);
  }
  function renderEffect(scene){
    try{ speechSynthesis.cancel(); }catch(_){} removeAllPlayButtons();
    applyVersionToBody(scene||{uiVersion:'T'}); setBg(scene.base||'#000'); const root=ensureSceneSurface(); runEffectIfAny(scene, root);
  }

  /* ---------------- scene type & sequencing --------------- */
  function getSceneType(scene){ if(!scene) return 'unknown'; if(typeof scene.type==='string') return scene.type;
    if(scene.version==='A'||scene.version==='B'||scene.version==='T') return 'content'; return 'content'; }

  const State={ scenes:[], idx:0 };
  async function playScene(scene){
    if(!scene) return; const kind=getSceneType(scene);
    switch(kind){
      case 'placeholder': renderPlaceholder(scene); break;
      case 'content':
        if(__playingLock) break; __playingLock=true;
        try{ renderContent(scene); await primeTTS(); await runContentSpeech(scene); } finally{ __playingLock=false; }
        if(typeof gotoNext==='function') await gotoNext(); break;
      case 'effect':
        if(__playingLock) break; __playingLock=true;
        try{ renderEffect(scene);
          const raw = (scene.t!==undefined?scene.t:(scene.duration!==undefined?scene.duration:(scene.durationMs!==undefined?scene.durationMs:(scene.effectDuration!==undefined?scene.effectDuration:1200))));
          const ms=Math.max(0, Math.min(60000, Number(raw)||1200)); await new Promise(r=>setTimeout(r, ms));
        } finally{ __playingLock=false; }
        if(typeof gotoNext==='function') await gotoNext(); break;
      default:
        if(__playingLock) break; __playingLock=true;
        try{ renderContent(scene); await primeTTS(); await runContentSpeech(scene); } finally{ __playingLock=false; }
        if(typeof gotoNext==='function') await gotoNext(); break;
    }
  }
  async function gotoPage(i){ if(!Array.isArray(State.scenes)) return; if(i<0||i>=State.scenes.length) return; State.idx=i; await playScene(State.scenes[i]); }
  async function gotoNext(){ await gotoPage(State.idx+1); }
  async function gotoPrev(){ await gotoPage(State.idx-1); }

  /* ---------------- boot ---------------- */
  async function boot(){
    try{
      try{ speechSynthesis.cancel(); }catch(_){}
      const res = await fetch('./scenes.json', { cache:'no-cache' });
      const data = await res.json();
      const scenes = data.scenes || data || [];
      State.scenes = scenes;

      try{
        // 1) tts-utils セットアップ（scenes.json 側の meta を適用）
        if (window.__ttsUtils && data && data.videoMeta && data.videoMeta.tts) {
          __ttsUtils.setup(data.videoMeta.tts);
        } else if (window.__ttsUtils) {
          __ttsUtils.setup({}); // 安全デフォルト
        }

        // 2) debug_config 側の voice.filter を tts-utils に反映（あれば優先）
        const VC = (window.__dbgConfig && window.__dbgConfig.voice) || null;
        if (window.__ttsUtils && VC && VC.filter && typeof VC.filter.jaOnly === 'boolean') {
          __ttsUtils.setup({ filter: { jaOnly: !!VC.filter.jaOnly } });
        }

        // 3) debug_config 側の voice.defaults を __ttsVoiceMap に反映（未設定ロールのみ）
        window.__ttsVoiceMap = window.__ttsVoiceMap || {};
        if (VC && VC.defaults) {
          ['tag','titleKey','title','narr'].forEach(function(k){
            if (!window.__ttsVoiceMap[k] && VC.defaults[k]) {
              window.__ttsVoiceMap[k] = VC.defaults[k]; // 例: 'ja-JP|Kyoko'
            }
          });
        }
      } catch(_){}

      await gotoPage(0); // Page-1 placeholder
    } catch(e){
      console.error('Failed to load scenes.json', e);
      ensureSceneSurface(); setBg('#000');
      const root=document.getElementById('content');
      const sc=createSceneShell();
      setTextInScene(sc, '.title', 'scenes.json の読み込みに失敗しました');
      root.appendChild(sc);
    }
  }

  /* ---------------- public API ---------------- */
  window.__player = window.__player || {
    next:()=>gotoNext(), prev:()=>gotoPrev(), play:()=>gotoNext(), stop:()=>{}, restart:()=>gotoPage(0), goto:(i)=>gotoPage(i|0),
    info:()=>({ index:State.idx, total:(State.scenes||[]).length, playing:!!__playingLock }),
    getScene:()=> (State.scenes && State.scenes[State.idx]) || null
  };
  window.__playerCore = { gotoNext, gotoPrev, gotoPage, rateFor, effRateFor, chooseVoice, primeTTS };

  if(document.readyState==='complete'||document.readyState==='interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot, { once:true });
})();
