/**
 * Where "More in chat" sends a pointer answer. The chat thread registers itself here; with no sink
 * registered the pointer shows its short answer only.
 */
export type AnswerSink = (question: string, answer: string) => void;

let sink: AnswerSink | null = null;

/** Registers the chat thread's appender. Returns an unregister function. */
export function registerAnswerSink(fn: AnswerSink): () => void {
  sink = fn;
  return () => {
    if (sink === fn) sink = null;
  };
}

export const hasAnswerSink = () => sink !== null;

export function sendAnswerToChat(question: string, answer: string): boolean {
  if (!sink) return false;
  sink(question, answer);
  return true;
}
