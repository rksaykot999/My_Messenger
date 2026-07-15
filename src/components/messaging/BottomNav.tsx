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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/82 px-4 pb-safe pt-2 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around rounded-t-[28px]">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "relative flex h-full flex-1 flex-col items-center justify-center gap-1 outline-none transition-all duration-200",
              activeTab === id ? "text-primary" : "text-muted-foreground hover:text-primary/70"
            )}
          >
            <div className={cn(
              "relative flex h-9 w-14 items-center justify-center rounded-full transition-all duration-200",
              activeTab === id ? "bg-primary/12 shadow-inner" : "bg-transparent"
            )}>
              <Icon
                className={cn(
                  "h-5 w-5 transition-all duration-200",
                  activeTab === id ? "scale-110 stroke-[2.5px]" : "stroke-[2px]"
                )}
              />
              {id === 'chats' && unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent px-1 text-[9px] font-bold text-white shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className={cn(
              "text-[10px] font-semibold tracking-tight transition-colors duration-200",
              activeTab === id ? "text-primary" : "text-muted-foreground"
            )}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
