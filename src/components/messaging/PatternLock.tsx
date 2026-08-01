"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface PatternLockProps {
  onComplete: (pattern: string) => void;
  error?: boolean;
}

export function PatternLock({ onComplete, error }: PatternLockProps) {
  const [pattern, setPattern] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setPattern([]);
    handleMove(e);
  };

  const getDotIndexFromEvent = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!containerRef.current) return -1;
    
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent | MouseEvent).clientX;
      clientY = (e as React.MouseEvent | MouseEvent).clientY;
    }

    const elements = document.elementsFromPoint(clientX, clientY);
    const dotElement = elements.find(el => el.hasAttribute("data-dot-index"));
    
    if (dotElement) {
      return parseInt(dotElement.getAttribute("data-dot-index") || "-1", 10);
    }
    return -1;
  };

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!isDrawing) return;
    
    // Prevent default scrolling when dragging on touch devices
    if ("touches" in e && e.cancelable) {
      e.preventDefault();
    }

    const dotIndex = getDotIndexFromEvent(e);
    if (dotIndex !== -1) {
      setPattern(prev => {
        if (!prev.includes(dotIndex)) {
          return [...prev, dotIndex];
        }
        return prev;
      });
    }
  }, [isDrawing]);

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (pattern.length > 0) {
      onComplete(pattern.join(""));
    }
  }, [isDrawing, pattern, onComplete]);

  useEffect(() => {
    const handleGlobalMouseUp = () => handleEnd();
    const handleGlobalMouseMove = (e: MouseEvent) => handleMove(e);
    const handleGlobalTouchMove = (e: TouchEvent) => handleMove(e);

    if (isDrawing) {
      window.addEventListener("mouseup", handleGlobalMouseUp);
      window.addEventListener("mousemove", handleGlobalMouseMove, { passive: false });
      window.addEventListener("touchmove", handleGlobalTouchMove, { passive: false });
      window.addEventListener("touchend", handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleGlobalMouseUp);
    };
  }, [isDrawing, handleEnd, handleMove]);

  return (
    <div className="relative mx-auto w-64 h-64 select-none touch-none" ref={containerRef}>
      <div 
        className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-6 z-10"
        onMouseDown={handleStart}
        onTouchStart={handleStart}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div 
            key={i} 
            data-dot-index={i}
            className="flex items-center justify-center rounded-full"
          >
            <div 
              className={cn(
                "w-4 h-4 rounded-full transition-all duration-150",
                pattern.includes(i) 
                  ? error 
                    ? "bg-destructive scale-150 shadow-[0_0_15px_rgba(220,38,38,0.5)]" 
                    : "bg-primary scale-150 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  : "bg-muted-foreground/30"
              )} 
            />
          </div>
        ))}
      </div>
    </div>
  );
}
