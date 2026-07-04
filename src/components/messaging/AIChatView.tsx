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
    <div className="flex flex-col h-full bg-slate-50 relative z-50">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-primary text-white sticky top-0">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold font-headline">Messenger AI</h3>
            <p className="text-[10px] opacity-70">Powered by GenAI</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "flex max-w-[80%] gap-2",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                msg.role === 'user' ? "bg-primary" : "bg-accent"
              )}>
                {msg.role === 'user' ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
              </div>
              <div className={cn(
                "px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-primary text-primary-foreground rounded-tr-none" 
                  : "bg-white text-foreground rounded-tl-none border"
              )}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex max-w-[80%] gap-2">
               <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center animate-pulse">
                 <Bot className="h-4 w-4 text-white" />
               </div>
               <div className="bg-white border px-4 py-2 rounded-2xl rounded-tl-none flex items-center gap-2 text-sm text-muted-foreground">
                 <Loader2 className="h-3 w-3 animate-spin" />
                 Thinking...
               </div>
             </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t">
        <div className="max-w-md mx-auto flex gap-2">
          <Input 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask AI anything..."
            className="rounded-full bg-slate-50"
          />
          <Button onClick={handleSend} size="icon" className="rounded-full bg-accent hover:bg-accent/90">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}