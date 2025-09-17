/*!
Project:  shorts-player-kit
File:     js/debug_config.js
Role:     Debug Panel Config (機能露出とUIバッジ/クイックバー方針を一元管理)
Notes:
  - sections/buttons/locks は UI 構成・露出ゲート。
  - rolesRate は perRoleAbs（0.5〜2.0, default=1.4）。
  - badges.motion は speaking/paused/pending バッジのモーション方針:
      'auto'   : 既定（環境に応じて可動）
      'static' : 静止表示（読みやすさ重視）
      'off'    : 非表示（計測や録画時など）
  - quickbar は「閉じた状態でも最優先だけ操作・確認」するエリア。
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
      baseRate: false,   // ベースRate行は非表示（役割別のみを使用）
			
			quickbar: true // ← false にするとQuickBarを非表示
    },

    /* 表示する操作ボタン（ここで機能露出を一元管理） */
    buttons: {
      prev:       true,
      next:       true,
      play:       true,
      stop:       true,
      restart:    true,
      goto:       true,
      hardreload: true,   // ⟲ Hard Reload をUIに出すか
      hardstop:   false   // ⛔ Hard Stop（強制停止ラボ機能）—現在は非表示（保持のみ）
    },

    /* QuickBar（パネル折りたたみ時の最小UI） */
    quickbar: {
      enabled: true,        // QuickBar を使うか
      side: 'right',        // 'left' | 'right'
      items: {
        play:   true,       // ▶︎ Play（別ボタン）
        stop:   true,       // ■ Stop（別ボタン）
        stopAck:true        // Stop ACK（即時/確定を小バッジで表示）
      },
      style: {
        // iOS推奨タップターゲット 44pt を既定（px相当; 実表示は CSS 側で調整）
        sizePx: 44,
        gapPx:  10,
        labels: false,      // ラベル文字の表示（false でアイコンのみ）
        contrast: 'auto'    // 'auto' | 'light' | 'dark'
      }
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