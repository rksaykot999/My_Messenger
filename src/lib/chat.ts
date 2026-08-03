import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { supabase } from "@/lib/supabase";

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
  status: "sent" | "delivered" | "read";
  type?: "text" | "image" | "video" | "audio" | "file";
  mediaURL?: string;
  reactions?: Record<string, string>;
  replyTo?: { id: string; text: string; senderId: string } | null;
  deleted?: boolean;
  edited?: boolean;
  readAt?: Timestamp | null;
  deletedFor?: string[];
}

export interface ChatSummary {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastSenderId?: string;
  unread?: Record<string, number>;
  typing?: Record<string, Timestamp | null>;
  isGroup?: boolean;
  groupName?: string;
  groupAvatar?: string;
  adminId?: string;
  quickEmoji?: string;
}

export interface DirectoryUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  status?: string;
  online?: boolean;
  lastSeen?: Timestamp | null;
  blockedUsers?: string[];
  friends?: string[];
  incomingRequests?: string[];
  outgoingRequests?: string[];
  accountMode?: "public" | "private";
  bio?: string;
  location?: string;
  website?: string;
  occupation?: string;
}

// Deterministic chat id for a 1:1 conversation between two users.
export function directChatId(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join("_");
}

export async function ensureChat(uidA: string, uidB: string) {
  const chatId = directChatId(uidA, uidB);
  const ref = doc(db, "chats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [uidA, uidB],
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      unread: { [uidA]: 0, [uidB]: 0 },
    });
  }
  return chatId;
}

export async function createGroupChat(myUid: string, participantUids: string[], groupName: string) {
  const allParticipants = [myUid, ...participantUids];
  const chatRef = doc(collection(db, "chats"));
  
  const initialUnread: Record<string, number> = {};
  allParticipants.forEach(uid => {
    initialUnread[uid] = 0;
  });

  await setDoc(chatRef, {
    participants: allParticipants,
    isGroup: true,
    groupName,
    adminId: myUid,
    lastMessage: "Group created",
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    unread: initialUnread,
  });

  return chatRef.id;
}

export function subscribeChats(
  uid: string,
  cb: (chats: ChatSummary[]) => void
) {
  const q = query(
    collection(db, "chats"),
    where("participants", "array-contains", uid)
  );
  return onSnapshot(q, (snap) => {
    const chats = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ChatSummary));
    chats.sort(
      (a, b) =>
        (b.lastMessageAt as any)?.toMillis?.() - (a.lastMessageAt as any)?.toMillis?.()
    );
    cb(chats);
  });
}

export function subscribeMessages(
  chatId: string,
  cb: (messages: ChatMessage[]) => void
) {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ChatMessage)));
  });
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
  media?: { type: "image" | "video" | "audio" | "file"; mediaURL: string },
  replyTo?: { id: string; text: string; senderId: string } | null
) {
  const chatRef = doc(db, "chats", chatId);
  await addDoc(collection(chatRef, "messages"), {
    text,
    senderId,
    createdAt: serverTimestamp(),
    status: "sent",
    ...(media ? { type: media.type, mediaURL: media.mediaURL } : { type: "text" }),
    ...(replyTo ? { replyTo } : {}),
  });
  const snap = await getDoc(chatRef);
  const data = snap.data() as any;
  const otherUid = (data?.participants || []).find((p: string) => p !== senderId);
  const previewText = media ? (media.type === "image" ? "📷 Photo" : media.type === "video" ? "🎥 Video" : media.type === "file" ? "📁 File" : "🎤 Voice") : text;
  const updates: Record<string, any> = {
    lastMessage: previewText,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`typing.${senderId}`]: null,
    [`unread.${senderId}`]: 0,
  };

  const participants = data?.participants || [];
  participants.forEach((p: string) => {
    if (p !== senderId) {
      updates[`unread.${p}`] = (data?.unread?.[p] || 0) + 1;
    }
  });

  await updateDoc(chatRef, updates);

  // --- CLIENT-SIDE PUSH NOTIFICATIONS ---
  // Only attempt to send notifications to others
  if (participants.length > 1) {
    try {
      const { sendDirectPushNotification } = await import('./fcm');
      
      // Get sender's name and photo for the title/icon
      const senderSnap = await getDoc(doc(db, 'users', senderId));
      const senderData = senderSnap.data() as any;
      const senderName = senderData?.name || 'New Message';
      const senderPhoto = senderData?.photoURL || '';

      // Send a push notification to each other participant
      for (const p of participants) {
        if (p === senderId) continue;
        
        const recipientSnap = await getDoc(doc(db, 'users', p));
        const recipientData = recipientSnap.data() as any;
        if (recipientData?.fcmToken) {
          sendDirectPushNotification(
            recipientData.fcmToken,
            senderName,
            previewText,
            { chatId, senderId, senderName, senderPhoto }
          );
        }
      }
    } catch (err) {
      console.error('Failed to trigger direct push notification:', err);
    }
  }
}

