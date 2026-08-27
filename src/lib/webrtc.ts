import {
  doc,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  getDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // TODO: For production environments, it is recommended to use a dedicated TURN server
    // to ensure reliable connectivity across strict NATs and firewalls.
    // Example TURN configuration:
    // {
    //   urls: "turn:your-turn-server.com:3478",
    //   username: "your-username",
    //   credential: "your-password",
    // },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    }
  ],
};

export type CallType = "voice" | "video";
export type CallStatus = "ringing" | "accepted" | "ended" | "declined" | "missed";

export interface CallDoc {
  callerId: string;
  calleeId: string;
  callerName: string;
  callerAvatar: string;
  calleeName: string;
  calleeAvatar: string;
  type: CallType;
  status: CallStatus;
  createdAt?: any;
}

/**
 * Wraps a single WebRTC peer connection + Firestore signaling for one call.
 * Signaling model (classic "FirebaseUI WebRTC codelab" pattern):
 *  calls/{callId}                -> offer/answer + metadata
 *  calls/{callId}/callerCandidates/*
 *  calls/{callId}/calleeCandidates/*
 */
export class CallSession {
  pc: RTCPeerConnection;
  callId: string;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream;
  private unsubs: Array<() => void> = [];
  onRemoteTrack?: () => void;

  constructor(callId?: string) {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    this.remoteStream = new MediaStream();
    this.callId = callId || "";

    this.pc.ontrack = (event) => {
      this.remoteStream.addTrack(event.track);
      this.onRemoteTrack?.();
    };
  }

  private async getMedia(type: CallType) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: type === "video" ? { facingMode: "user" } : false,
      });
    } catch (e: any) {
      // Fallback to audio only if video fails (e.g. no camera)
      if (type === "video") {
        console.warn("Video failed, falling back to audio only.", e);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } else {
        throw e;
      }
    }
    this.localStream = stream;
    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
    return stream;
  }

  /** Caller side: create the call document + offer. */
  async startCall(params: {
    callerId: string;
    callerName: string;
    callerAvatar: string;
    calleeId: string;
    calleeName: string;
    calleeAvatar: string;
    type: CallType;
  }) {
    await this.getMedia(params.type);

    const callRef = doc(collection(db, "calls"));
    this.callId = callRef.id;
    const callerCandidates = collection(callRef, "callerCandidates");
    const calleeCandidates = collection(callRef, "calleeCandidates");

    this.pc.onicecandidate = (event) => {
      if (event.candidate) addDoc(callerCandidates, event.candidate.toJSON());
    };

    const offerDescription = await this.pc.createOffer();
    await this.pc.setLocalDescription(offerDescription);

    const callData: CallDoc = {
      callerId: params.callerId,
      calleeId: params.calleeId,
      callerName: params.callerName,
      callerAvatar: params.callerAvatar,
      calleeName: params.calleeName,
      calleeAvatar: params.calleeAvatar,
      type: params.type,
      status: "ringing",
    };

    await setDoc(callRef, {
      ...callData,
      offer: { type: offerDescription.type, sdp: offerDescription.sdp },
      createdAt: serverTimestamp(),
    });

    try {
      const { sendDirectPushNotification } = await import('./fcm');
      const recipientSnap = await getDoc(doc(db, 'users', params.calleeId));
      const recipientData = recipientSnap.data() as any;
      if (recipientData?.fcmToken) {
        sendDirectPushNotification(
          recipientData.fcmToken,
          'Incoming Call',
          `${params.callerName} is calling you`,
          { callId: this.callId, type: params.type }
        );
      }
    } catch (err) {
      console.error('Failed to trigger direct call notification:', err);
    }

    // Watch for the answer.
    const unsubCall = onSnapshot(callRef, (snap) => {
      const data = snap.data();
      if (!this.pc.currentRemoteDescription && data?.answer) {
        this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });
    this.unsubs.push(unsubCall);

    const unsubCandidates = onSnapshot(calleeCandidates, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          this.pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });
    this.unsubs.push(unsubCandidates);

    return this.callId;
  }

  /** Callee side: answer an existing call document. */
  async answerCall(callId: string, type: CallType) {
    this.callId = callId;
    await this.getMedia(type);

    const callRef = doc(db, "calls", callId);
    const callerCandidates = collection(callRef, "callerCandidates");
    const calleeCandidates = collection(callRef, "calleeCandidates");

    this.pc.onicecandidate = (event) => {
      if (event.candidate) addDoc(calleeCandidates, event.candidate.toJSON());
    };

    const callSnap = await getDoc(callRef);
    const callData = callSnap.data();
    if (!callData?.offer) throw new Error("Call offer missing");

    await this.pc.setRemoteDescription(new RTCSessionDescription(callData.offer));

    const answerDescription = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answerDescription);

    await updateDoc(callRef, {
      answer: { type: answerDescription.type, sdp: answerDescription.sdp },
      status: "accepted",
    });

    const unsubCandidates = onSnapshot(callerCandidates, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          this.pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });
    this.unsubs.push(unsubCandidates);
  }

  toggleAudio(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  toggleVideo(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
  }

  async cleanup(finalStatus: CallStatus = "ended") {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc.getSenders().forEach((s) => s.track?.stop());
    this.pc.close();

    if (this.callId) {
      try {
        const callRef = doc(db, "calls", this.callId);
        await updateDoc(callRef, { status: finalStatus, endedAt: serverTimestamp() });
        // Clean up ICE candidate subcollections.
        for (const sub of ["callerCandidates", "calleeCandidates"]) {
          const snap = await getDocs(collection(callRef, sub));
          await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        }
      } catch {
        // Call doc may already be gone.
      }
    }
  }
}

