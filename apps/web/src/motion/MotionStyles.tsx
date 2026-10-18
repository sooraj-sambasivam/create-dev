import { useMemo } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useMotionStore } from "./motionStore";
import { exportMotionCss } from "./presets";

const EMPTY = {};

/** Injects the active chat's motion CSS. Mount once anywhere; it renders only a <style>. */
export function MotionStyles() {
  const chatId = useWorkspaceStore((s) => s.activeChatId);
  const map = useMotionStore((s) => (chatId ? s.byChat[chatId] : undefined)) ?? EMPTY;
  const css = useMemo(() => exportMotionCss(map), [map]);
  if (!css) return null;
  return <style data-motion-styles>{css}</style>;
}
