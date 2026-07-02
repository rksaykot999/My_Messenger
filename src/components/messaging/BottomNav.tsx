import { MessageSquare, Globe, Phone, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = 'chats' | 'discover' | 'calls' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'chats', label: 'Chats', icon: MessageSquare },
    { id: 'discover', label: 'Discover', icon: Globe },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border px-4 pb-safe pt-2 h-16 z-50">
      <div className="max-w-md mx-auto flex justify-around items-center h-full">
        {tabs.map(({ id, label, icon: Icon }) => (
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
