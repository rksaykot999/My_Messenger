"use client"

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Phone, Video, Plus, Send, Image as ImageIcon, Camera, Film, Info, Trash2, ShieldOff, ShieldCheck, UserRound } from "lucide-react";
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
import {
  ensureChat,
  subscribeMessages,
  sendMessage,
  markChatRead,
  deleteChatHistory,
  blockUser,
  unblockUser,
  type ChatMessage,
} from "@/lib/chat";
import { clearNotificationsForChat } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

interface ChatViewProps {
  chat: { id: string; name: string; avatar: string; online: boolean; status?: string };
  onBack: () => void;
  onCall: (type: 'voice' | 'video') => void;
  isBlocked?: boolean;
}

export function ChatView({ chat, onBack, onCall, isBlocked }: ChatViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocked, setBlocked] = useState(!!isBlocked);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Set up (or create) the realtime chat and subscribe to its messages.
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;
    (async () => {
      const id = await ensureChat(user.uid, chat.id);
      setChatId(id);
      await markChatRead(id, user.uid);
      clearNotificationsForChat(id);
      unsub = subscribeMessages(id, setMessages);
    })();
    return () => unsub?.();
  }, [user, chat.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
    try {
      await sendMessage(id, user.uid, text);
    } catch (err: any) {
      console.error("Failed to send message", err.code || err.message || err);
      toast({
        title: "Message not sent",
        description: err.code ? `${err.code}: ${err.message}` : "There was a problem sending your message. Please try again.",
      });
      setInputText(text);
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

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Avatar className="h-9 w-9">
                <AvatarImage src={chat.avatar} />
                <AvatarFallback>{chat.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              {chat.online && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-none font-headline">{chat.name}</h3>
              <p className="text-[10px] text-muted-foreground mt-1">
                {blocked ? 'Blocked' : chat.online ? 'Online' : 'Last seen recently'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onCall('voice')} className="text-primary">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onCall('video')} className="text-primary">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)} className="text-primary">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col scroll-smooth pb-24"
      >
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground mt-10">
            Say hi to {chat.name.split(' ')[0]} 👋
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300",
              msg.senderId === user?.uid ? "ml-auto items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.senderId === user?.uid
                  ? "bg-primary text-primary-foreground rounded-tr-none"
                  : "bg-muted text-foreground rounded-tl-none"
              )}
            >
              {msg.text}
            </div>
            <div className="flex items-center gap-1.5 mt-1 px-1">
              <span className="text-[10px] text-muted-foreground">
                {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending…'}
              </span>
              {msg.senderId === user?.uid && <StatusIcon status={msg.status} />}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background border-t z-20">
        <div className="max-w-md mx-auto flex items-end gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="shrink-0 h-10 w-10 rounded-full" disabled={blocked}>
                <Plus className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-2 rounded-xl border-none shadow-2xl bg-card">
              <div className="grid grid-cols-1 gap-1">
                <Button variant="ghost" className="justify-start gap-3 h-10">
                  <ImageIcon className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Gallery</span>
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-10">
                  <Camera className="h-4 w-4 text-orange-500" />
                  <span className="text-sm">Camera</span>
                </Button>
                <Button variant="ghost" className="justify-start gap-3 h-10">
                  <Film className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Video</span>
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1 relative">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={blocked ? "You've blocked this user" : "Message..."}
              disabled={blocked}
              className="pr-10 py-3 rounded-3xl min-h-[44px] bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={!chatId || !inputText.trim() || blocked}
            className={cn(
              "shrink-0 h-10 w-10 rounded-full p-0 transition-transform active:scale-95",
              chatId && inputText.trim() && !blocked ? "bg-accent hover:bg-accent/90" : "bg-muted text-muted-foreground"
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
              onClick={() => { setInfoOpen(false); }}
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