/** Listens for incoming calls addressed to `uid`. */
export function subscribeIncomingCalls(
  uid: string,
  cb: (call: (CallDoc & { id: string }) | null) => void
) {
  const q = query(collection(db, "calls"), where("calleeId", "==", uid));
  return onSnapshot(q, (snap) => {
    const ringingCalls = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) } as CallDoc & { id: string }))
      .filter((call) => call.status === "ringing");
    const first = ringingCalls[0];
    cb(first || null);
  });
}

export function subscribeCallDoc(
  callId: string,
  cb: (call: (CallDoc & { id: string }) | null) => void
) {
  return onSnapshot(doc(db, "calls", callId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null);
  });
}

export async function declineCall(callId: string) {
  await updateDoc(doc(db, "calls", callId), { status: "declined" });
}

/** Recent call log (both directions) for the given user. */
export function subscribeCallHistory(
  uid: string,
  cb: (calls: Array<CallDoc & { id: string }>) => void
) {
  const callerQ = query(collection(db, "calls"), where("callerId", "==", uid));
  const calleeQ = query(collection(db, "calls"), where("calleeId", "==", uid));

  let outgoing: Array<CallDoc & { id: string }> = [];
  let incoming: Array<CallDoc & { id: string }> = [];

  const emit = () => {
    const all = [...outgoing, ...incoming].sort((a, b) => {
      const aT = (a as any).createdAt?.toMillis?.() ?? 0;
      const bT = (b as any).createdAt?.toMillis?.() ?? 0;
      return bT - aT;
    });
    cb(all.slice(0, 30));
  };

  const unsub1 = onSnapshot(callerQ, (snap) => {
    outgoing = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    emit();
  });
  const unsub2 = onSnapshot(calleeQ, (snap) => {
    incoming = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    emit();
  });

  return () => {
    unsub1();
    unsub2();
  };
}

export async function clearCallHistory(uid: string) {
  const callerQ = query(collection(db, "calls"), where("callerId", "==", uid));
  const calleeQ = query(collection(db, "calls"), where("calleeId", "==", uid));

  const [callerSnap, calleeSnap] = await Promise.all([
    getDocs(callerQ),
    getDocs(calleeQ)
  ]);

  const batch = writeBatch(db);
  callerSnap.docs.forEach(d => batch.delete(d.ref));
  calleeSnap.docs.forEach(d => batch.delete(d.ref));

  await batch.commit();
}
