"use client";

// Keeps a live reference to open Notification objects, keyed by chatId,
// so we can auto-dismiss them from the notification tray the moment the
// user opens that conversation (mirrors how phone apps clear a notification
// once you've read the message).
const openNotifications = new Map<string, Notification>();

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function showMessageNotification(opts: {
  chatId: string;
  title: string;
  body: string;
  icon?: string;
  onClick?: () => void;
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // already looking at the app

  // Replace any earlier unread notification for this same chat instead of stacking.
  openNotifications.get(opts.chatId)?.close();

  const notification = new Notification(opts.title, {
    body: opts.body,
    icon: opts.icon,
    tag: opts.chatId,
  });

  notification.onclick = () => {
    window.focus();
    opts.onClick?.();
    notification.close();
    openNotifications.delete(opts.chatId);
  };

  notification.onclose = () => {
    openNotifications.delete(opts.chatId);
  };

  openNotifications.set(opts.chatId, notification);
}

/** Call this when the user actually reads a chat, e.g. by opening it. */
export function clearNotificationsForChat(chatId: string) {
  openNotifications.get(chatId)?.close();
  openNotifications.delete(chatId);
}
