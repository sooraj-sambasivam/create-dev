/**
 * Spoken or typed lines that hand the form to the agent cursor ("add a row for me", "let the agent do it").
 * Deliberately narrow: a bare "add a row" is still an ordinary edit command.
 */
const HANDOFF = /\b(?:let|have|get|ask)\s+(?:the\s+|your\s+)?(?:agent|ai|pip|assistant|bot)\s+(?:do|add|fill|handle|take|enter|put)\b/i;
const FOR_ME = /\bfor me\b|\bon my behalf\b|\bby yourself\b/i;
const ADD_ROW = /\b(?:add|enter|put|fill|submit|insert|create)\b[^.?!]*\b(?:row|entry|line|slot|stop|item|form)\b/i;
const DO_IT = /\b(?:do|handle|take care of)\s+(?:it|that|this)\s+for me\b/i;

export function isAgentRowCommand(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 200) return false;
  if (HANDOFF.test(t) || DO_IT.test(t)) return true;
  return FOR_ME.test(t) && ADD_ROW.test(t);
}
