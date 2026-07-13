"use client"

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Phone, Video, Plus, Send, Image as ImageIcon, Camera, Film, Info, Trash2, ShieldOff, ShieldCheck, UserRound, Loader2, Mail, Smile, Reply, X, Search, ChevronUp, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusIcon } from "./StatusIcon";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  ensureChat,
  subscribeMessages,
  sendMessage,
  markChatRead,
  markMessagesRead,
  markMessagesDelivered,
  deleteChatHistory,
  blockUser,
  unblockUser,
  uploadChatMedia,
  setTypingStatus,
  subscribeChatDoc,
  toggleReaction,
  deleteMessageForEveryone,
  formatLastSeen,
  type ChatMessage,
} from "@/lib/chat";
import { clearNotificationsForChat } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import type { Timestamp } from "firebase/firestore";

interface ChatViewProps {
  chat: { id: string; name: string; avatar: string; online: boolean; status?: string; email?: string; lastSeen?: Timestamp | null };
  onBack: () => void;
  onCall: (type: 'voice' | 'video') => void;
  isBlocked?: boolean;
  embedded?: boolean;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const PICKER_EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳","😉","🙂","🤔","😴","😭","😡","👍","👎","🙏","👏","🔥","🎉","❤️","💯","✅","😮","😅","🥰","😇","🤗","😜","🤤"];

// A typing timestamp older than this is considered stale (the other user
// probably closed the tab without clearing it).
const TYPING_TTL_MS = 6000;

export function ChatView({ chat, onBack, onCall, isBlocked, embedded = false }: ChatViewProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocked, setBlocked] = useState(!!isBlocked);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set up (or create) the realtime chat and subscribe to its messages.
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const id = await ensureChat(user.uid, chat.id);
        setChatId(id);
        await markChatRead(id, user.uid);
        clearNotificationsForChat(id);
        unsub = subscribeMessages(id, setMessages);
      } catch (err: any) {
        console.error("Failed to open chat", err?.code || err?.message || err);
        toast({
          title: "Couldn't open this conversation",
          description: err?.code ? `${err.code}: ${err.message}` : "Please check your connection and try again.",
        });
      }
    })();
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, chat.id]);

  // Live "typing…" indicator + read receipts — both respect the user's
  // Settings > Privacy toggles (mirrors how WhatsApp/Messenger hide these
  // when disabled: you stop seeing others' status once you turn off yours).
  useEffect(() => {
    if (!chatId || !user) return;
    const unsub = subscribeChatDoc(chatId, (doc) => {
      if (!settings.typingIndicator) {
        setOtherTyping(false);
        return;
      }
      const raw = doc?.typing || {};
      const otherEntry = Object.entries(raw).find(([uid]) => uid !== user.uid)?.[1] as any;
      const ts = otherEntry?.toMillis?.();
      setOtherTyping(!!ts && Date.now() - ts < TYPING_TTL_MS);
    });
    return unsub;
  }, [chatId, user, settings.typingIndicator]);

  useEffect(() => {
    if (!chatId || !user) return;
    // New messages just loaded — mark anything from the other person delivered,
    // and (if I have read receipts on) as read too, since the chat is open.
    markMessagesDelivered(chatId, user.uid);
    if (settings.readReceipts) {
      markMessagesRead(chatId, user.uid);
    }
  }, [chatId, user, messages.length, settings.readReceipts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, otherTyping]);

  // Clear my typing flag when leaving the conversation.
  useEffect(() => {
    return () => {
      if (chatId && user) setTypingStatus(chatId, user.uid, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [chatId, user]);

  const handleInputChange = (value: string) => {
    setInputText(value);
    if (!chatId || !user || !settings.typingIndicator) return;
    setTypingStatus(chatId, user.uid, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(chatId, user.uid, false);
    }, 3000);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !user) return;
    if (blocked) {
      toast({ title: "You've blocked this user", description: "Unblock them to send a message." });
      return;
    }

    let id = chatId;
    if (!id) {
      try {
        id = await ensureChat(user.uid, chat.id);
        setChatId(id);
        await markChatRead(id, user.uid);
        clearNotificationsForChat(id);
        subscribeMessages(id, setMessages);
      } catch (err) {
        console.error("Failed to initialize chat", err);
        toast({ title: "Unable to send message", description: "Could not create the chat. Please try again." });
        return;
      }
    }

    const text = inputText;
    setInputText("");
    const replySnapshot = replyTo
      ? { id: replyTo.id, text: replyTo.deleted ? "Message deleted" : (replyTo.text || (replyTo.type === "image" ? "📷 Photo" : replyTo.type === "video" ? "🎥 Video" : "")), senderId: replyTo.senderId }
      : null;
    setReplyTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingStatus(id, user.uid, false);
    try {
      await sendMessage(id, user.uid, text, undefined, replySnapshot);
    } catch (err: any) {
      console.error("Failed to send message", err.code || err.message || err);
      toast({
        title: "Message not sent",
        description: err.code ? `${err.code}: ${err.message}` : "There was a problem sending your message. Please try again.",
      });
      setInputText(text);
    }
  };

  const handleAttachmentSelected = async (
    file: File | undefined,
    type: "image" | "video"
  ) => {
    if (!file || !user) return;
    if (blocked) {
      toast({ title: "You've blocked this user", description: "Unblock them to send media." });
      return;
    }
    let id = chatId;
    try {
      if (!id) {
        id = await ensureChat(user.uid, chat.id);
        setChatId(id);
      }
      setIsUploading(true);
      setUploadProgress(0);
      const mediaURL = await uploadChatMedia(id, file, setUploadProgress);
      await sendMessage(id, user.uid, type === "image" ? "📷 Photo" : "🎥 Video", { type, mediaURL });
    } catch (err: any) {
      console.error("Failed to send attachment", err);
      toast({
        title: "Couldn't send attachment",
        description: err?.code ? `${err.code}: ${err.message}` : "Please try again.",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteHistory = async () => {
    if (!chatId) return;
    await deleteChatHistory(chatId);
    setConfirmDelete(false);
    setInfoOpen(false);
    toast({ title: "Chat history deleted" });
  };

  const handleToggleBlock = async () => {
    if (!user) return;
    if (blocked) {
      await unblockUser(user.uid, chat.id);
      setBlocked(false);
      toast({ title: `${chat.name} unblocked` });
    } else {
      await blockUser(user.uid, chat.id);
      setBlocked(true);
      toast({ title: `${chat.name} blocked`, description: "They can no longer message you." });
    }
    setConfirmBlock(false);
    setInfoOpen(false);
  };

  const handleReact = async (msg: ChatMessage, emoji: string) => {
    if (!chatId) return;
    try {
      await toggleReaction(chatId, msg.id, user!.uid, emoji);
    } catch (err) {
      console.error("Failed to react", err);
    }
  };

  const handleDeleteMessage = async () => {
    if (!chatId || !confirmDeleteMsg) return;
    try {
      await deleteMessageForEveryone(chatId, confirmDeleteMsg.id);
    } catch (err) {
      console.error("Failed to delete message", err);
      toast({ title: "Couldn't delete message", description: "Please try again." });
    }
    setConfirmDeleteMsg(null);
  };

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent");
      setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1500);
    }
  };

  // Indices of messages matching the in-conversation search.
  const searchMatches = searchQuery.trim()
    ? messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => !m.deleted && m.text?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .map(({ i }) => i)
    : [];

  // Id of the newest message I sent that the other person has read (for "Seen").
  const lastReadMineId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.senderId === user?.uid && m.status === "read") return m.id;
    }
    return null;
  })();

  useEffect(() => {
    if (searchMatches.length > 0) {
      const idx = Math.min(searchIndex, searchMatches.length - 1);
      const msg = messages[searchMatches[idx]];
      if (msg) scrollToMessage(msg.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIndex, searchQuery]);

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col bg-background", embedded && "w-full flex-1")}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {!embedded && (
            <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2 rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-10 w-10 ring-2 ring-background shadow-md">
                <AvatarImage src={chat.avatar} />
                <AvatarFallback>{chat.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              {chat.online && <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-none font-headline">{chat.name}</h3>
              <p className={cn("mt-1.5 text-[11px]", otherTyping ? "font-medium text-accent" : "text-muted-foreground")}>
                {blocked ? 'Blocked' : otherTyping ? 'typing…' : chat.online ? 'Online' : formatLastSeen(chat.lastSeen)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen((v) => !v)} className="rounded-full text-primary hover:bg-primary/10">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onCall('voice')} className="rounded-full text-primary hover:bg-primary/10">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onCall('video')} className="rounded-full text-primary hover:bg-primary/10">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)} className="rounded-full text-primary hover:bg-primary/10">
            <Info className="h-4 w-4" />
          </Button>
          {(isUploading) && (
            <div className="flex items-center gap-1 pl-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {uploadProgress}%
            </div>
          )}
        </div>
      </header>

      {/* In-conversation search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/70 px-4 py-2 backdrop-blur-xl">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchIndex(0); }}
            placeholder="Search in conversation"
            className="h-8 flex-1 border-none bg-transparent px-0 focus-visible:ring-0"
          />
          {searchQuery.trim() && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : "0/0"}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            disabled={searchMatches.length === 0}
            onClick={() => setSearchIndex((i) => (i + 1) % searchMatches.length)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full"
            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className={cn(
          "app-grid-lines flex flex-1 flex-col space-y-6 overflow-y-auto scroll-smooth p-4",
          embedded ? "pb-32" : "pb-24"
        )}
      >
        {messages.length === 0 && (
          <div className="m-auto flex flex-col items-center text-center">
            <div className="app-surface mb-3 flex h-16 w-16 items-center justify-center rounded-[24px] text-2xl">
              👋
            </div>
            <p className="text-sm font-medium text-foreground">Say hi to {chat.name.split(' ')[0]}</p>
            <p className="mt-1 text-xs text-muted-foreground">This is the beginning of your conversation.</p>
          </div>
        )}
        {messages.map((msg) => {
          const mine = msg.senderId === user?.uid;
          const isSearchHit = searchQuery.trim() && !msg.deleted && msg.text?.toLowerCase().includes(searchQuery.trim().toLowerCase());
          const isCurrentHit = searchMatches.length > 0 && messages[searchMatches[Math.min(searchIndex, searchMatches.length - 1)]]?.id === msg.id;
          const reactionList = msg.reactions ? Object.values(msg.reactions) : [];
          const reactionCounts = reactionList.reduce<Record<string, number>>((acc, e) => { acc[e] = (acc[e] || 0) + 1; return acc; }, {});
          const isLastReadByThem = mine && msg.status === "read" && lastReadMineId === msg.id;

          return (
          <div
            key={msg.id}
            ref={(el) => { messageRefs.current[msg.id] = el; }}
            className={cn(
              "group flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-[24px] transition-shadow",
              mine ? "ml-auto items-end" : "items-start",
              isSearchHit && !isCurrentHit && "ring-1 ring-accent/40"
            )}
          >
            <div className={cn("flex items-end gap-1", mine ? "flex-row-reverse" : "flex-row")}>
              <div className="flex flex-col">
                {/* Reply preview */}
                {msg.replyTo && !msg.deleted && (
                  <button
                    onClick={() => scrollToMessage(msg.replyTo!.id)}
                    className={cn(
                      "mb-1 max-w-full truncate rounded-xl border-l-2 border-accent px-3 py-1.5 text-left text-xs",
                      mine ? "bg-primary/10 text-foreground" : "bg-muted/60 text-muted-foreground"
                    )}
                  >
                    <span className="font-semibold text-accent">
                      {msg.replyTo.senderId === user?.uid ? "You" : chat.name.split(" ")[0]}
                    </span>
                    <span className="ml-1.5 opacity-80">{msg.replyTo.text || "Attachment"}</span>
                  </button>
                )}
                <div
                  className={cn(
                    "overflow-hidden text-sm leading-relaxed shadow-sm",
                    msg.type === "image" || msg.type === "video" ? "rounded-[22px] p-1" : "rounded-[22px] px-4 py-2.5",
                    msg.deleted
                      ? "border border-dashed border-border/60 bg-transparent italic text-muted-foreground"
                      : mine
                      ? "rounded-tr-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-primary/20"
                      : "app-surface rounded-tl-md text-foreground"
                  )}
                >
                  {msg.deleted ? (
                    <span className="flex items-center gap-1.5"><ShieldOff className="h-3.5 w-3.5" /> This message was deleted</span>
                  ) : msg.type === "image" && msg.mediaURL ? (
                    <a href={msg.mediaURL} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.mediaURL} alt="Shared photo" className="rounded-xl max-h-72 w-auto object-cover" />
                    </a>
                  ) : msg.type === "video" && msg.mediaURL ? (
                    <video src={msg.mediaURL} controls className="rounded-xl max-h-72 w-auto" />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>

              {/* Hover actions: react + reply + delete */}
              {!msg.deleted && !blocked && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-accent">
                        <Smile className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align={mine ? "end" : "start"} className="w-auto rounded-full border-none p-1.5 shadow-2xl app-surface">
                      <div className="flex items-center gap-1">
                        {REACTION_EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => handleReact(msg, e)}
                            className="rounded-full p-1 text-lg transition-transform hover:scale-125"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button onClick={() => setReplyTo(msg)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-accent">
                    <Reply className="h-4 w-4" />
                  </button>
                  {mine && (
                    <button onClick={() => setConfirmDeleteMsg(msg)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Reactions chips */}
            {Object.keys(reactionCounts).length > 0 && (
              <div className={cn("-mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
                {Object.entries(reactionCounts).map(([e, count]) => {
                  const reactedByMe = user && msg.reactions?.[user.uid] === e;
                  return (
                    <button
                      key={e}
                      onClick={() => handleReact(msg, e)}
                      className={cn(
                        "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-colors",
                        reactedByMe ? "border-accent/40 bg-accent/15" : "border-border/60 bg-background/80"
                      )}
                    >
                      <span>{e}</span>
                      {count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-1 px-1">
              <span className="text-[10px] text-muted-foreground">
                {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending…'}
              </span>
              {mine && !msg.deleted && <StatusIcon status={msg.status} />}
            </div>
            {isLastReadByThem && (
              <span className="px-1 text-[10px] font-medium text-accent">
                Seen{msg.readAt?.toDate ? ` ${msg.readAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ""}
              </span>
            )}
          </div>
          );
        })}
        
        {/* Typing indicator bubble */}
        {otherTyping && !blocked && (
          <div className="flex flex-col max-w-[85%] items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="app-surface flex h-10 items-center gap-1 rounded-[22px] rounded-tl-md px-4 py-3 text-foreground shadow-sm">
              <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <div className="flex items-center gap-1.5 mt-1 px-1">
              <span className="text-[10px] text-accent font-medium">typing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className={cn(
          "left-0 right-0 z-20 border-t border-border/60 bg-background/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl",
          embedded ? "absolute bottom-0" : "fixed bottom-0"
        )}
      >
        {replyTo && (
          <div className={cn("mb-2 flex items-center gap-2", embedded ? "mx-0" : "max-w-md mx-auto")}>
            <div className="flex flex-1 items-center gap-2 rounded-xl border-l-2 border-accent bg-muted/50 px-3 py-2">
              <Reply className="h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-accent">
                  Replying to {replyTo.senderId === user?.uid ? "yourself" : chat.name.split(" ")[0]}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {replyTo.deleted ? "Message deleted" : replyTo.text || (replyTo.type === "image" ? "📷 Photo" : replyTo.type === "video" ? "🎥 Video" : "Attachment")}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <div className={cn("flex items-end gap-2", embedded ? "mx-0" : "max-w-md mx-auto")}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="h-11 w-11 shrink-0 rounded-full app-surface-muted border-0" disabled={blocked || isUploading}>
                {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 rounded-2xl border-none p-2 shadow-2xl app-surface">
              <div className="grid grid-cols-1 gap-1">
                <Button variant="ghost" className="justify-start gap-3 h-10" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Gallery</span>
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-10" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-4 w-4 text-orange-500" />
                  <span className="text-sm">Camera</span>
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-10" onClick={() => videoInputRef.current?.click()}>
                  <Film className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Video</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Hidden inputs backing the attachment menu above. */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { handleAttachmentSelected(e.target.files?.[0], "image"); e.target.value = ""; }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { handleAttachmentSelected(e.target.files?.[0], "image"); e.target.value = ""; }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { handleAttachmentSelected(e.target.files?.[0], "video"); e.target.value = ""; }}
          />

          <div className="flex-1 relative">
            <Input
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={blocked ? "You've blocked this user" : "Message..."}
              disabled={blocked}
              className="min-h-[46px] rounded-3xl border border-border/50 bg-muted/40 py-3 pr-11 focus-visible:ring-1 focus-visible:ring-accent"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={blocked}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-accent disabled:opacity-50"
                >
                  <Smile className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-72 rounded-2xl border-none p-3 shadow-2xl app-surface">
                <div className="grid grid-cols-8 gap-1">
                  {PICKER_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => handleInputChange(inputText + e)}
                      className="rounded-lg p-1 text-xl transition-transform hover:scale-125 hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button
            onClick={handleSend}
            disabled={!inputText.trim() || blocked}
            className={cn(
              "h-11 w-11 shrink-0 rounded-full p-0 shadow-lg transition-transform active:scale-95",
              inputText.trim() && !blocked
                ? "bg-gradient-to-br from-accent to-primary shadow-accent/30 hover:opacity-90"
                : "bg-muted text-muted-foreground shadow-none"
            )}
          >
            <Send className="h-5 w-5 ml-0.5" />
          </Button>
        </div>
      </div>

      {/* Info / options sheet (replaces old "Chat with AI" button) */}
      <Sheet open={infoOpen} onOpenChange={setInfoOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-w-md mx-auto">
          <SheetHeader className="mb-2">
            <SheetTitle className="text-left">Conversation Options</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center text-center py-2 mb-2">
            <Avatar className="h-16 w-16 mb-2">
              <AvatarImage src={chat.avatar} />
              <AvatarFallback>{chat.name[0]}</AvatarFallback>
            </Avatar>
            <h4 className="font-semibold">{chat.name}</h4>
          </div>
          <div className="space-y-1">
            <button
              onClick={() => { setInfoOpen(false); setContactInfoOpen(true); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 text-left"
            >
              <div className="bg-muted p-2 rounded-lg"><UserRound className="h-4 w-4" /></div>
              <span className="text-sm font-medium">View Contact Info</span>
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 text-left"
            >
              <div className="bg-destructive/10 p-2 rounded-lg"><Trash2 className="h-4 w-4 text-destructive" /></div>
              <span className="text-sm font-medium text-destructive">Delete Chat History</span>
            </button>
            <button
              onClick={() => setConfirmBlock(true)}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 text-left"
            >
              <div className="bg-destructive/10 p-2 rounded-lg">
                {blocked ? <ShieldCheck className="h-4 w-4 text-destructive" /> : <ShieldOff className="h-4 w-4 text-destructive" />}
              </div>
              <span className="text-sm font-medium text-destructive">{blocked ? 'Unblock User' : 'Block User'}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Contact info sheet */}
      <Sheet open={contactInfoOpen} onOpenChange={setContactInfoOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-w-md mx-auto">
          <SheetHeader className="mb-2">
            <SheetTitle className="text-left">Contact Info</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col items-center text-center py-4 mb-2">
            <Avatar className="h-24 w-24 mb-3 ring-4 ring-background shadow-xl">
              <AvatarImage src={chat.avatar} />
              <AvatarFallback className="text-xl">{chat.name[0]}</AvatarFallback>
            </Avatar>
            <h4 className="text-lg font-bold font-headline">{chat.name}</h4>
            <p className="text-xs text-muted-foreground mt-1">
              {blocked ? 'Blocked' : chat.online ? 'Online now' : 'Offline'}
            </p>
          </div>
          <div className="space-y-1">
            {chat.email && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                <div className="bg-muted p-2 rounded-lg"><Mail className="h-4 w-4" /></div>
                <div className="text-left min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Email</p>
                  <p className="text-sm font-medium truncate">{chat.email}</p>
                </div>
              </div>
            )}
            {chat.status && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                <div className="bg-muted p-2 rounded-lg"><UserRound className="h-4 w-4" /></div>
                <div className="text-left min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="text-sm font-medium truncate">{chat.status}</p>
                </div>
              </div>
            )}
            <button
              onClick={() => { setContactInfoOpen(false); setConfirmBlock(true); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 text-left mt-2"
            >
              <div className="bg-destructive/10 p-2 rounded-lg">
                {blocked ? <ShieldCheck className="h-4 w-4 text-destructive" /> : <ShieldOff className="h-4 w-4 text-destructive" />}
              </div>
              <span className="text-sm font-medium text-destructive">{blocked ? 'Unblock User' : 'Block User'}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete single message (for everyone) confirmation */}
      <AlertDialog open={!!confirmDeleteMsg} onOpenChange={(o) => !o && setConfirmDeleteMsg(null)}>
        <AlertDialogContent className="rounded-2xl max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be removed for everyone in this conversation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMessage} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Delete for everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete history confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-2xl max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all messages in this conversation for both participants. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHistory} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block confirmation */}
      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent className="rounded-2xl max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>{blocked ? `Unblock ${chat.name}?` : `Block ${chat.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {blocked
                ? "They'll be able to message and call you again."
                : "They won't be able to send you messages or call you."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleBlock} className="rounded-xl bg-destructive hover:bg-destructive/90">
              {blocked ? 'Unblock' : 'Block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
