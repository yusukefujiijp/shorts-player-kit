/*!
Project: shorts-player-kit
File:    js/debug_config.js
Role:    Debug Panel Config (機能露出とUIバッジの方針を一元管理)
Notes:
  - QuickBar は 2 段固定。Row1: Debug / Play / Stop / Next / ACK, Row2: status。
  - 展開パネルは speaking/paused/pending（実験用パルス）を維持。
  - badges.motion: 'auto' | 'static' | 'off'
  - レート規範は「役割別・絶対 (perRoleAbs)」。baseRate は UI 既定非表示。
  - 本設定は「デフォルト ← ユーザー上書き」を安全にマージしてから凍結。
*/
(function(){
  'use strict';

  // ---- merge: defaults ← overrides（配列は置換、プレーンオブジェクトは再帰）----
  function isPlainObject(v){
    return !!v && Object.prototype.toString.call(v) === '[object Object]';
  }
  function deepMerge(base, over){
    if (!isPlainObject(base)) return over;
    var out = {};
    Object.keys(base).forEach(function(k){ out[k] = base[k]; });
    if (isPlainObject(over)){
      Object.keys(over).forEach(function(k){
        var bv = out[k], ov = over[k];
        if (Array.isArray(ov)) out[k] = ov.slice();
        else if (isPlainObject(ov) && isPlainObject(bv)) out[k] = deepMerge(bv, ov);
        else out[k] = ov;
      });
    }
    return out;
  }

  function deepFreeze(o){
    if (!o || typeof o !== 'object') return o;
    Object.getOwnPropertyNames(o).forEach(function(prop){
      var v = o[prop];
      if (v && typeof v === 'object') deepFreeze(v);
    });
    return Object.freeze(o);
  }

  // ---- Defaults（「役割別・絶対」レート / iOS-first / Debug-UI 二段QuickBar）----
  var defaults = {
    /* 初期表示は折りたたみ */
    collapsedDefault: true,

    /* パネルのセクション可視性 */
    sections: {
      status:   true,
      note:     false,
      controls: true,
      goto:     true,
      ttsFlags: true,
      voices:   true,
      baseRate: false
    },

    /* 表示する操作ボタン（展開パネル側） */
    buttons: {
      prev:       true,
      next:       true,   // QuickBarにも next を昇格するが、展開側にも残す
      play:       false,  // QuickBar 側に集約
      stop:       false,  // QuickBar 側に集約
      restart:    true,
      goto:       true,
      hardreload: true,
      hardstop:   false
    },

    /* UI上の編集ロック（必要に応じて制限） */
    locks: {
      allowTTSFlagEdit: true,
      allowVoiceSelect: true
    },

    /* 速度規範（役割別の絶対値） */
    rateMode: 'perRoleAbs',
    rolesRate: { min:0.5, max:2.0, step:0.1, defaultAbs:1.4 },

    /* 互換（perRoleAbsでは未使用） */
    rate: { min:0.5, max:2.0, step:0.05 },

    /* TTSフラグ既定（初期チェック状態） */
    ttsFlagsDefault: { readTag:true, readTitleKey:true, readTitle:true, readNarr:true },

    /* 既定ボイスと候補ヒント、フィルタ（JAのみに絞る） */
    voice: {
      defaults: {
        tag:      'ja-JP|Kyoko',
        titleKey: 'ja-JP|Kyoko',
        title:    'ja-JP|Kyoko',
        narr:     'ja-JP|Kyoko'
      },
      hints: {
        tag:      ['ja-JP|Kyoko', 'Kyoko'],
        titleKey: ['ja-JP|Kyoko', 'Kyoko'],
        title:    ['ja-JP|Kyoko', 'Kyoko'],
        narr:     ['ja-JP|Kyoko', 'Kyoko']
      },
      filter: { jaOnly: true }
    },

    /* QuickBar 方針 */
    quickbar: {
      enabled: true,
      mode: 'twoRows',
      items: { play:true, stop:true, next:true, ack:true }
    },

    /* ステータス・バッジの方針（展開パネルのラボ用） */
    badges: {
      motion: 'auto' // 'auto' | 'static' | 'off'
    }
  };

  // 既存の window.__dbgConfig があれば優先してマージ（上書きは**ユーザー側**のみ）
  var incoming = (typeof window.__dbgConfig === 'object' && window.__dbgConfig) ? window.__dbgConfig : {};
  var merged   = deepMerge(defaults, incoming);
  window.__dbgConfig = deepFreeze(merged);
})();