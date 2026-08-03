"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallSession,
  subscribeIncomingCalls,
  subscribeCallDoc,
  declineCall,
  type CallDoc,
  type CallType,
} from "@/lib/webrtc";
import { useAuth } from "@/contexts/AuthContext";
import { ensureChat, sendMessage } from "@/lib/chat";

export interface ActiveCallState {
  callId: string;
  name: string;
  avatar: string;
  type: CallType;
  incoming: boolean;
  status: "ringing" | "connecting" | "connected";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCaller: boolean;
  otherUid: string;
  startTime?: number;
}

export function useCallManager() {
  const { user, profile } = useAuth();
  const [incomingCall, setIncomingCall] = useState<(CallDoc & { id: string }) | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  activeCallRef.current = activeCall;
  const sessionRef = useRef<CallSession | null>(null);

  // Listen for calls addressed to me.
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeIncomingCalls(user.uid, (call) => {
      // Don't surface a new incoming call if we're already in one.
      setIncomingCall((prev) => {
        if (activeCall) return prev;
        return call;
      });
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeCall]);

  // Watch the active call document for status changes (accepted/ended/declined).
  useEffect(() => {
    if (!activeCall || !activeCall.callId) return;
    const unsub = subscribeCallDoc(activeCall.callId, (call) => {
      if (!call) return;
      if (call.status === "accepted") {
        setActiveCall((prev) => (prev ? { ...prev, status: "connected", startTime: prev.startTime || Date.now() } : prev));
      }
      if (call.status === "ended" || call.status === "declined") {
        endLocalSession();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.callId]);

  const endLocalSession = useCallback(async (finalStatus: "ended" | "declined" = "ended") => {
    const session = sessionRef.current;
    const currentActiveCall = activeCallRef.current; // Capture before nulling
    sessionRef.current = null;
    setActiveCall(null);
    setIncomingCall(null);
    if (session) {
      await session.cleanup(finalStatus);
    }
    
    // Log the call message if we were the caller, to avoid duplicate messages.
    if (user && currentActiveCall && currentActiveCall.isCaller) {
       try {
         const chatId = await ensureChat(user.uid, currentActiveCall.otherUid);
         const isVideo = currentActiveCall.type === "video";
         if (currentActiveCall.status === "connected" && currentActiveCall.startTime) {
           const duration = Math.floor((Date.now() - currentActiveCall.startTime) / 1000);
           await sendMessage(chatId, user.uid, isVideo ? "Video call" : "Audio call", { type: "call", callDuration: duration });
         } else {
           await sendMessage(chatId, user.uid, isVideo ? "Missed video call" : "Missed audio call", { type: "call" });
         }
       } catch (e) {
         console.error("Failed to log call message", e);
       }
    }
  }, [user]);

  const startCall = useCallback(
    async (callee: { id: string; name: string; avatar: string }, type: CallType) => {
      if (!user || !profile) return;
      const session = new CallSession();
      sessionRef.current = session;
      setActiveCall({
        callId: "",
        name: callee.name,
        avatar: callee.avatar,
        type,
        incoming: false,
        status: "connecting",
        localStream: null,
        remoteStream: session.remoteStream,
        isCaller: true,
        otherUid: callee.id,
      });
      try {
        const callId = await session.startCall({
          callerId: user.uid,
          callerName: profile.name,
          callerAvatar: profile.photoURL,
          calleeId: callee.id,
          calleeName: callee.name,
          calleeAvatar: callee.avatar,
          type,
        });
        setActiveCall((prev) =>
          prev ? { ...prev, callId, localStream: session.localStream } : prev
        );
      } catch (e) {
        console.error("Failed to start call", e);
        endLocalSession("ended");
      }
    },
    [user, profile, endLocalSession]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    const session = new CallSession(call.id);
    sessionRef.current = session;
    setActiveCall({
      callId: call.id,
      name: call.callerName,
      avatar: call.callerAvatar,
      type: call.type,
      incoming: false,
      status: "connecting",
      localStream: null,
      remoteStream: session.remoteStream,
      isCaller: false,
      otherUid: call.callerId,
    });
    try {
      await session.answerCall(call.id, call.type);
      setActiveCall((prev) =>
        prev ? { ...prev, status: "connected", localStream: session.localStream, startTime: Date.now() } : prev
      );
    } catch (e: any) {
      console.error("Failed to answer call", e);
      alert(`Call failed: ${e.message || e}`);
      endLocalSession("ended");
    }
  }, [incomingCall, endLocalSession]);

  const declineIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    await declineCall(call.id);
  }, [incomingCall]);

  const hangUp = useCallback(() => endLocalSession("ended"), [endLocalSession]);

  const toggleMute = useCallback((muted: boolean) => {
    sessionRef.current?.toggleAudio(!muted);
  }, []);

  const toggleVideo = useCallback((videoOn: boolean) => {
    sessionRef.current?.toggleVideo(videoOn);
  }, []);

  return {
    incomingCall,
    activeCall,
    startCall,
    acceptCall,
    declineIncomingCall,
    hangUp,
    toggleMute,
    toggleVideo,
  };
}
