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
    { id: 'chats', label: 'Chats', icon: MessageSquare, badge: unreadCount },
    { id: 'discover', label: 'Discover', icon: Globe },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border px-4 pb-safe pt-2 h-16 z-50">
      <div className="max-w-md mx-auto flex justify-around items-center h-full">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "relative flex flex-col items-center justify-center space-y-1 transition-all duration-200 flex-1 h-full outline-none",
              activeTab === id ? "text-accent" : "text-muted-foreground hover:text-accent/70"
            )}
          >
            <div className="relative">
              <Icon 
                className={cn(
                  "h-5 w-5 transition-all duration-200", 
                  activeTab === id ? "scale-110 stroke-[2.5px]" : "stroke-[2px]"
                )} 
              />
              {badge && badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center border-2 border-background shadow-sm">
                  {badge > 99 ? '99+' : badge}
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
