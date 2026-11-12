/**
 * Входящие звонки через VoIP-пуши Telnyx (iOS).
 *
 * Папка ios/ не хранится в git и каждый раз генерируется `expo prebuild`, поэтому
 * всё нативное, что требует @telnyx/react-voice-commons-sdk, вносится здесь:
 *
 * - фоновые режимы `voip` (PushKit будит убитое приложение) и `audio`
 *   (разговор не обрывается, когда экран гаснет);
 * - AppDelegate становится делегатом PushKit и отдаёт токен и пуши SDK. Сам
 *   PKPushRegistry создаёт react-native-voip-push-notification и назначает
 *   делегатом именно AppDelegate, поэтому методы должны быть здесь.
 *
 * На каждый VoIP-пуш SDK сразу вызывает CallKit `reportNewIncomingCall` в нативном
 * коде, до загрузки JS. Без этого iOS убивает приложение и перестаёт доставлять ему
 * VoIP-пуши, так что эту часть в JS переносить нельзя.
 *
 * `aps-environment` добавляет плагин expo-notifications.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARK = '// @voip-calls';

function withBackgroundModes(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    ['voip', 'audio', 'remote-notification'].forEach((mode) => modes.add(mode));
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });
}

/** Вставка, которая падает на сборке, а не молча пропускается, если шаблон Expo поменялся. */
function insertOnce(src, anchor, insertion, { after = true } = {}) {
  if (!anchor.test(src)) {
    throw new Error(`withVoipCalls: не нашёл в AppDelegate.swift место для вставки (${anchor})`);
  }
  return src.replace(anchor, (match) => (after ? match + insertion : insertion + match));
}

function patchAppDelegate(src) {
  if (src.includes(MARK)) return src;

  src = insertOnce(src, /^/, `import PushKit ${MARK}\nimport TelnyxVoiceCommons\n`, { after: false });

  src = insertOnce(src, /class AppDelegate: ExpoAppDelegate/, ', PKPushRegistryDelegate');

  src = insertOnce(
    src,
    /\n(\s*)return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\)/,
    `\n    // PushKit регистрируется до React: пуш, разбудивший убитое приложение, не должен ждать JS.\n    TelnyxVoipPushHandler.initializeVoipRegistration()`,
    { after: false },
  );

  const delegateMethods = `

  // MARK: - VoIP push (PushKit) ${MARK}
  public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    TelnyxVoipPushHandler.shared.handleVoipTokenUpdate(pushCredentials, type: type)
  }

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    TelnyxVoipPushHandler.shared.handleVoipPush(payload, type: type, completion: completion)
  }`;

  // Методы — в конец класса AppDelegate: перед объявлением следующего класса в файле.
  return insertOnce(src, /\n}\n\s*\nclass ReactNativeDelegate/, delegateMethods, { after: false });
}

function withVoipAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withVoipCalls: ожидался AppDelegate на Swift');
    }
    cfg.modResults.contents = patchAppDelegate(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = function withVoipCalls(config) {
  return withVoipAppDelegate(withBackgroundModes(config));
};
module.exports.patchAppDelegate = patchAppDelegate;
