/*!
Project: shorts-player-kit
File:    js/debug_config.js
Role:    Debug Panel Config (コード側機能ゲーティング)
Notes:
  - Noteセクションは既定で非表示。
  - 速度規範は perRoleAbs（0.5〜2.0, default=1.4）。
  - 既定TTSフラグやロール別の既定ボイスをここで一括指定。
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
    // 初期表示は折りたたみ
    collapsedDefault: true,

    // パネルのセクション可視性
    sections: {
      status:   true,
      note:     false,
      controls: true,
      goto:     true,
      ttsFlags: true,
      voices:   true,
      baseRate: false   // ベースRate行は非表示（役割別のみを使用）
    },

    // 表示する操作ボタン（ここで機能露出を一元管理）
    buttons: {
      prev:       true,
      next:       true,
      play:       true,
      stop:       true,
      restart:    true,
      goto:       true,
      hardreload: true   // ★ 新設：ハードリロードをUIに出すか
    },

    // UI上の編集ロック（必要に応じて制限）
    locks: {
      allowTTSFlagEdit: true,
      allowVoiceSelect: true
    },

    // 速度規範（役割別の絶対値）
    rateMode: 'perRoleAbs',
    rolesRate: { min:0.5, max:2.0, step:0.1, defaultAbs:1.4 },

    // 互換（perRoleAbsでは未使用）
    rate: { min:0.5, max:2.0, step:0.05 },

    // TTSフラグ既定（初期チェック状態）
    ttsFlagsDefault: { readTag:true, readTitleKey:true, readTitle:true, readNarr:true },

    // 既定ボイスと候補ヒント、フィルタ（JAのみに絞る）
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
    }
  };

  window.__dbgConfig = deepFreeze(cfg);
})();