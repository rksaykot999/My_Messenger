"use client"

import { useState, useEffect } from "react";
import { Mic, MicOff, Volume2, Video, VideoOff, PhoneOff, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface CallOverlayProps {
  name: string;
  avatar: string;
  type: 'voice' | 'video';
  incoming?: boolean;
  onEnd: () => void;
  onAccept?: () => void;
}

export function CallOverlay({ name, avatar, type, incoming, onEnd, onAccept }: CallOverlayProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(type === 'video');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (!incoming) {
      const interval = setInterval(() => setTimer(t => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [incoming]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900 text-white animate-in fade-in duration-500">
      {/* Background for video/voice calls */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <Image 
          src={avatar} 
          alt="background" 
          fill
          className="object-cover blur-2xl opacity-30 scale-125" 
          priority
        />
      </div>

      <div className="relative z-10 flex flex-col h-full items-center justify-between py-20 px-6">
        <div className="text-center">
          <div className="relative inline-block mb-6">
            <div className={cn(
              "absolute inset-0 rounded-full border-2 border-accent opacity-0",
              incoming && "animate-ping opacity-20"
            )} />
            <Avatar className={cn(
              "h-32 w-32 border-4 border-white/10 shadow-2xl pulsing-avatar",
              !incoming && "animate-none"
            )}>
              <AvatarImage src={avatar} />
              <AvatarFallback className="bg-primary text-2xl">{name.substring(0, 2)}</AvatarFallback>
            </Avatar>
          </div>
          <h2 className="text-2xl font-bold font-headline mb-2">{name}</h2>
          <p className="text-slate-400 font-medium">
            {incoming ? 'Incoming Call' : type === 'voice' ? 'Voice Call' : 'Video Call'}
          </p>
          {!incoming && (
            <p className="text-slate-300 font-mono mt-4 text-lg tabular-nums">
              {formatTime(timer)}
            </p>
          )}
        </div>

        {incoming ? (
          <div className="flex gap-12 mb-10">
            <div className="flex flex-col items-center gap-2">
              <Button 
                onClick={onEnd} 
                className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 border-none"
              >
                <PhoneOff className="h-8 w-8 text-white" />
              </Button>
              <span className="text-xs font-medium">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button 
                onClick={onAccept} 
                className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 border-none"
              >
                <Phone className="h-8 w-8 text-white" />
              </Button>
              <span className="text-xs font-medium">Accept</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 w-full max-w-sm mb-10">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              className={cn("h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 border-none text-white", isMuted && "bg-white text-slate-900")}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsSpeaker(!isSpeaker)}
              className={cn("h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 border-none text-white", isSpeaker && "bg-white text-slate-900")}
            >
              <Volume2 className="h-6 w-6" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsVideoOn(!isVideoOn)}
              className={cn("h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 border-none text-white", isVideoOn && "bg-white text-slate-900")}
            >
              {isVideoOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={onEnd}
              className="h-14 w-14 rounded-full shadow-lg shadow-red-500/20 border-none"
            >
              <PhoneOff className="h-6 w-6 text-white" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
