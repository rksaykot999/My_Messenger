"use client"

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Phone, Video, Plus, Send, Image as ImageIcon, Camera, Film, MoreVertical, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusIcon } from "./StatusIcon";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'other';
  time: string;
  status: 'sent' | 'delivered' | 'read';
}

interface ChatViewProps {
  chat: { id: string; name: string; avatar: string; online: boolean };
  onBack: () => void;
  onCall: (type: 'voice' | 'video') => void;
  onAIChat?: () => void;
}

export function ChatView({ chat, onBack, onCall, onAIChat }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: 'Hey Sarah, are you available for a quick sync?', sender: 'me', time: '10:40 AM', status: 'read' },
    { id: '2', text: 'Sure! I just finished reviewing the proposal.', sender: 'other', time: '10:42 AM', status: 'read' },
    { id: '3', text: 'The proposal looks great!', sender: 'other', time: '10:45 AM', status: 'read' },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'me',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent',
    };
    
    setMessages(prev => [...prev, newMessage]);
    setInputText("");

    // Simulate response & typing
    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const reply: Message = {
          id: (Date.now() + 1).toString(),
          text: "Thanks! Let me know what the client says.",
          sender: 'other',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'read',
        };
        setMessages(prev => [...prev, reply]);
      }, 2500);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
                {chat.online ? 'Online' : 'Last seen 2h ago'}
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
          <Button variant="ghost" size="icon" onClick={onAIChat} className="text-accent">
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col scroll-smooth pb-24"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300",
              msg.sender === 'me' ? "ml-auto items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.sender === 'me' 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-muted text-foreground rounded-tl-none"
              )}
            >
              {msg.text}
            </div>
            <div className="flex items-center gap-1.5 mt-1 px-1">
              <span className="text-[10px] text-muted-foreground">{msg.time}</span>
              {msg.sender === 'me' && <StatusIcon status={msg.status} />}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="bg-muted px-4 py-2 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background border-t z-20">
        <div className="max-w-md mx-auto flex items-end gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="icon" className="shrink-0 h-10 w-10 rounded-full">
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
              placeholder="Message..."
              className="pr-10 py-3 rounded-3xl min-h-[44px] bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>

          <Button 
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={cn(
              "shrink-0 h-10 w-10 rounded-full p-0 transition-transform active:scale-95",
              inputText.trim() ? "bg-accent hover:bg-accent/90" : "bg-muted text-muted-foreground"
            )}
          >
            <Send className="h-5 w-5 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}