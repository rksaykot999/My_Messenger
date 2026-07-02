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
import { db } from "@/lib/firebase";

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: Timestamp | null;
  status: "sent" | "delivered" | "read";
}

export interface ChatSummary {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastSenderId?: string;
  unread?: Record<string, number>;
}

export interface DirectoryUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  status?: string;
  online?: boolean;
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
    where("participants", "array-contains", uid),
    orderBy("lastMessageAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ChatSummary))
    );
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

export async function sendMessage(chatId: string, senderId: string, text: string) {
  const chatRef = doc(db, "chats", chatId);
  await addDoc(collection(chatRef, "messages"), {
    text,
    senderId,
    createdAt: serverTimestamp(),
    status: "sent",
  });
  const snap = await getDoc(chatRef);
  const data = snap.data() as any;
  const otherUid = (data?.participants || []).find((p: string) => p !== senderId);
  await updateDoc(chatRef, {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    ...(otherUid ? { [`unread.${otherUid}`]: (data?.unread?.[otherUid] || 0) + 1 } : {}),
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
        }))
    );
  });
}

export async function getMyBlockedUsers(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, "users", uid));
  return (snap.data() as any)?.blockedUsers || [];
}
