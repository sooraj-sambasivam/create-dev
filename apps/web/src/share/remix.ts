import type { Screen } from "@create/shared";
import { useScreenStore } from "../store/screenStore";
import { useWorkspaceStore } from "../store/workspaceStore";

export const REMIX_SUMMARY = "Remixed from a shared prototype";

/**
 * Open a shared page in the builder as a new chat.
 *
 * The shared route loads the user's active chat into useScreenStore at startup, and the workspace
 * mirror writes the live page back into the active chat. So the remix must not touch the live page
 * while that chat is active. newChat() first saves the active chat's live page and makes a blank
 * chat active. Only then is the shared page set, so the mirror writes it into the new chat.
 *
 * Returns the id of the new chat. `open` navigates to the builder (the default reloads "/").
 */
export function remixScreen(screen: Screen, open: () => void = () => window.location.assign("/")): string {
  const chatId = useWorkspaceStore.getState().newChat();
  useScreenStore.getState().setMode("text");
  useScreenStore.getState().setScreen(screen, REMIX_SUMMARY);
  open();
  return chatId;
}
