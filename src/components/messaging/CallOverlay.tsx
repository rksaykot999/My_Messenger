"use client"

import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, Video, VideoOff, PhoneOff, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { registerPlugin } from "@capacitor/core";

const AudioRouter = registerPlugin<any>("AudioRouter");

interface CallOverlayProps {
  name: string;
  avatar: string;
  type: 'voice' | 'video';
  incoming?: boolean;
  status?: 'ringing' | 'connecting' | 'connected';
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  onEnd: () => void;
  onAccept?: () => void;
  onToggleMute?: (muted: boolean) => void;
  onToggleVideo?: (videoOn: boolean) => void;
}

export function CallOverlay({
  name,
  avatar,
  type,
  incoming,
  status = 'connected',
  localStream,
  remoteStream,
  onEnd,
  onAccept,
  onToggleMute,
  onToggleVideo,
}: CallOverlayProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(type === 'video');
  const [isVideoOn, setIsVideoOn] = useState(type === 'video');
  const [timer, setTimer] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const isConnected = status === 'connected' && !incoming;

  useEffect(() => {
    if (isConnected) {
      const interval = setInterval(() => setTimer((t) => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoOn]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        AudioRouter.setSpeaker({ speakerOn: isSpeaker });
      } catch (e) {
        // Fallback for Web/PWA: Lower the volume to simulate an earpiece
        if (remoteAudioRef.current) {
          remoteAudioRef.current.volume = isSpeaker ? 1.0 : 0.15;
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.volume = isSpeaker ? 1.0 : 0.15;
        }
      }
    }
  }, [isSpeaker, remoteStream]);

  const hasRemoteVideo = type === 'video' && !!(remoteStream && remoteStream.getVideoTracks().length > 0);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, hasRemoteVideo]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    onToggleMute?.(next);
  };

  const toggleVideo = () => {
    const next = !isVideoOn;
    setIsVideoOn(next);
    onToggleVideo?.(next);
  };

  const hasVideoTrack = hasRemoteVideo; // alias for the state we added

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900 text-white animate-in fade-in duration-500">
      {/* Remote audio (always rendered so voice calls play sound even without a <video> element) */}
      <audio ref={remoteAudioRef} autoPlay className={cn(type === 'video' && "hidden")} />

      {/* Background */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-slate-900">
        {hasRemoteVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <>
            <Image
              src={avatar}
              alt="background"
              fill
              className="object-cover blur-2xl opacity-30 scale-125"
              priority
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,hsl(var(--accent)/0.35),transparent_55%),radial-gradient(circle_at_50%_100%,hsl(var(--primary)/0.45),transparent_60%)]" />
            <div className="absolute inset-0 bg-slate-950/40" />
          </>
        )}
      </div>

      {/* Local video PiP */}
      {type === 'video' && isVideoOn && localStream && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-16 right-4 z-20 w-24 h-36 object-cover rounded-2xl border-2 border-white/20 shadow-lg"
        />
      )}

      <div className="relative z-10 flex flex-col h-full items-center justify-between py-20 px-6">
        <div className="text-center">
          {!hasRemoteVideo && (
            <div className="relative inline-block mb-6">
              <div className={cn(
                "absolute inset-0 rounded-full border-2 border-accent opacity-0",
                incoming && "animate-ping opacity-20"
              )} />
              <Avatar className={cn(
                "h-32 w-32 border-4 border-white/10 shadow-2xl pulsing-avatar",
                isConnected && "animate-none"
              )}>
                <AvatarImage src={avatar} />
                <AvatarFallback className="bg-primary text-2xl">{name.substring(0, 2)}</AvatarFallback>
              </Avatar>
            </div>
          )}
          <h2 className="text-2xl font-bold font-headline mb-2 drop-shadow-lg">{name}</h2>
          <p className="text-slate-300 font-medium drop-shadow-lg">
            {incoming
              ? 'Incoming Call'
              : status === 'connecting'
              ? 'Connecting…'
              : type === 'voice'
              ? 'Voice Call'
              : 'Video Call'}
          </p>
          {isConnected && (
            <p className="text-slate-200 font-mono mt-4 text-lg tabular-nums drop-shadow-lg">
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
          <div className="mb-10 grid w-full max-w-sm grid-cols-4 gap-3 rounded-[32px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleMute}
              className={cn("h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 border-none text-white transition-colors", isMuted && "!bg-white !text-slate-900 hover:!bg-white/90")}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsSpeaker(!isSpeaker)}
              className={cn("h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 border-none text-white transition-colors", isSpeaker && "!bg-white !text-slate-900 hover:!bg-white/90")}
            >
              <Volume2 className="h-6 w-6" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleVideo}
              disabled={type !== 'video'}
              className={cn("h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 border-none text-white transition-colors", isVideoOn && type === 'video' && "!bg-white !text-slate-900 hover:!bg-white/90")}
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
