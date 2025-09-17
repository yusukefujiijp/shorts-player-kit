/*!
Project: shorts-player-kit
File:    js/debug_config.js
Role:    Debug Panel Config (機能露出・UI方針を一元管理)
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
      baseRate: false
    },

    /* Quick Bar（閉状態の黒バー）の方針 */
    quickbar: {
      enabled: true,
      mode: 'twoRows',                 // ★ 常時2段固定
      items: { play:true, stop:true, ack:true } // Row1: Play/Stop/ACK を表示
    },

    /* 展開パネル：表示する操作ボタン（Play/StopはQuickBarへ集約） */
    buttons: {
      prev:       true,
      next:       true,
      play:       false,   // ★ 重複を避けるため非表示
      stop:       false,   // ★ 重複を避けるため非表示
      restart:    true,
      goto:       true,
      hardreload: true,
      hardstop:   false
    },

    /* UI上の編集ロック */
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

    /* バッジモーション（展開パネルの speaking/paused/pending に使用） */
    badges: { motion: 'auto' } // 'auto' | 'static' | 'off'
  };

  window.__dbgConfig = deepFreeze(cfg);
})();