import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusIconProps {
  status: 'sent' | 'delivered' | 'read';
  className?: string;
}

export function StatusIcon({ status, className }: StatusIconProps) {
  if (status === 'sent') {
    return <Check className={cn("h-3 w-3 text-muted-foreground", className)} />;
  }
  
  return (
    <CheckCheck 
      className={cn(
        "h-3 w-3", 
        status === 'read' ? "text-accent" : "text-muted-foreground",
        className
      )} 
    />
  );
}