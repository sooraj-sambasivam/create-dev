export { createRecorder, type NarrationContext, type NarrationInput, type Recorder } from "./session";
export { HOLD_KEY, DOUBLE_TAP_MS, initialKeyState, reduceKey, type KeyAction, type KeyEvent, type KeyState } from "./keys";
export {
  bindKeys,
  createVoice,
  fetchVoiceToken,
  DRAIN_TIMEOUT_MS,
  TranscribeUnavailableError,
  type SpeechRecognitionLike,
  type VoiceController,
  type VoiceDeps,
  type VoiceOptions,
  type VoiceState,
} from "./voice";
export { exitDestination, exitNarrate, type ExitDeps, type NarrateDestination, type NarrateExitKind, type NarrateOrigin } from "./exit";