/** Uploads a photo/video/audio attachment for a chat and returns its download URL. */
export async function uploadChatMedia(
  chatId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
  const fileName = `${chatId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  try {
    onProgress?.(10);
    
    // Explicitly set contentType
    let contentType = file.type;
    if (!contentType || contentType === 'application/octet-stream') {
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)) contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
      else if (['mp4', 'webm', 'mov'].includes(fileExt)) contentType = `video/${fileExt}`;
      else if (['m4a', 'wav', 'mp3', 'aac', 'ogg'].includes(fileExt)) contentType = `audio/${fileExt}`;
      else contentType = 'application/octet-stream';
    }

    // Capacitor Android fails to upload Blob/File objects via fetch ("Failed to fetch").
    // Converting the File to an ArrayBuffer ensures it uploads smoothly on all platforms.
    const arrayBuffer = await file.arrayBuffer();

    const { data, error } = await supabase.storage
      .from('chatMedia')
      .upload(fileName, arrayBuffer, { 
        contentType,
        cacheControl: '3600',
        upsert: false 
      });

    if (error) {
      throw error;
    }

    onProgress?.(100);

    const { data: publicUrlData } = supabase.storage
      .from('chatMedia')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (error: any) {
    console.error("Supabase Storage upload error:", error);
    throw new Error(error.message || "Failed to upload media to Supabase.");
  }
}

/** Marks every message from the other participant as "read" (double blue check). */
export async function markMessagesRead(chatId: string, myUid: string) {
  try {
    const q = query(
      collection(db, "chats", chatId, "messages"),
      where("status", "in", ["sent", "delivered"])
    );
    const msgsSnap = await getDocs(q);
    const batch = writeBatch(db);
    let any = false;
    msgsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.senderId !== myUid) {
        batch.update(d.ref, { status: "read", readAt: serverTimestamp() });
        any = true;
      }
    });
    if (any) await batch.commit();
  } catch {
    // Best-effort — if rules/network hiccup, the sender just keeps seeing "sent".
  }
}

/** Marks every message from the other participant as at least "delivered". */
export async function markMessagesDelivered(chatId: string, myUid: string) {
  try {
    const q = query(
      collection(db, "chats", chatId, "messages"),
      where("status", "==", "sent")
    );
    const msgsSnap = await getDocs(q);
    const batch = writeBatch(db);
    let any = false;
    msgsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.senderId !== myUid) {
        batch.update(d.ref, { status: "delivered" });
        any = true;
      }
    });
    if (any) await batch.commit();
  } catch {
    // Best-effort.
  }
}

/** Broadcasts (or clears) that I'm typing in this chat. */
export async function setTypingStatus(chatId: string, uid: string, isTyping: boolean) {
  try {
    await updateDoc(doc(db, "chats", chatId), {
      [`typing.${uid}`]: isTyping ? serverTimestamp() : null,
    });
  } catch {
    // Chat doc may not exist yet — fine, nothing to broadcast to.
  }
}

/** Subscribes to a single chat document (used to read the `typing` map live). */
export function subscribeChatDoc(chatId: string, cb: (chat: ChatSummary | null) => void) {
  return onSnapshot(doc(db, "chats", chatId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as ChatSummary) : null);
  });
}

export async function editMessage(
  chatId: string,
  messageId: string,
  newText: string
) {
  const msgRef = doc(db, "chats", chatId, "messages", messageId);
  await updateDoc(msgRef, {
    text: newText,
    edited: true,
  });
  
  // Update lastMessage if this was the latest message
  // (In a real app, you'd check if it's the last message before updating)
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (snap.exists() && (snap.data() as any).lastMessage) {
    // Just a basic heuristic or you can omit updating the chat list preview
  }
}

export async function markChatRead(chatId: string, uid: string) {
  try {
    await updateDoc(doc(db, "chats", chatId), { [`unread.${uid}`]: 0 });
  } catch {}
}

/** Sets the quick message emoji for a chat */
export async function setQuickEmoji(chatId: string, emoji: string) {
  await updateDoc(doc(db, "chats", chatId), { quickEmoji: emoji });
}

/** Toggles an emoji reaction from `uid` on a single message. */
export async function toggleReaction(
  chatId: string,
  messageId: string,
  uid: string,
  emoji: string
) {
  const msgRef = doc(db, "chats", chatId, "messages", messageId);
  const snap = await getDoc(msgRef);
  const current = (snap.data() as any)?.reactions?.[uid];
  await updateDoc(msgRef, {
    [`reactions.${uid}`]: current === emoji ? deleteField() : emoji,
  });
}

/** Deletes a message for everyone — keeps the doc but blanks its content. */
export async function deleteMessageForEveryone(chatId: string, messageId: string) {
  await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
    deleted: true,
    text: "",
    type: "text",
    mediaURL: deleteField(),
    reactions: deleteField(),
    replyTo: deleteField(),
  });
}

/** Deletes a message for a specific user (hides it from their view only). */
export async function deleteMessageForMe(chatId: string, messageId: string, uid: string) {
  await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
    deletedFor: arrayUnion(uid)
  });
}

export async function deleteChatHistory(chatId: string) {
  const msgsSnap = await getDocs(collection(db, "chats", chatId, "messages"));
  const batch = writeBatch(db);
  msgsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.update(doc(db, "chats", chatId), {
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function leaveGroupChat(chatId: string, uid: string) {
  const chatRef = doc(db, "chats", chatId);
  await updateDoc(chatRef, {
    participants: arrayRemove(uid),
  });
}

export async function deleteGroupChat(chatId: string) {
  const msgsSnap = await getDocs(collection(db, "chats", chatId, "messages"));
  const batch = writeBatch(db);
  msgsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "chats", chatId));
  await batch.commit();
}

export async function blockUser(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    blockedUsers: arrayUnion(otherUid),
    friends: arrayRemove(otherUid),
  });
  await updateDoc(doc(db, "users", otherUid), {
    friends: arrayRemove(myUid),
  });
}

export async function unblockUser(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    blockedUsers: arrayRemove(otherUid),
  });
}

export async function unfriendUser(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    friends: arrayRemove(otherUid),
  });
  await updateDoc(doc(db, "users", otherUid), {
    friends: arrayRemove(myUid),
  });
}

export async function sendFriendRequest(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    outgoingRequests: arrayUnion(otherUid),
  });
  await updateDoc(doc(db, "users", otherUid), {
    incomingRequests: arrayUnion(myUid),
  });
}

export async function cancelFriendRequest(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    outgoingRequests: arrayRemove(otherUid),
  });
  await updateDoc(doc(db, "users", otherUid), {
    incomingRequests: arrayRemove(myUid),
  });
}

export async function acceptFriendRequest(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    incomingRequests: arrayRemove(otherUid),
    friends: arrayUnion(otherUid),
  });
  await updateDoc(doc(db, "users", otherUid), {
    outgoingRequests: arrayRemove(myUid),
    friends: arrayUnion(myUid),
  });

  const chatId = await ensureChat(myUid, otherUid);
  await updateDoc(doc(db, "chats", chatId), {
    lastMessage: "You are now friends.",
    lastMessageAt: serverTimestamp(),
  });
}

export async function rejectFriendRequest(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    incomingRequests: arrayRemove(otherUid),
  });
  await updateDoc(doc(db, "users", otherUid), {
    outgoingRequests: arrayRemove(myUid),
  });
}

export function subscribeDirectory(
  myUid: string,
  cb: (users: DirectoryUser[]) => void
) {
  return onSnapshot(collection(db, "users"), (snap) => {
    cb(
      snap.docs
        .map((d) => d.data() as any)
        .filter((u) => u.uid !== myUid)
        .map((u) => ({
          uid: u.uid,
          name: u.name,
          email: u.email,
          photoURL: u.photoURL,
          status: u.status,
          online: u.online,
          lastSeen: u.lastSeen ?? null,
          friends: u.friends || [],
          incomingRequests: u.incomingRequests || [],
          outgoingRequests: u.outgoingRequests || [],
          accountMode: u.accountMode || "public",
          blockedUsers: u.blockedUsers || [],
          bio: u.bio || "",
          location: u.location || "",
          website: u.website || "",
          occupation: u.occupation || "",
        }))
    );
  });
}

export async function getMyBlockedUsers(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "users", uid));
  return (snap.data() as any)?.blockedUsers || [];
}

/** Human-friendly "last seen" string from a Firestore timestamp. */
export function formatLastSeen(lastSeen?: Timestamp | null): string {
  const ms = lastSeen?.toMillis?.();
  if (!ms) return "Last seen recently";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  const date = new Date(ms);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) return `Last seen today at ${time}`;
  if (isYesterday) return `Last seen yesterday at ${time}`;
  return `Last seen ${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}
