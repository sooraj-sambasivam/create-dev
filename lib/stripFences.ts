const FENCE = /```(?:html)?\s*([\s\S]*?)```/i;

export function stripFences(text: string): string {
  const match = text.match(FENCE);
  return (match ? match[1] : text).trim();
}
