"use client"

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Phone, Video, Plus, Send, Image as ImageIcon, Camera, Film, Info, Trash2, ShieldOff, ShieldCheck, UserRound, Loader2, Mail, Smile, Reply, X, Search, ChevronUp, ChevronDown, MessageSquare, ChevronRight, UserMinus, Download, LogOut, Mic } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusIcon } from "./StatusIcon";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
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
  unfriendUser,
  uploadChatMedia,
  setTypingStatus,
  subscribeChatDoc,
  toggleReaction,
  deleteMessageForEveryone,
  setQuickEmoji,
  formatLastSeen,
  type ChatMessage,
} from "@/lib/chat";
import { clearNotificationsForChat } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";
import type { Timestamp } from "firebase/firestore";

interface ChatViewProps {
  chat: {
    id: string; // The person uid or the chat doc id
    name: string;
    avatar: string;
    online?: boolean;
    status?: string;
    email?: string;
    lastSeen?: any;
    isGroup?: boolean;
    participants?: { uid: string; name: string; avatar: string }[];
    adminId?: string;
    quickEmoji?: string;
  };
  isBlocked?: boolean;
  amIBlocked?: boolean;
  isFriend?: boolean;
  onBack?: () => void;
  onCall?: (type: 'voice' | 'video') => void;
  onLeaveGroup?: () => void;
  onDeleteGroup?: () => void;
  embedded?: boolean;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const PICKER_EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","😎","🤩","🥳","😉","🙂","🤔","😴","😭","😡","👍","👎","🙏","👏","🔥","🎉","❤️","💯","✅","😮","😅","🥰","😇","🤗","😜","🤤"];

// A typing timestamp older than this is considered stale (the other user
// probably closed the tab without clearing it).
const TYPING_TTL_MS = 6000;

export function ChatView({ chat, onBack, onCall, onLeaveGroup, onDeleteGroup, isBlocked, amIBlocked, isFriend, embedded = false }: ChatViewProps) {
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
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  
  // Combine blocked states for inputs
  const inputDisabled = isBlocked || amIBlocked;
  const [blocked, setBlocked] = useState(!!isBlocked);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [viewMedia, setViewMedia] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const [needsRead, setNeedsRead] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const gifInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeState = useRef<{ id: string | null; startX: number; startY: number; isSwiping: boolean }>({ id: null, startX: 0, startY: 0, isSwiping: false });

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
    
    const handleRead = (force = false) => {
      if (document.visibilityState === "visible") {
        markMessagesDelivered(chatId, user.uid);
        
        if (document.hasFocus() || force) {
          if (settings.readReceipts) {
            markMessagesRead(chatId, user.uid);
          }
          markChatRead(chatId, user.uid);
          setNeedsRead(false);
        } else {
          setNeedsRead(true);
        }
      }
    };

    handleRead();

    const handleFocus = () => handleRead(true);
    const handleVisibility = () => handleRead(false);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [chatId, user, messages.length, settings.readReceipts]);

  // Handle interaction if needsRead is true
  useEffect(() => {
    if (!needsRead || !chatId || !user) return;
    
    const handleInteraction = () => {
      if (document.visibilityState === "visible") {
        if (settings.readReceipts) {
          markMessagesRead(chatId, user.uid);
        }
        markChatRead(chatId, user.uid);
        setNeedsRead(false);
      }
    };

    // Attach one-time listeners
    window.addEventListener("mousemove", handleInteraction, { once: true });
    window.addEventListener("keydown", handleInteraction, { once: true });
    window.addEventListener("touchstart", handleInteraction, { once: true });
    window.addEventListener("scroll", handleInteraction, { once: true });
    window.addEventListener("click", handleInteraction, { once: true });

    return () => {
      window.removeEventListener("mousemove", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
      window.removeEventListener("scroll", handleInteraction);
      window.removeEventListener("click", handleInteraction);
    };
  }, [needsRead, chatId, user, settings.readReceipts]);

  useEffect(() => {
    const scrollToBottom = () => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      } else if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };
    
    scrollToBottom();
    const timeoutId = setTimeout(scrollToBottom, 150);
    return () => clearTimeout(timeoutId);
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setRecordingDuration(0);
        recordingTimerRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      };

