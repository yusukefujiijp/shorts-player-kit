/*!
Project: shorts-player-kit
File:    js/debug_config.js
Role:    Debug Panel Config (機能露出とUIバッジの方針を一元管理)
Notes:
  - sections/buttons/locks は UI 構成・露出ゲート。
  - rolesRate は perRoleAbs（0.5〜2.0, default=1.4）。
  - badges.motion は speaking/paused/pending バッジのモーション方針:
      'auto'   : 既定（環境に応じ可動 / 将来の動き抑制にも整合）
      'static' : 静止表示（読みやすさ重視）
      'off'    : 非表示（計測や録画時など）
*/

(function(){
  'use strict';

  function deepFreeze(o){
    if (!o || typeof o !== 'object') return o;
    Object.getOwnPropertyNames(o).forEach(function(prop){
      var v = o[prop];
      if (v && typeof v === 'object') deepFreeze(v);
    });
    return Object.freeze(o);
  }

  var cfg = {
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
      baseRate: false   // ベースRate行は非表示（役割別のみを使用）
    },

    /* 表示する操作ボタン（ここで機能露出を一元管理） */
    buttons: {
      prev:       true,
      next:       true,
      play:       true,
      stop:       true,
      restart:    true,
      goto:       true,
      hardreload: true,  // ⟲ Hard Reload をUIに出すか
      hardstop:   true   // ⛔ Hard Stop（強制停止ラボ機能）をUIに出すか
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
      // 安定ID: voiceURI > "lang|name" > name
      defaults: {
        tag:      'ja-JP|Kyoko',
        titleKey: 'ja-JP|Kyoko',
        title:    '',
        narr:     ''
      },
      hints: {
        tag:      ['ja-JP|Kyoko', 'Kyoko'],
        titleKey: ['ja-JP|Kyoko', 'Kyoko'],
        title:    [],
        narr:     []
      },
      filter: { jaOnly: true }
    },

    /* ステータス・バッジの方針（debug_panel.js が参照） */
    badges: {
      motion: 'auto' // 'auto' | 'static' | 'off'
    }
  };

  window.__dbgConfig = deepFreeze(cfg);
})();