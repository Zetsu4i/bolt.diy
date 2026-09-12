import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { chatId as chatIdAtom } from '~/lib/persistence';

/**
 * Subscribes to the persistence layer's chat id atom.
 * - undefined while on the landing page (no chat created yet)
 * - the chat id once a chat is opened / created
 */
export function useChatId(): string | undefined {
  const id = useStore(chatIdAtom);

  return id;
}

/**
 * Runs the callback once when the chat transitions from "not started" to
 * "started" (first message created the chat), passing the new chat id.
 */
export function useOnChatStarted(callback: (chatId: string) => void) {
  const id = useChatId();

  useEffect(() => {
    if (id) {
      callback(id);
    }
    // only fire when the id appears / changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}