      mediaRecorder.start();
    } catch (err) {
      console.error(err);
      toast({ title: "Microphone Access Denied", description: "Please allow microphone permissions to record voice messages." });
    }
  };

  const stopRecording = (cancel = false) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        if (!cancel && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const file = new File([audioBlob], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
          handleAttachmentSelected(file, "audio");
        }
      };
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAttachmentSelected = async (
    file: File | undefined,
    type: "image" | "video" | "audio"
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
      await sendMessage(id, user.uid, type === "image" ? "📷 Photo" : type === "video" ? "🎥 Video" : "🎤 Voice", { type, mediaURL });
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

  const handleChangeQuickEmoji = async (emoji: string) => {
    if (!user || blocked) return;
    let id = chatId;
    if (!id) {
      try {
        id = await ensureChat(user.uid, chat.id);
        setChatId(id);
      } catch (err) {
        console.error("Failed to initialize chat for quick emoji", err);
        return;
      }
    }
    try {
      await setQuickEmoji(id, emoji);
    } catch (err) {
      console.error("Failed to change quick emoji", err);
    }
  };

  const handleSendQuickEmoji = async () => {
    if (!user || blocked) return;
    let id = chatId;
    if (!id) {
      try {
        id = await ensureChat(user.uid, chat.id);
        setChatId(id);
      } catch (err) {
        return;
      }
    }
    try {
      await sendMessage(id, user.uid, chat.quickEmoji || "👍");
    } catch (err) {
      console.error("Failed to send quick emoji", err);
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

  const handleUnfriend = async () => {
    if (!user) return;
    await unfriendUser(user.uid, chat.id);
    toast({ title: `Unfriended ${chat.name}`, description: "You are no longer friends." });
    setConfirmUnfriend(false);
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
    <div className={cn("relative flex h-full min-h-0 flex-col bg-transparent", embedded && "w-full flex-1")}>
      <header className={cn("app-toolbar sticky top-0 z-10 flex items-center justify-between px-4 py-3", embedded && "lg:rounded-t-[34px]")}>
        <div className="flex items-center gap-3 min-w-0">
          {!embedded && (
            <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2 shrink-0 rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <button onClick={() => setContactInfoOpen(true)} className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl p-1 -ml-1">
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10 ring-2 ring-background/80 shadow-md">
                <AvatarImage src={chat.avatar} />
                <AvatarFallback>{chat.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              {chat.online && <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-none truncate">{chat.name}</h3>
              <p className={cn("mt-1.5 text-[11px] truncate", otherTyping ? "font-medium text-accent" : "text-muted-foreground")}>
                {blocked ? 'Blocked' : otherTyping ? 'typing…' : chat.online ? 'Online' : formatLastSeen(chat.lastSeen)}
              </p>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setSearchOpen((v) => !v)} className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary">
            <Search className="h-4 w-4" />
          </Button>
          {!chat.isGroup && (
            <>
              <Button variant="ghost" size="icon" onClick={() => onCall?.('voice')} className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onCall?.('video')} className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary">
                <Video className="h-4 w-4" />
              </Button>
            </>
          )}
          <Popover open={infoOpen} onOpenChange={setInfoOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary">
                <Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" sideOffset={12} className="w-[320px] rounded-[32px] border border-border/70 bg-background/95 backdrop-blur-2xl p-5 shadow-2xl relative">
              <button onClick={() => setInfoOpen(false)} className="absolute right-4 top-4 rounded-full p-1 opacity-70 hover:opacity-100 hover:bg-muted transition-all">
                <X className="h-4 w-4" />
              </button>
              <div className="mb-4 text-left px-1">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Conversation Options</h3>
              </div>
              <div className="flex flex-col items-center text-center py-2 mb-4">
                <Avatar className="h-20 w-20 mb-3 ring-4 ring-background shadow-xl">
                  <AvatarImage src={chat.avatar} />
                  <AvatarFallback className="text-xl">{chat.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <h4 className="text-lg font-bold font-headline">{chat.name}</h4>
              </div>
              <div className="space-y-1.5">
                <button
                  onClick={() => { setInfoOpen(false); setContactInfoOpen(true); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border/50 hover:bg-muted/50 text-left transition-colors"
                >
                  <div className="bg-muted p-2 rounded-xl"><UserRound className="h-4 w-4" /></div>
                  <span className="text-sm font-semibold">{chat.isGroup ? 'View Group Info' : 'View Contact Info'}</span>
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border/50 hover:bg-muted/50 text-left transition-colors">
                      <div className="bg-muted p-2 rounded-xl flex items-center justify-center h-8 w-8 text-lg leading-none">{chat.quickEmoji || "👍"}</div>
                      <span className="text-sm font-semibold">Change Quick Emoji</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="left" align="start" className="w-72 rounded-2xl border-none p-3 shadow-2xl app-surface">
                     <div className="mb-2 text-xs font-semibold text-muted-foreground px-1">Quick Message</div>
                     <div className="grid grid-cols-8 gap-1">
                        {PICKER_EMOJIS.map((e) => (
                          <PopoverClose key={e} asChild>
                            <button
                              type="button"
                              onClick={() => { setInfoOpen(false); handleChangeQuickEmoji(e); }}
                              className="rounded-lg p-1 text-xl transition-transform hover:scale-125 hover:bg-muted"
                            >
                              {e}
                            </button>
                          </PopoverClose>
                        ))}
                     </div>
                  </PopoverContent>
                </Popover>
                {!chat.isGroup ? (
                  <button
                    onClick={() => { setInfoOpen(false); setConfirmDelete(true); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-destructive/10 text-left transition-colors group"
                  >
                    <div className="bg-destructive/10 group-hover:bg-destructive/20 p-2 rounded-xl transition-colors"><Trash2 className="h-4 w-4 text-destructive" /></div>
                    <span className="text-sm font-semibold text-destructive">Delete Chat History</span>
                  </button>
                ) : chat.adminId === user?.uid ? (
                  <button
                    onClick={() => { setInfoOpen(false); setConfirmDeleteGroup(true); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-destructive/10 text-left transition-colors group"
                  >
                    <div className="bg-destructive/10 group-hover:bg-destructive/20 p-2 rounded-xl transition-colors"><Trash2 className="h-4 w-4 text-destructive" /></div>
                    <span className="text-sm font-semibold text-destructive">Delete Group</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setInfoOpen(false); setConfirmLeave(true); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-destructive/10 text-left transition-colors group"
                  >
                    <div className="bg-destructive/10 group-hover:bg-destructive/20 p-2 rounded-xl transition-colors"><LogOut className="h-4 w-4 text-destructive" /></div>
                    <span className="text-sm font-semibold text-destructive">Leave Group</span>
                  </button>
                )}
                {!chat.isGroup && (
                  <>
                    {isFriend && (
                      <button
                        onClick={() => { setInfoOpen(false); setConfirmUnfriend(true); }}
                        className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-destructive/10 text-left transition-colors group"
                      >
                        <div className="bg-destructive/10 group-hover:bg-destructive/20 p-2 rounded-xl transition-colors">
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </div>
                        <span className="text-sm font-semibold text-destructive">Unfriend</span>
                      </button>
                    )}
                    <button
                      onClick={() => { setInfoOpen(false); setConfirmBlock(true); }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-destructive/10 text-left transition-colors group"
                    >
                      <div className="bg-destructive/10 group-hover:bg-destructive/20 p-2 rounded-xl transition-colors">
                        {isBlocked ? <ShieldCheck className="h-4 w-4 text-destructive" /> : <ShieldOff className="h-4 w-4 text-destructive" />}
                      </div>
                      <span className="text-sm font-semibold text-destructive">{isBlocked ? 'Unblock User' : 'Block User'}</span>
                    </button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {(isUploading) && (
            <div className="flex items-center gap-1 pl-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {uploadProgress}%
            </div>
          )}
        </div>
      </header>

      {/* In-conversation search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/68 px-4 py-2 backdrop-blur-xl">
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
        className="flex flex-1 flex-col space-y-1 overflow-y-auto bg-transparent px-2 pt-4 pb-2"
      >
        {messages.length === 0 && (
          <div className="m-auto flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary/10 text-2xl text-primary">
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
              "group flex max-w-[85%] flex-col animate-in transition-shadow duration-300 fade-in slide-in-from-bottom-2",
              mine ? "ml-auto items-end" : "items-start",
              isSearchHit && !isCurrentHit && "ring-1 ring-accent/40"
            )}
            onTouchStart={(e) => {
              if (msg.deleted || blocked) return;
              swipeState.current = { id: msg.id, startX: e.touches[0].clientX, startY: e.touches[0].clientY, isSwiping: false };
            }}
            onTouchMove={(e) => {
              if (swipeState.current.id !== msg.id) return;
              const deltaX = e.touches[0].clientX - swipeState.current.startX;
              const deltaY = e.touches[0].clientY - swipeState.current.startY;
              
              if (!swipeState.current.isSwiping) {
                if (Math.abs(deltaY) > Math.abs(deltaX)) {
                  swipeState.current.id = null;
                  return;
                }
                if (Math.abs(deltaX) > 5) {
                  swipeState.current.isSwiping = true;
                }
              }
              
              if (swipeState.current.isSwiping) {
                let moveX = deltaX;
                if (mine && moveX > 0) moveX = 0;
                if (!mine && moveX < 0) moveX = 0;
                if (Math.abs(moveX) > 60) moveX = moveX > 0 ? 60 : -60;
                
                const el = messageRefs.current[msg.id];
                if (el) {
                  el.style.transition = 'none';
                  el.style.transform = `translateX(${moveX}px)`;
                }
              }
            }}
            onTouchEnd={(e) => {
              if (swipeState.current.id !== msg.id) return;
              const deltaX = e.changedTouches[0].clientX - swipeState.current.startX;
              
              const el = messageRefs.current[msg.id];
              if (el) {
                el.style.transition = 'transform 0.2s ease-out';
                el.style.transform = 'translateX(0)';
              }
              
              if (swipeState.current.isSwiping && Math.abs(deltaX) > 40) {
                if ((mine && deltaX < -40) || (!mine && deltaX > 40)) {
                  setReplyTo(msg);
                }
              }
              swipeState.current = { id: null, startX: 0, startY: 0, isSwiping: false };
            }}
            onDoubleClick={(e) => {
              if (msg.deleted || blocked) return;
              handleReact(msg, "❤️");
            }}
          >
            <div className={cn("flex items-end gap-2", mine ? "flex-row-reverse" : "flex-row")}>
              {!mine && (
                 <Avatar className="h-7 w-7 shrink-0">
                   <AvatarImage src={chat.isGroup ? chat.participants?.find(p => p.uid === msg.senderId)?.avatar : chat.avatar} />
                   <AvatarFallback>{(chat.isGroup ? chat.participants?.find(p => p.uid === msg.senderId)?.name : chat.name)?.substring(0, 2) || '?'}</AvatarFallback>
                 </Avatar>
              )}
              <div className="flex flex-col">
                {/* Sender Name for Groups */}
                {chat.isGroup && !mine && (
                  <span className="text-[11px] text-muted-foreground ml-3 mb-1">
                    {chat.participants?.find(p => p.uid === msg.senderId)?.name || 'Unknown'}
                  </span>
                )}
                {/* Reply preview */}
                {msg.replyTo && !msg.deleted && (
                  <button
                    onClick={() => scrollToMessage(msg.replyTo!.id)}
                    className={cn(
                      "mb-1 max-w-full truncate rounded-2xl border-l-2 border-primary px-3 py-2 text-left text-xs",
                      mine ? "bg-primary/12 text-foreground" : "bg-muted/70 text-muted-foreground"
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
                    "overflow-hidden text-[15px] leading-relaxed shadow-sm",
                    msg.type === "image" || msg.type === "video" ? "rounded-[20px] p-1.5" : "px-3.5 py-2",
                    msg.deleted
                      ? "rounded-[20px] border border-dashed border-border/60 bg-transparent italic text-muted-foreground"
                      : mine
                      ? "rounded-[20px] rounded-br-[4px] bg-[#0084ff] text-white"
                      : "rounded-[20px] rounded-bl-[4px] bg-[#3E4042] text-[#E4E6EB]"
                  )}
                >
                  {msg.deleted ? (
                    <span className="flex items-center gap-1.5"><ShieldOff className="h-3.5 w-3.5" /> This message was deleted</span>
                  ) : msg.type === "image" && msg.mediaURL ? (
                    <button onClick={() => setViewMedia({ url: msg.mediaURL!, type: "image" })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={msg.mediaURL} 
                        alt="Shared photo" 
                        className="rounded-xl max-h-72 w-auto object-cover" 
                        onLoad={() => {
                          if (bottomRef.current) {
                            bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
                          } else if (scrollRef.current) {
                            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                          }
                        }}
                      />
                    </button>
                  ) : msg.type === "video" && msg.mediaURL ? (
                    <button onClick={() => setViewMedia({ url: msg.mediaURL!, type: "video" })} className="relative flex items-center justify-center">
                      <video src={msg.mediaURL} className="rounded-xl max-h-72 w-auto pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20 hover:bg-black/30 transition-colors">
                        <div className="rounded-full bg-black/50 p-3 text-white backdrop-blur-md">
                          <Film className="h-6 w-6" />
                        </div>
                      </div>
                    </button>
                  ) : msg.type === "audio" && msg.mediaURL ? (
                    <audio src={msg.mediaURL} controls className="max-w-[200px] h-10" />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>

              {/* Hover actions: react + reply + delete */}
              {!msg.deleted && !blocked && (
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-primary">
                        <Smile className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align={mine ? "end" : "start"} className="w-auto rounded-full border-none p-1.5 shadow-2xl app-surface">
                      <div className="flex items-center gap-1">
                        {REACTION_EMOJIS.map((e) => (
                          <PopoverClose key={e} asChild>
                            <button
                              onClick={() => handleReact(msg, e)}
                              className="rounded-full p-1 text-lg transition-transform hover:scale-125"
                            >
                              {e}
                            </button>
                          </PopoverClose>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button onClick={() => setReplyTo(msg)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-primary">
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
              <div className={cn("-mt-1 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start pl-9")}>
                {Object.entries(reactionCounts).map(([e, count]) => {
                  const reactedByMe = user && msg.reactions?.[user.uid] === e;
                  return (
                    <button
                      key={e}
                      onClick={() => handleReact(msg, e)}
                      className={cn(
                        "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-colors",
                        reactedByMe ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/80"
                      )}
                    >
                      <span>{e}</span>
                      {count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className={cn("flex items-center gap-1.5 mt-1 px-1", !mine && "pl-9")}>
              <span className="text-[10px] text-muted-foreground">
                {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending…'}
              </span>
              {mine && !msg.deleted && <StatusIcon status={msg.status} />}
            </div>
          </div>
          );
        })}
        
        {/* Typing indicator bubble */}
        {otherTyping && !blocked && (
          <div className="flex flex-col max-w-[85%] items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex h-10 items-center gap-1 rounded-[22px] rounded-tl-md border border-border/70 bg-card/92 px-4 py-3 text-foreground shadow-sm backdrop-blur-xl">
              <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <div className="flex items-center gap-1.5 mt-1 px-1">
              <span className="text-[10px] text-accent font-medium">typing...</span>
            </div>
          </div>
        )}

        {/* Spacer to ensure the last message is visible above the absolute/fixed input area */}
        <div ref={bottomRef} className={cn("w-full shrink-0 transition-all duration-300", replyTo ? "h-32" : "h-20")} />
      </div>

      {/* Input Area */}
      <div
        className={cn(
          "left-0 right-0 z-20 border-t border-border/60 bg-background/78 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-2xl",
          embedded ? "absolute bottom-0 lg:rounded-b-[34px]" : "fixed bottom-0"
        )}
      >
        {replyTo && (
          <div className={cn("mb-2 flex items-center gap-2", embedded ? "mx-0" : "max-w-md mx-auto")}>
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-primary/20 border-l-2 bg-primary/10 px-3 py-2.5">
              <Reply className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-primary">
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
              <button disabled={inputDisabled || isUploading} className="p-2 shrink-0 text-[#0084ff] hover:bg-white/10 rounded-full transition-colors disabled:opacity-50">
                {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 rounded-2xl border-none p-2 shadow-2xl app-surface">
              <div className="grid grid-cols-1 gap-1">
                <PopoverClose asChild>
                  <Button variant="ghost" className="justify-start gap-3 h-10" onClick={() => imageInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Gallery</span>
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button variant="ghost" className="justify-start gap-3 h-10" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">Camera</span>
                  </Button>
                </PopoverClose>
                <PopoverClose asChild>
                  <Button variant="ghost" className="justify-start gap-3 h-10" onClick={() => videoInputRef.current?.click()}>
                    <Film className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">Video</span>
                  </Button>
                </PopoverClose>
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
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { handleAttachmentSelected(e.target.files?.[0], "audio"); e.target.value = ""; }} />
          <input ref={gifInputRef} type="file" accept="image/gif" className="hidden" onChange={(e) => { handleAttachmentSelected(e.target.files?.[0], "image"); e.target.value = ""; }} />

          <button type="button" disabled={inputDisabled || isUploading || isRecording} onClick={() => startRecording()} className="p-2 shrink-0 text-[#0084ff] hover:bg-white/10 rounded-full transition-colors active:scale-95 disabled:opacity-50">
             <Mic className="h-5 w-5" />
          </button>
          <button type="button" disabled={inputDisabled || isUploading || isRecording} onClick={() => toast({ title: "Coming soon", description: "GIF sending is not yet available." })} className="p-2 shrink-0 text-[#0084ff] hover:bg-white/10 rounded-full transition-colors active:scale-95 disabled:opacity-50">
             <div className="font-semibold text-[11px] leading-none text-current opacity-90 tracking-wide border-2 border-current px-1.5 py-0.5 rounded-[5px]">GIF</div>
          </button>

          {isRecording ? (
            <div className="flex-1 flex items-center justify-between bg-red-500/10 rounded-full px-4 h-10 border border-red-500/30">
              <div className="flex items-center gap-2 text-red-500">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-semibold tracking-wider">{formatDuration(recordingDuration)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => stopRecording(true)} className="text-muted-foreground hover:text-white transition-colors text-xs font-semibold px-2">Cancel</button>
                <button type="button" onClick={() => stopRecording(false)} className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full transition-colors"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
          <div className="relative flex-1 flex items-center bg-[#3A3B3C] rounded-full px-1">
            <Input
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={isBlocked ? "You've blocked this user" : amIBlocked ? "You cannot reply to this conversation" : "Aa"}
              disabled={inputDisabled}
              className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-[#E4E6EB] placeholder:text-[#B0B3B8] h-10 px-3 shadow-none focus-visible:ring-offset-0 disabled:opacity-50"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={inputDisabled}
                  className="p-2 text-[#0084ff] transition-colors hover:bg-white/10 rounded-full disabled:opacity-50"
                >
                  <Smile className="h-6 w-6" />
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
          )}

          {isRecording ? null : inputText.trim() && !inputDisabled ? (
            <button
              onClick={handleSend}
              className="p-2 shrink-0 text-[#0084ff] transition-transform active:scale-95 hover:bg-white/10 rounded-full"
            >
              <Send className="h-6 w-6" />
            </button>
          ) : (
            <button
              onClick={handleSendQuickEmoji}
              disabled={inputDisabled}
              className="p-2 shrink-0 text-[#0084ff] transition-transform active:scale-95 disabled:opacity-50 hover:bg-white/10 rounded-full flex items-center justify-center"
            >
               <span className="text-2xl leading-none mb-0.5">{chat.quickEmoji || "👍"}</span>
            </button>
          )}
        </div>
      </div>



      {/* Contact info sheet */}
      <Sheet open={contactInfoOpen} onOpenChange={setContactInfoOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md border-l border-border/70 bg-background/95 backdrop-blur-2xl p-0 overflow-y-auto [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{chat.isGroup ? 'Group Details' : 'Profile Details'}</SheetTitle>
          </SheetHeader>
          <div className="flex items-center p-4">
            <Button variant="ghost" size="icon" onClick={() => setContactInfoOpen(false)} className="rounded-full mr-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-bold mx-auto pr-10 font-headline">{chat.isGroup ? 'Group Details' : 'Profile Details'}</h2>
          </div>
          <div className="p-6 pt-2">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="relative">
                <Avatar className="h-28 w-28 mb-3 ring-4 ring-background shadow-xl">
                  <AvatarImage src={chat.avatar} />
                  <AvatarFallback className="text-3xl">{chat.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                {chat.online && <div className="absolute bottom-2 right-1 h-5 w-5 rounded-full border-4 border-background bg-emerald-500" />}
              </div>
              <h4 className="text-2xl font-bold font-headline">{chat.name}</h4>
              {!chat.isGroup && (
                <p className="text-sm text-emerald-500 font-medium mt-1">
                  {blocked ? 'Blocked' : chat.online ? 'Active Now' : 'Offline'}
                </p>
              )}
              <button className="mt-3 bg-muted/50 hover:bg-muted text-xl p-2.5 rounded-full transition-colors leading-none">
                👋
              </button>
            </div>
            
            <div className="space-y-6">
              {!chat.isGroup && (
                <div>
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2">Contact Information</h4>
                  <div className="bg-muted/10 border border-border/40 rounded-[24px] p-2 space-y-1">
                    <div className="flex items-center gap-4 p-3 rounded-2xl hover:bg-muted/20 transition-colors">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Email Address</p>
                        <p className="text-sm font-medium truncate">{chat.email || "Hidden"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-3 rounded-2xl hover:bg-muted/20 transition-colors">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Bio / Tagline</p>
                        <p className="text-sm font-medium truncate">{chat.status || "Empty"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-2">Quick Actions</h4>
                <div className="bg-muted/10 border border-border/40 rounded-[24px] p-2 space-y-1">
                  <button onClick={() => setContactInfoOpen(false)} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-3 text-primary">
                      <MessageSquare className="h-5 w-5" />
                      <span className="text-sm font-medium">Send Message</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3 text-primary">
                          <div className="flex items-center justify-center w-5 h-5 text-xl leading-none">{chat.quickEmoji || "👍"}</div>
                          <span className="text-sm font-medium">Change Quick Emoji</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="w-72 rounded-2xl border-none p-3 shadow-2xl app-surface z-[100]">
                       <div className="mb-2 text-xs font-semibold text-muted-foreground px-1">Quick Message</div>
                       <div className="grid grid-cols-8 gap-1">
                          {PICKER_EMOJIS.map((e) => (
                            <PopoverClose key={e} asChild>
                              <button
                                type="button"
                                onClick={() => { setContactInfoOpen(false); handleChangeQuickEmoji(e); }}
                                className="rounded-lg p-1 text-xl transition-transform hover:scale-125 hover:bg-muted"
                              >
                                {e}
                              </button>
                            </PopoverClose>
                          ))}
                       </div>
                    </PopoverContent>
                  </Popover>
                  {!chat.isGroup ? (
                    <button onClick={() => { setContactInfoOpen(false); setConfirmDelete(true); }} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-destructive/10 transition-colors">
                      <div className="flex items-center gap-3 text-destructive">
                        <Trash2 className="h-5 w-5" />
                        <span className="text-sm font-medium text-destructive">Clear Chat History</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ) : chat.adminId === user?.uid ? (
                    <button onClick={() => { setContactInfoOpen(false); setConfirmDeleteGroup(true); }} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-destructive/10 transition-colors">
                      <div className="flex items-center gap-3 text-destructive">
                        <Trash2 className="h-5 w-5" />
                        <span className="text-sm font-medium text-destructive">Delete Group</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ) : (
                    <button onClick={() => { setContactInfoOpen(false); setConfirmLeave(true); }} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-destructive/10 transition-colors">
                      <div className="flex items-center gap-3 text-destructive">
                        <LogOut className="h-5 w-5" />
                        <span className="text-sm font-medium text-destructive">Leave Group</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                  {!chat.isGroup && (
                    <>
                      <button onClick={() => { alert('Unfriend functionality coming soon'); }} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-destructive/10 transition-colors">
                        <div className="flex items-center gap-3 text-destructive">
                          <UserMinus className="h-5 w-5" />
                          <span className="text-sm font-medium text-destructive">Unfriend</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => { setContactInfoOpen(false); setConfirmBlock(true); }} className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-destructive/10 transition-colors">
                        <div className="flex items-center gap-3 text-destructive">
                          <ShieldOff className="h-5 w-5" />
                          <span className="text-sm font-medium text-destructive">{blocked ? 'Unblock User' : 'Block User'}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
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

      {/* Delete Group confirmation */}
      <AlertDialog open={confirmDeleteGroup} onOpenChange={setConfirmDeleteGroup}>
        <AlertDialogContent className="rounded-2xl max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the group and all its messages for everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDeleteGroup(false); onDeleteGroup?.(); }} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Group confirmation */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent className="rounded-2xl max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Group?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer receive messages from this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmLeave(false); onLeaveGroup?.(); }} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Leave
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

      {/* Unfriend confirmation */}
      <AlertDialog open={confirmUnfriend} onOpenChange={setConfirmUnfriend}>
        <AlertDialogContent className="rounded-2xl max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle>Unfriend {chat.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove them from your friends list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnfriend} className="rounded-xl bg-destructive hover:bg-destructive/90">
              Unfriend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Media Viewer */}
      <Dialog open={!!viewMedia} onOpenChange={(open) => !open && setViewMedia(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden bg-black/95 border-none flex flex-col rounded-[32px] [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Media Viewer</DialogTitle>
          </DialogHeader>
          <div className="absolute top-4 right-4 z-50 flex gap-2">
             <Button variant="secondary" size="icon" className="rounded-full bg-white/20 hover:bg-white/40 text-white border-0" onClick={() => {
                const a = document.createElement('a');
                a.href = viewMedia?.url || '';
                a.download = `media-${Date.now()}`;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                a.remove();
             }}>
               <Download className="h-5 w-5" />
             </Button>
             <DialogClose asChild>
               <Button variant="secondary" size="icon" className="rounded-full bg-white/20 hover:bg-white/40 text-white border-0">
                 <X className="h-5 w-5" />
               </Button>
             </DialogClose>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
             {viewMedia?.type === "image" && (
                <img src={viewMedia.url} className="max-w-full max-h-full object-contain rounded-xl" />
             )}
             {viewMedia?.type === "video" && (
                <video src={viewMedia.url} controls autoPlay className="max-w-full max-h-full object-contain rounded-xl" />
             )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
