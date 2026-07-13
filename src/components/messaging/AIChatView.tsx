"use client"

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Send, Sparkles, User, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { aiChatAssistant } from "@/ai/flows/ai-chat-assistant";

interface Message {
  role: 'user' | 'model';
  content: string;
}

export function AIChatView({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hello! I'm your My Messenger AI assistant. How can I help you today? I can help you draft messages, summarize things, or answer questions." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await aiChatAssistant({
        userPrompt: input,
        chatHistory: messages
      });
      setMessages(prev => [...prev, { role: 'model', content: result.response }]);
    } catch (error) {
      console.error("AI assistant error", error);
      setMessages(prev => [...prev, { role: 'model', content: "Sorry, I couldn't reach the AI assistant. Make sure GOOGLE_GENAI_API_KEY is set in your environment, then try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-grid-lines relative z-50 flex h-full flex-col bg-background">
      <header className="sticky top-0 flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-white backdrop-blur-xl">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full text-white hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-headline">Messenger AI</h3>
            <p className="text-[10px] opacity-70">Powered by GenAI</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 pb-20">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "flex max-w-[80%] gap-2",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                msg.role === 'user' ? "bg-primary" : "bg-gradient-to-br from-accent to-primary"
              )}>
                {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={cn(
                "rounded-[22px] px-4 py-2 text-sm leading-relaxed shadow-sm",
                msg.role === 'user'
                  ? "rounded-tr-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                  : "app-surface rounded-tl-md text-foreground"
              )}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex max-w-[80%] gap-2">
               <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-white">
                 <Bot className="h-4 w-4" />
               </div>
               <div className="app-surface flex items-center gap-2 rounded-[22px] rounded-tl-md px-4 py-2 text-sm text-muted-foreground">
                 <Loader2 className="h-3 w-3 animate-spin" />
                 Thinking...
               </div>
             </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border/60 bg-background/85 p-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md gap-2">
          <Input 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask AI anything..."
            className="rounded-full border border-border/50 bg-muted/40"
          />
          <Button onClick={handleSend} size="icon" className="rounded-full bg-gradient-to-br from-accent to-primary shadow-lg shadow-accent/25 hover:opacity-90">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}