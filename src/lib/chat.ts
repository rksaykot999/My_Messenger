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
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { supabase } from "@/lib/supabase";

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
  status: "sent" | "delivered" | "read";
  type?: "text" | "image" | "video";
  mediaURL?: string;
}

export interface ChatSummary {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastSenderId?: string;
  unread?: Record<string, number>;
  typing?: Record<string, Timestamp | null>;
}

export interface DirectoryUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  status?: string;
  online?: boolean;
  friends?: string[];
  incomingRequests?: string[];
  outgoingRequests?: string[];
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
  media?: { type: "image" | "video"; mediaURL: string }
) {
  const chatRef = doc(db, "chats", chatId);
  await addDoc(collection(chatRef, "messages"), {
    text,
    senderId,
    createdAt: serverTimestamp(),
    status: "sent",
    ...(media ? { type: media.type, mediaURL: media.mediaURL } : { type: "text" }),
  });
  const snap = await getDoc(chatRef);
  const data = snap.data() as any;
  const otherUid = (data?.participants || []).find((p: string) => p !== senderId);
  const previewText = media ? (media.type === "image" ? "📷 Photo" : "🎥 Video") : text;
  await updateDoc(chatRef, {
    lastMessage: previewText,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`typing.${senderId}`]: null,
    ...(otherUid ? { [`unread.${otherUid}`]: (data?.unread?.[otherUid] || 0) + 1 } : {}),
  });
}

/** Uploads a photo/video attachment for a chat and returns its download URL. */
export async function uploadChatMedia(
  chatId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${chatId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  onProgress?.(10);
  
  const { data, error } = await supabase.storage
    .from('chat-media')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });
    
  if (error) {
    throw error;
  }
  
  onProgress?.(100);
  
  const { data: { publicUrl } } = supabase.storage
    .from('chat-media')
    .getPublicUrl(fileName);
    
  return publicUrl;
}

/** Marks every message from the other participant as "read" (double blue check). */
export async function markMessagesRead(chatId: string, myUid: string) {
  try {
    const msgsSnap = await getDocs(collection(db, "chats", chatId, "messages"));
    const batch = writeBatch(db);
    let any = false;
    msgsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.senderId !== myUid && data.status !== "read") {
        batch.update(d.ref, { status: "read" });
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
    const msgsSnap = await getDocs(collection(db, "chats", chatId, "messages"));
    const batch = writeBatch(db);
    let any = false;
    msgsSnap.docs.forEach((d) => {
      const data = d.data() as any;
      if (data.senderId !== myUid && data.status === "sent") {
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

export async function markChatRead(chatId: string, uid: string) {
  try {
    await updateDoc(doc(db, "chats", chatId), { [`unread.${uid}`]: 0 });
  } catch {}
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

export async function blockUser(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    blockedUsers: arrayUnion(otherUid),
  });
}

export async function unblockUser(myUid: string, otherUid: string) {
  await updateDoc(doc(db, "users", myUid), {
    blockedUsers: arrayRemove(otherUid),
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
          friends: u.friends || [],
          incomingRequests: u.incomingRequests || [],
          outgoingRequests: u.outgoingRequests || [],
        }))
    );
  });
}

export async function getMyBlockedUsers(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "users", uid));
  return (snap.data() as any)?.blockedUsers || [];
}
