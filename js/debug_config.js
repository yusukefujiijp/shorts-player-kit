/*!
Project: shorts-player-kit
File:    js/debug_config.js
Role:    Debug Panel Config (機能露出とUIバッジ方針を一元管理)
Notes:
  - sections/buttons/locks は UI 構成・露出ゲート。
  - rolesRate は perRoleAbs（0.5〜2.0, default=1.4）。
  - badges.motion は speaking/paused/pending のモーション方針（展開パネル側のみが対象）。
  - quickbar は「閉じた黒バー」に出す最小コントロールを制御。
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

    /* パネルのセクション可視性（展開時の構成） */
    sections: {
      status:   true,
      note:     false,
      controls: true,
      goto:     true,
      ttsFlags: true,
      voices:   true,
      baseRate: false   // ベースRate行は非表示（役割別のみを使用）
    },

    /* 表示する操作ボタン（展開時の露出） */
    buttons: {
      prev:       true,
      next:       true,
      play:       true,
      stop:       true,
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

    /* ステータス・バッジの方針（展開パネル側） */
    badges: {
      motion: 'auto' // 'auto' | 'static' | 'off'
    },

    /* 閉じた黒バー（QuickBar）の露出コントロール */
    quickbar: {
      enabled: true,
      items: {
        play:       true,
        stop:       true,
        stopStatus: true,  // 「Stopping… / Stopped ✓」チップ
        ack:        false  // ACK詳細は閉バーでは出さない
      }
    }
  };

  window.__dbgConfig = deepFreeze(cfg);
})();