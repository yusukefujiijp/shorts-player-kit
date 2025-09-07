/*!
Project: shorts-player-kit
File:    js/debug_config.js
Role:    Debug Panel Config (コード側機能ゲーティング)
Notes:
  - Noteセクションは既定で非表示。
  - 速度規範は perRoleAbs（0.5〜2.0, default=1.4）。
  - 既定TTSフラグやロール別の既定ボイスをここで一括指定できるようにした。
*/

(function(){
  'use strict';

  function deepFreeze(o){
    if (!o || typeof o !== 'object') return o;
    Object.getOwnPropertyNames(o).forEach(function(prop){
      const v = o[prop];
      if (v && typeof v === 'object') deepFreeze(v);
    });
    return Object.freeze(o);
  }

  var cfg = {
    collapsedDefault: true,

    sections: {
      status:   true,
      note:     false,
      controls: true,
      goto:     true,
      ttsFlags: true,
      voices:   true,
      baseRate: false   // ← 「Rate:」のベース行は非表示（役割別のみ）
    },

    buttons: { prev:true, next:true, play:true, stop:true, restart:true, goto:true },

    locks: { allowTTSFlagEdit:true, allowVoiceSelect:true },

    // 速度規範モード
    rateMode: 'perRoleAbs',

    // 役割別の絶対レート帯域（0.5〜2.0）; 既定=1.4
    rolesRate: { min:0.5, max:2.0, step:0.1, defaultAbs:1.4 },

    // 互換（perRoleAbsでは未使用）
    rate: { min:0.5, max:2.0, step:0.05 },

    // ★ TTSフラグ既定（パネル初期チェック状態）
    ttsFlagsDefault: { readTag:true, readTitleKey:true, readTitle:true, readNarr:true },

    // ★ 既定ボイスと候補ヒント、フィルタ（JAのみ等）
    voice: {
      // 安定ID: voiceURI > "lang|name" > name
      // 例: 'ja-JP|Kyoko' を TitleKey の既定にしたいなら↓
      defaults: {
        tag:      'ja-JP|Kyoko',   // ← 例：Tag=Kyoko 既定
        titleKey: 'ja-JP|Kyoko',   // ← 例：TitleKey=Kyoko 既定
        title:    '',              // 未指定ならAuto（ピック or 既存設定）
        narr:     ''               // 同上
      },
      // ピック用の優先ヒント（あれば __ttsUtils.pick(role) が参照）
      // 値は "lang|name" / "name" / voiceURI の配列でOK
      hints: {
        tag:      ['ja-JP|Kyoko', 'Kyoko'],
        titleKey: ['ja-JP|Kyoko', 'Kyoko'],
        title:    [],
        narr:     []
      },
      // カタログ表示フィルタ（trueで日本語系に絞る）
      filter: { jaOnly: true }
    }
  };

  window.__dbgConfig = deepFreeze(cfg);
})();