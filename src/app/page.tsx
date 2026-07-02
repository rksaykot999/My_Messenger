"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav, TabType } from "@/components/messaging/BottomNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Phone, Video, Shield, Bell, Lock, Palette, TextQuote,
  Smartphone, Eye, ChevronLeft, LogOut, Plus, PhoneMissed, PhoneIncoming, PhoneOutgoing, Loader2,
} from "lucide-react";
import { ChatView } from "@/components/messaging/ChatView";
import { CallOverlay } from "@/components/messaging/CallOverlay";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  subscribeChats,
  subscribeDirectory,
  markChatRead,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  type ChatSummary,
  type DirectoryUser,
} from "@/lib/chat";
import { subscribeCallHistory, type CallDoc } from "@/lib/webrtc";
import { useCallManager } from "@/hooks/use-call-manager";
import { useMessageNotifications } from "@/hooks/use-message-notifications";
import { updateProfile } from "firebase/auth";
import { doc as fsDoc, deleteDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";

type SettingsView = 'main' | 'security' | 'theme' | 'language' | 'privacy';

function timeAgo(ts: any) {
  const ms = ts?.toMillis?.();
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 2) return 'Yesterday';
  return `${days}d`;
}

export default function MessengerApp() {
  const router = useRouter();
  const { user, profile, loading, logout, deleteAccount, login, loginWithGoogle, finishDeleteAccount } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [callHistory, setCallHistory] = useState<Array<CallDoc & { id: string }>>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [myFriends, setMyFriends] = useState<string[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<string[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<string[]>([]);
  const [selectedOtherUid, setSelectedOtherUid] = useState<string | null>(null);

  const [settingsView, setSettingsView] = useState<SettingsView>('main');
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthEmail, setReauthEmail] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [reauthSubmitting, setReauthSubmitting] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const callManager = useCallManager();

  // Redirect unauthenticated visitors to the login page.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeChats(user.uid, setChats);
    const unsub2 = subscribeDirectory(user.uid, setDirectory);
    const unsub3 = subscribeCallHistory(user.uid, setCallHistory);
    const unsub4 = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.data() as any;
      setBlockedUsers(data?.blockedUsers || []);
      setMyFriends(data?.friends || []);
      setOutgoingRequests(data?.outgoingRequests || []);
      setIncomingRequests(data?.incomingRequests || []);
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [user]);

  const directoryMap = useMemo(() => {
    const map: Record<string, DirectoryUser> = {};
    directory.forEach((d) => (map[d.uid] = d));
    return map;
  }, [directory]);

  const directoryMapLite = useMemo(() => {
    const map: Record<string, { name: string; photoURL: string }> = {};
    directory.forEach((d) => (map[d.uid] = { name: d.name, photoURL: d.photoURL }));
    return map;
  }, [directory]);

  // Resolve each Firestore chat into a display-friendly row (other participant's info).
  const chatRows = useMemo(() => {
    if (!user) return [];
    return chats
      .map((chat) => {
        const otherUid = chat.participants.find((p) => p !== user.uid);
        const other = otherUid ? directoryMap[otherUid] : undefined;
        if (!otherUid || !other) return null;
        return {
          chatId: chat.id,
          otherUid,
          name: other.name,
          avatar: other.photoURL,
          online: !!other.online,
          lastMessage: chat.lastMessage,
          time: timeAgo(chat.lastMessageAt),
          unread: chat.unread?.[user.uid] || 0,
        };
      })
      .filter(Boolean) as Array<{
        chatId: string; otherUid: string; name: string; avatar: string;
        online: boolean; lastMessage: string; time: string; unread: number;
      }>;
  }, [chats, directoryMap, user]);

  const totalUnread = chatRows.reduce((acc, c) => acc + c.unread, 0);

  const activeChatId = useMemo(() => {
    if (!selectedOtherUid || !user) return null;
    return [user.uid, selectedOtherUid].sort().join('_');
  }, [selectedOtherUid, user]);

  useMessageNotifications(
    user?.uid,
    chats,
    directoryMapLite,
    activeChatId,
    (chatId) => {
      const chat = chats.find((c) => c.id === chatId);
      const otherUid = chat?.participants.find((p) => p !== user?.uid);
      if (otherUid) setSelectedOtherUid(otherUid);
    }
  );

  const filteredDirectory = directory.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedPerson = selectedOtherUid ? directoryMap[selectedOtherUid] : null;

  const handleSendFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await sendFriendRequest(user.uid, otherUid);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCancelFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await cancelFriendRequest(user.uid, otherUid);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAcceptFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await acceptFriendRequest(user.uid, otherUid);
      setActiveTab('chats');
      setSelectedOtherUid(otherUid);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRejectFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await rejectFriendRequest(user.uid, otherUid);
    } catch (error) {
      console.error(error);
    }
  };

  const handlePhotoSelection = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handleSaveProfile = async () => {
    if (!auth.currentUser) return;

    let photoURL = profile?.photoURL;

    if (photoFile) {
      setIsUploadingPhoto(true);
      const storageRef = ref(
        firebaseStorage,
        `profilePhotos/${auth.currentUser.uid}/${Date.now()}_${photoFile.name}`
      );
      const uploadTask = uploadBytesResumable(storageRef, photoFile);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            setUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            photoURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve();
          }
        );
      }).finally(() => {
        setIsUploadingPhoto(false);
      });
    }

    await updateProfile(auth.currentUser, {
      displayName: editName,
      photoURL,
    });

    await updateDoc(fsDoc(db, "users", auth.currentUser.uid), {
      name: editName,
      status: editStatus,
      photoURL,
    });

    setIsProfileEditing(false);
    setPhotoFile(null);
    setPhotoPreview(null);
    setUploadProgress(0);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  // Incoming call ringing (takes priority over an in-progress call view).
  if (callManager.incomingCall && !callManager.activeCall) {
    return (
      <CallOverlay
        name={callManager.incomingCall.callerName}
        avatar={callManager.incomingCall.callerAvatar}
        type={callManager.incomingCall.type}
        incoming
        onEnd={callManager.declineIncomingCall}
        onAccept={callManager.acceptCall}
      />
    );
  }

  if (callManager.activeCall) {
    const c = callManager.activeCall;
    return (
      <CallOverlay
        name={c.name}
        avatar={c.avatar}
        type={c.type}
        status={c.status}
        localStream={c.localStream}
        remoteStream={c.remoteStream}
        onEnd={callManager.hangUp}
        onToggleMute={callManager.toggleMute}
        onToggleVideo={callManager.toggleVideo}
      />
    );
  }

  if (selectedPerson) {
    return (
      <ChatView
        chat={{
          id: selectedPerson.uid,
          name: selectedPerson.name,
          avatar: selectedPerson.photoURL,
          online: !!selectedPerson.online,
        }}
        isBlocked={blockedUsers.includes(selectedPerson.uid)}
        onBack={() => setSelectedOtherUid(null)}
        onCall={(type) => callManager.startCall(
          { id: selectedPerson.uid, name: selectedPerson.name, avatar: selectedPerson.photoURL },
          type
        )}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 flex flex-col max-w-md mx-auto relative border-x">
      {/* Header */}
      <header className="px-5 pt-8 pb-4 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {activeTab === 'settings' && settingsView !== 'main' && (
              <Button variant="ghost" size="icon" onClick={() => setSettingsView('main')} className="rounded-full -ml-2">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-2xl font-bold font-headline capitalize">
              {activeTab === 'settings' && settingsView !== 'main' ? settingsView.replace(/^\w/, c => c.toUpperCase()) : activeTab === 'discover' ? 'People' : activeTab}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full bg-muted/50">
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <main className="flex-1 px-5 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'chats' && (
          <div className="space-y-1">
            {chatRows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-10">
                No conversations yet. Head to the People tab to say hello.
              </p>
            )}
            {chatRows.map((chat) => (
              <button
                key={chat.chatId}
                onClick={async () => {
                  setSelectedOtherUid(chat.otherUid);
                  await markChatRead(chat.chatId, user.uid);
                }}
                className="w-full flex items-center gap-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors rounded-lg px-2"
              >
                <div className="relative">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={chat.avatar} />
                    <AvatarFallback>{chat.name[0]}</AvatarFallback>
                  </Avatar>
                  {chat.online && <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="font-semibold text-[15px] truncate font-headline">{chat.name}</h3>
                    <span className="text-[11px] text-muted-foreground">{chat.time}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground truncate max-w-[180px]">{chat.lastMessage || 'Say hello 👋'}</p>
                    {chat.unread > 0 && (
                      <Badge className="bg-accent h-5 min-w-5 flex items-center justify-center p-0 rounded-full text-[10px]">{chat.unread}</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'discover' && (
          <div className="space-y-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find people..."
                className="pl-10 rounded-full bg-muted/50 border-none h-11"
              />
            </div>

            <div>
              <h3 className="text-sm font-bold text-primary mb-4 uppercase tracking-wider">
                People on My Messenger
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {filteredDirectory.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No one else has signed up yet — invite a friend!
                  </p>
                )}
                {filteredDirectory.map((person) => {
                  const isFriend = myFriends.includes(person.uid);
                  const hasOutgoing = outgoingRequests.includes(person.uid);
                  const hasIncoming = incomingRequests.includes(person.uid);
                  return (
                    <div key={person.uid} className="rounded-3xl border border-border/70 bg-card p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={person.photoURL} />
                            <AvatarFallback>{person.name[0]}</AvatarFallback>
                          </Avatar>
                          {person.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold truncate">{person.name}</h4>
                          <p className="text-xs text-muted-foreground truncate">
                            {person.status || (person.online ? 'Online' : 'Offline')}
                          </p>
                          {isFriend && <p className="text-[10px] text-foreground/70 mt-1">Friend</p>}
                          {hasOutgoing && <p className="text-[10px] text-muted-foreground mt-1">Friend request sent</p>}
                          {hasIncoming && <p className="text-[10px] text-primary mt-1">Incoming request</p>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {isFriend ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedOtherUid(person.uid)}
                          >
                            Message
                          </Button>
                        ) : hasIncoming ? (
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAcceptFriendRequest(person.uid)}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRejectFriendRequest(person.uid)}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : hasOutgoing ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelFriendRequest(person.uid)}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSendFriendRequest(person.uid)}
                          >
                            Add Friend
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calls' && (
          <div className="space-y-1">
            {callHistory.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-10">No calls yet.</p>
            )}
            {callHistory.map((call) => {
              const isOutgoing = call.callerId === user.uid;
              const other = isOutgoing
                ? { name: call.calleeName, avatar: call.calleeAvatar }
                : { name: call.callerName, avatar: call.callerAvatar };
              const missed = call.status === 'declined' || call.status === 'missed';
              return (
                <div key={call.id} className="flex items-center gap-4 py-3 group">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={other.avatar} />
                    <AvatarFallback>{other.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h4 className={cn("font-semibold text-sm", missed && "text-destructive")}>
                      {other.name}
                    </h4>
                    <div className="flex items-center gap-1.5">
                      {isOutgoing ? (
                        <PhoneOutgoing className="h-3 w-3 text-muted-foreground" />
                      ) : missed ? (
                        <PhoneMissed className="h-3 w-3 text-destructive" />
                      ) : (
                        <PhoneIncoming className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-[11px] text-muted-foreground capitalize">{call.type} call</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => callManager.startCall({ id: isOutgoing ? call.calleeId : call.callerId, name: other.name, avatar: other.avatar }, call.type)}
                    className="rounded-full text-primary hover:bg-primary/5"
                  >
                    {call.type === 'voice' ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {settingsView === 'main' ? (
              <>
                <div className="bg-primary/5 p-6 rounded-3xl flex flex-col items-center text-center">
                  <Avatar className="h-24 w-24 mb-4 ring-4 ring-background shadow-xl">
                    <AvatarImage src={profile?.photoURL} />
                    <AvatarFallback>{profile?.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <h3 className="text-xl font-bold font-headline">{profile?.name}</h3>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  <Button
                    variant="outline"
                    onClick={() => { setEditName(profile?.name || ''); setEditStatus(profile?.status || ''); setIsProfileEditing(true); }}
                    className="mt-4 rounded-full px-6 text-xs h-8"
                  >
                    Edit Profile
                  </Button>
                </div>

                <div className="space-y-4">
                  <section>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 ml-2">Notifications</h4>
                    <div className="bg-card rounded-2xl border overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg"><Bell className="h-4 w-4 text-blue-600" /></div>
                          <span className="text-sm font-medium">Message Notifications</span>
                        </div>
                        <Switch defaultChecked />
                      </div>
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-green-100 p-2 rounded-lg"><Phone className="h-4 w-4 text-green-600" /></div>
                          <span className="text-sm font-medium">Calls</span>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 ml-2">Privacy</h4>
                    <div className="bg-card rounded-2xl border overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-orange-100 p-2 rounded-lg"><Eye className="h-4 w-4 text-orange-600" /></div>
                          <span className="text-sm font-medium">Read Receipts</span>
                        </div>
                        <Switch defaultChecked />
                      </div>
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-cyan-100 p-2 rounded-lg"><Smartphone className="h-4 w-4 text-cyan-600" /></div>
                          <span className="text-sm font-medium">Typing Indicator</span>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 ml-2">General</h4>
                    <div className="bg-card rounded-2xl border overflow-hidden">
                      {[
                        { id: 'security' as const, icon: Shield, label: 'Account Security' },
                        { id: 'theme' as const, icon: Palette, label: 'Theme & Appearance' },
                        { id: 'language' as const, icon: TextQuote, label: 'Language' },
                        { id: 'privacy' as const, icon: Lock, label: 'Privacy Policy' },
                      ].map((item, i) => (
                        <button
                          key={i}
                          onClick={() => setSettingsView(item.id)}
                          className="w-full flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-muted p-2 rounded-lg"><item.icon className="h-4 w-4 text-muted-foreground" /></div>
                            <span className="text-sm font-medium">{item.label}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] opacity-50">View</Badge>
                        </button>
                      ))}
                    </div>
                  </section>
                  {settingsView !== 'main' && (
                    <Button
                      variant="ghost"
                      onClick={() => setSettingsView('main')}
                      className="w-full rounded-2xl h-12"
                    >
                      Back to settings
                    </Button>
                  )}

                  <div className="space-y-3">
                    <Button
                      variant="ghost"
                      onClick={() => logout()}
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 rounded-2xl h-12"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Log Out
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm('Delete your account? This cannot be undone.')) return;
                        try {
                          await deleteAccount();
                        } catch (err: any) {
                          console.error(err);
                          if (err?.code === 'auth/requires-recent-login') {
                            setReauthError(null);
                            setReauthEmail(profile?.email || '');
                            setReauthPassword('');
                            setReauthOpen(true);
                          } else {
                            alert('Account deletion failed. Please try again.');
                          }
                        }
                      }}
                      className="w-full rounded-2xl h-12"
                    >
                      Delete Account
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-6">
                {settingsView === 'security' && (
                  <div className="space-y-4">
                    <div className="bg-card p-4 rounded-2xl border space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-sm font-semibold">Two-Factor Authentication</h5>
                          <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                        </div>
                        <Switch />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-sm font-semibold">Face ID / Touch ID</h5>
                          <p className="text-xs text-muted-foreground">Quick access to your chats</p>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    </div>
                    <Button variant="outline" className="w-full rounded-xl">Change Password</Button>
                  </div>
                )}

                {settingsView === 'theme' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <button className="flex flex-col items-center gap-3 p-4 rounded-2xl border-2 border-primary bg-background">
                        <div className="h-16 w-full bg-slate-50 rounded-lg border" />
                        <span className="text-xs font-semibold">Light Mode</span>
                      </button>
                      <button className="flex flex-col items-center gap-3 p-4 rounded-2xl border bg-slate-900">
                        <div className="h-16 w-full bg-slate-800 rounded-lg" />
                        <span className="text-xs font-semibold text-white">Dark Mode</span>
                      </button>
                    </div>
                    <div className="bg-card p-4 rounded-2xl border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Follow System Theme</span>
                        <Switch defaultChecked />
                      </div>
                    </div>
                  </div>
                )}

                {settingsView === 'language' && (
                  <div className="bg-card rounded-2xl border overflow-hidden">
                    {['English (US)', 'Español', 'Français', 'Deutsch', '日本語', 'Português'].map((lang, i) => (
                      <button key={i} className="w-full flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/30">
                        <span className="text-sm font-medium">{lang}</span>
                      </button>
                    ))}
                  </div>
                )}

                {settingsView === 'privacy' && (
                  <div className="space-y-4">
                    <div className="prose prose-sm text-muted-foreground bg-card p-4 rounded-2xl border">
                      <p>At My Messenger, we value your privacy. Messages are stored securely in your Firebase project and only shared with the people you message.</p>
                      <p className="mt-2">We do not sell your data to third parties.</p>
                    </div>
                    <Button variant="outline" className="w-full rounded-xl">Download My Data</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Edit Profile Dialog */}
      <Dialog open={isProfileEditing} onOpenChange={setIsProfileEditing}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your personal information here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
                  <div className="flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={handlePhotoSelection}
                className="relative rounded-full border border-muted/60 p-1 hover:ring-2 hover:ring-accent transition-all"
              >
                <Avatar className="h-20 w-20">
                  <AvatarImage src={photoPreview || profile?.photoURL} />
                  <AvatarFallback>{profile?.name?.[0]}</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 right-0.5 bg-accent text-white rounded-full p-1 shadow-lg">
                  <Plus className="h-3.5 w-3.5" />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoFileChange}
              />
              {isUploadingPhoto && (
                <div className="w-full rounded-full bg-muted/30 h-2 overflow-hidden">
                  <div className="h-2 bg-accent transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Display Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl bg-muted/50 border-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Status</label>
              <Input value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="rounded-xl bg-muted/50 border-none" />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="ghost" onClick={() => setIsProfileEditing(false)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleSaveProfile} className="flex-1 rounded-xl bg-accent hover:bg-accent/90">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        <Dialog open={reauthOpen} onOpenChange={setReauthOpen}>
          <DialogContent className="max-w-xs rounded-3xl">
            <DialogHeader>
              <DialogTitle>Re-authenticate</DialogTitle>
              <DialogDescription>For security, please sign in again to delete your account.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="reauth-email">Email</Label>
                <Input id="reauth-email" value={reauthEmail} onChange={(e) => setReauthEmail(e.target.value)} className="rounded-xl bg-muted/50 border-none" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reauth-password">Password</Label>
                <Input id="reauth-password" type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} className="rounded-xl bg-muted/50 border-none" />
              </div>
              {reauthError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{reauthError}</p>
              )}
            </div>
            <DialogFooter className="flex-row gap-2">
              <Button variant="ghost" onClick={() => setReauthOpen(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button
                onClick={async () => {
                  setReauthError(null);
                  setReauthSubmitting(true);
                  try {
                    await login(reauthEmail, reauthPassword);
                    await finishDeleteAccount();
                    setReauthOpen(false);
                    router.replace('/login');
                  } catch (err: any) {
                    console.error('Reauth failed', err);
                    setReauthError(err?.code ? err.message : 'Reauthentication failed.');
                  } finally {
                    setReauthSubmitting(false);
                  }
                }}
                className="flex-1 rounded-xl bg-accent hover:bg-accent/90"
              >
                Reauthenticate & Delete
              </Button>
            </DialogFooter>
            <div className="px-6 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  setReauthError(null);
                  setReauthSubmitting(true);
                  try {
                    await loginWithGoogle();
                    await finishDeleteAccount();
                    setReauthOpen(false);
                    router.replace('/login');
                  } catch (err) {
                    console.error('Google reauth failed', err);
                    setReauthError('Reauthentication failed.');
                  } finally {
                    setReauthSubmitting(false);
                  }
                }}
                className="w-full rounded-xl"
              >
                Continue with Google
              </Button>
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}
