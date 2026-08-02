"use client";

import { useEffect, useRef } from "react";
import type { ChatSummary } from "@/lib/chat";
import { markMessagesDelivered } from "@/lib/chat";
import { showMessageNotification, requestNotificationPermission } from "@/lib/notifications";
import { toast } from "@/hooks/use-toast";

interface DirectoryLite {
  name: string;
  photoURL: string;
}

/**
 * Watches the user's chat list and fires a browser notification whenever a
 * new message arrives from someone else while that chat isn't the one
 * currently open. Notifications use the chatId as their `tag`, so opening
 * the conversation (see ChatView -> clearNotificationsForChat) removes it
 * from the tray automatically, the same way a phone app would.
 */
export function useMessageNotifications(
  myUid: string | undefined,
  chats: ChatSummary[],
  directory: Record<string, DirectoryLite>,
  activeChatId: string | null,
  onOpenChat: (chatId: string) => void
) {
  const lastSeen = useRef<Map<string, number>>(new Map());
  const initialized = useRef(false);
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;

  useEffect(() => {
    if (myUid) requestNotificationPermission();
  }, [myUid]);

  useEffect(() => {
    if (!myUid) return;

    // Don't fire notifications for the very first snapshot of pre-existing messages.
    const isFirstRun = !initialized.current;
    if (isFirstRun) initialized.current = true;

    chats.forEach((chat) => {
      const ts = (chat.lastMessageAt as any)?.toMillis?.() ?? 0;
      const previous = lastSeen.current.get(chat.id) ?? ts;
      lastSeen.current.set(chat.id, ts);

      if (isFirstRun) {
        if (chat.unread?.[myUid] && chat.unread[myUid] > 0 && chat.lastSenderId !== myUid) {
          markMessagesDelivered(chat.id, myUid);
        }
        return;
      }
      if (ts <= previous) return;
      if (chat.lastSenderId === myUid) return;
      
      markMessagesDelivered(chat.id, myUid);

      if (chat.id === activeChatIdRef.current && document.visibilityState === "visible") return;
      if (!chat.lastMessage) return;

      const otherUid = chat.participants.find((p) => p !== myUid);
      const other = otherUid ? directory[otherUid] : undefined;

      if (document.visibilityState === "visible") {
        toast({
          title: other?.name || "New message",
          description: chat.lastMessage,
        });
      } else {
        showMessageNotification({
          chatId: chat.id,
          title: other?.name || "New message",
          body: chat.lastMessage,
          icon: other?.photoURL,
          onClick: () => onOpenChat(chat.id),
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, myUid, directory]);
}
