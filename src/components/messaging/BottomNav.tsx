import { MessageSquare, Globe, Phone, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = 'chats' | 'discover' | 'calls' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  unreadCount?: number;
}

export function BottomNav({ activeTab, onTabChange, unreadCount = 0 }: BottomNavProps) {
  const tabs = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'discover', label: 'Discover', icon: Globe },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border/60 bg-background/85 px-4 pb-safe pt-2 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-md items-center justify-around">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "relative flex h-full flex-1 flex-col items-center justify-center gap-1 outline-none transition-all duration-200",
              activeTab === id ? "text-accent" : "text-muted-foreground hover:text-accent/70"
            )}
          >
            <div className={cn(
              "relative flex h-8 w-12 items-center justify-center rounded-full transition-all duration-200",
              activeTab === id && "bg-accent/10"
            )}>
              <Icon
                className={cn(
                  "h-5 w-5 transition-all duration-200",
                  activeTab === id ? "scale-110 stroke-[2.5px]" : "stroke-[2px]"
                )}
              />
              {id === 'chats' && unreadCount > 0 && (
                <span className="absolute -top-1 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary px-1 text-[9px] font-bold text-white shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className={cn(
              "text-[10px] font-semibold tracking-tight transition-colors duration-200",
              activeTab === id ? "text-accent" : "text-muted-foreground"
            )}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
