"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, type ThemeMode } from "@/contexts/SettingsContext";
import { BottomNav, TabType } from "@/components/messaging/BottomNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Phone, Video, Shield, Bell, Lock, Palette, TextQuote,
  Smartphone, Eye, ChevronLeft, LogOut, Plus, PhoneMissed, PhoneIncoming, PhoneOutgoing, Loader2,
  Check, X, Download, KeyRound, MessageSquare, Users,
} from "lucide-react";
import { ChatView } from "@/components/messaging/ChatView";
import { CallOverlay } from "@/components/messaging/CallOverlay";

import { AppLockScreen, sha256 } from "@/components/messaging/AppLockScreen";
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
import { doc as fsDoc, deleteDoc, getDocs, collection } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

const LANGUAGES = ['English (US)', 'Español', 'Français', 'Deutsch', '日本語', 'Português'];
const DESKTOP_NAV_ITEMS = [
  { id: 'chats' as const, label: 'Chats', icon: MessageSquare },
  { id: 'discover' as const, label: 'People', icon: Users },
  { id: 'calls' as const, label: 'Calls', icon: Phone },
  { id: 'settings' as const, label: 'Settings', icon: Shield },
];

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
  const { toast } = useToast();
  const { user, profile, loading, logout, deleteAccount, login, loginWithGoogle, finishDeleteAccount, sendPasswordReset } = useAuth();
  const { settings, updateSettings } = useSettings();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [callHistory, setCallHistory] = useState<Array<CallDoc & { id: string }>>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [myFriends, setMyFriends] = useState<string[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<string[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<string[]>([]);
  const [selectedOtherUid, setSelectedOtherUid] = useState<string | null>(null);

  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'online'>('all');
  const [locked, setLocked] = useState(false);

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
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [isExportingData, setIsExportingData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const callManager = useCallManager();

  // App Lock: require the PIN once per app load if enabled.
  useEffect(() => {
    if (settings.appLockEnabled && settings.appLockPinHash) {
      setLocked(true);
    } else {
      setLocked(false);
    }
    // Only re-evaluate when the lock is (de)activated, not on every settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.appLockEnabled, settings.appLockPinHash]);

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

  const pendingRequestPeople = useMemo(
    () => directory.filter((person) => incomingRequests.includes(person.uid)),
    [directory, incomingRequests]
  );

  const onlineFriends = useMemo(
    () => directory.filter((person) => myFriends.includes(person.uid) && person.online),
    [directory, myFriends]
  );

  const visibleChatRows = chatRows.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(chatSearchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (chatFilter === 'unread') return c.unread > 0;
    if (chatFilter === 'online') return c.online;
    return true;
  });

  const selectedPerson = selectedOtherUid ? directoryMap[selectedOtherUid] : null;
  const currentTitle =
    activeTab === 'settings' && settingsView !== 'main'
      ? settingsView.replace(/^\w/, (c) => c.toUpperCase())
      : activeTab === 'discover'
        ? 'People'
        : activeTab;

  const openConversation = async (otherUid: string, chatId?: string) => {
    if (!user) return;
    setSelectedOtherUid(otherUid);
    setActiveTab('chats');
    if (chatId) {
      await markChatRead(chatId, user.uid);
    }
  };

  const handleSendFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await sendFriendRequest(user.uid, otherUid);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Couldn't send friend request", description: error?.message || "Please try again." });
    }
  };

  const handleCancelFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await cancelFriendRequest(user.uid, otherUid);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Couldn't cancel request", description: error?.message || "Please try again." });
    }
  };

  const handleAcceptFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await acceptFriendRequest(user.uid, otherUid);
      await openConversation(otherUid, [user.uid, otherUid].sort().join('_'));
    } catch (error: any) {
      console.error(error);
      toast({ title: "Couldn't accept request", description: error?.message || "Please try again." });
    }
  };

  const handleRejectFriendRequest = async (otherUid: string) => {
    if (!user) return;
    try {
      await rejectFriendRequest(user.uid, otherUid);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Couldn't reject request", description: error?.message || "Please try again." });
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

    try {
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
    } catch (error: any) {
      console.error("Failed to save profile", error);
      toast({
        title: "Couldn't save profile",
        description: error?.code ? `${error.code}: ${error.message}` : "Please try again.",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!profile?.email) {
      toast({ title: "No email on file", description: "Password reset needs an email-based account." });
      return;
    }
    try {
      await sendPasswordReset(profile.email);
      toast({ title: "Password reset email sent", description: `Check ${profile.email} for a reset link.` });
    } catch (error: any) {
      toast({ title: "Couldn't send reset email", description: error?.code ? `${error.code}: ${error.message}` : "Please try again." });
    }
  };

  const handleDownloadMyData = async () => {
    if (!user) return;
    setIsExportingData(true);
    try {
      const chatsSnap = await getDocs(collection(db, "chats"));
      const myChats = chatsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((c: any) => (c.participants || []).includes(user.uid));

      const chatsWithMessages = await Promise.all(
        myChats.map(async (c: any) => {
          const msgsSnap = await getDocs(collection(db, "chats", c.id, "messages"));
          return {
            ...c,
            messages: msgsSnap.docs.map((m) => ({ id: m.id, ...(m.data() as any) })),
          };
        })
      );

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        profile,
        chats: chatsWithMessages,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-messenger-data-${user.uid}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Your data is downloading" });
    } catch (error: any) {
      console.error("Data export failed", error);
      toast({ title: "Couldn't export your data", description: "Please try again." });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleSetAppLockPin = async () => {
    if (pinValue.length < 4) {
      toast({ title: "PIN too short", description: "Use at least 4 digits." });
      return;
    }
    const hash = await sha256(pinValue);
    updateSettings({ appLockEnabled: true, appLockPinHash: hash });
    setPinDialogOpen(false);
    setPinValue('');
    toast({ title: "App Lock enabled" });
  };

  const handleDisableAppLock = () => {
    updateSettings({ appLockEnabled: false, appLockPinHash: null });
    toast({ title: "App Lock disabled" });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (locked && settings.appLockPinHash) {
    return <AppLockScreen expectedHash={settings.appLockPinHash} onUnlock={() => setLocked(false)} />;
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

  if (selectedPerson && isMobile) {
    return (
      <ChatView
        chat={{
          id: selectedPerson.uid,
          name: selectedPerson.name,
          avatar: selectedPerson.photoURL,
          online: !!selectedPerson.online,
          status: selectedPerson.status,
          email: selectedPerson.email,
          lastSeen: selectedPerson.lastSeen,
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
    <div className="min-h-screen lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen w-full lg:h-screen">
        <aside className="app-grid-lines hidden lg:flex lg:h-screen lg:w-[104px] lg:flex-col lg:items-center lg:justify-between lg:border-r lg:border-border/60 lg:bg-background/70 lg:p-4">
          <div className="flex flex-col items-center gap-4">
            <div className="app-surface flex h-14 w-14 items-center justify-center rounded-[22px] text-lg font-bold text-primary">
              M
            </div>
            <div className="flex flex-col gap-2">
              {DESKTOP_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    if (id !== 'settings') setSettingsView('main');
                  }}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-[20px] transition-all",
                    activeTab === id
                      ? "app-hero text-primary shadow-lg shadow-primary/10"
                      : "app-surface-muted text-muted-foreground hover:text-foreground"
                  )}
                  title={label}
                  aria-label={label}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div className="app-surface-muted flex w-full flex-col items-center gap-3 rounded-[24px] px-3 py-4">
            <Avatar className="h-11 w-11 ring-2 ring-background shadow-md">
              <AvatarImage src={profile?.photoURL} />
              <AvatarFallback>{profile?.name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="max-w-[64px] truncate text-[11px] font-semibold">{profile?.name}</p>
              <p className="text-[10px] text-muted-foreground">Available</p>
            </div>
          </div>
        </aside>

        <div className="app-grid-lines flex min-h-screen flex-1 flex-col overflow-hidden bg-background/55 lg:h-screen lg:min-h-0 lg:flex-row">
          <section
            className={cn(
              "flex min-h-0 flex-1 flex-col bg-background/78 backdrop-blur-xl",
              activeTab === 'chats'
                ? "lg:w-[430px] lg:flex-none lg:border-r lg:border-border/60 xl:w-[470px]"
                : "lg:max-w-full"
            )}
          >
            <header className="sticky top-0 z-10 border-b border-border/60 bg-background/68 px-5 pb-4 pt-8 backdrop-blur-xl lg:px-6 lg:pt-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {activeTab === 'settings' && settingsView !== 'main' && (
                    <Button variant="ghost" size="icon" onClick={() => setSettingsView('main')} className="rounded-full -ml-2">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <div>
                    <p className="app-kicker">My Messenger</p>
                    <h1 className="text-gradient-brand text-2xl font-bold font-headline capitalize">{currentTitle}</h1>
                  </div>
                </div>
                <div className="flex gap-2">
                  {activeTab === 'chats' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setChatSearchOpen((v) => !v);
                        if (chatSearchOpen) {
                          setChatSearchQuery('');
                          setChatFilter('all');
                        }
                      }}
                      className={cn("app-surface-muted rounded-full", chatSearchOpen && "text-accent")}
                    >
                      {chatSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                    </Button>
                  )}
                </div>
              </div>
              {activeTab === 'chats' && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="app-surface rounded-[24px] p-3">
                    <p className="text-[11px] text-muted-foreground">Unread</p>
                    <p className="mt-2 text-xl font-bold font-headline">{totalUnread}</p>
                  </div>
                  <div className="app-surface rounded-[24px] p-3">
                    <p className="text-[11px] text-muted-foreground">Online</p>
                    <p className="mt-2 text-xl font-bold font-headline">{onlineFriends.length}</p>
                  </div>
                  <div className="app-surface rounded-[24px] p-3">
                    <p className="text-[11px] text-muted-foreground">Requests</p>
                    <p className="mt-2 text-xl font-bold font-headline">{pendingRequestPeople.length}</p>
                  </div>
                </div>
              )}
              {activeTab === 'chats' && chatSearchOpen && (
                <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      placeholder="Search conversations..."
                      className="app-surface-muted h-11 rounded-full border-none pl-10"
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'unread', label: 'Unread' },
                      { id: 'online', label: 'Online' },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        onClick={() => setChatFilter(filter.id as 'all' | 'unread' | 'online')}
                        className={cn(
                          "rounded-full px-4 py-2 text-xs font-semibold transition-colors",
                          chatFilter === filter.id
                            ? "app-hero text-primary"
                            : "app-surface-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </header>

            <main className="flex-1 overflow-y-auto px-5 pb-24 pt-5 animate-in fade-in slide-in-from-bottom-2 duration-300 lg:px-6 lg:pb-6">
              {activeTab === 'chats' && (
                <div className="space-y-4">
                  {pendingRequestPeople.length > 0 && !chatSearchOpen && (
                    <div className="app-hero rounded-[30px] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Friend requests</p>
                          <p className="text-xs text-muted-foreground">
                            {pendingRequestPeople.length} waiting for your reply
                          </p>
                        </div>
                        <Badge className="rounded-full bg-accent px-2.5 py-1 text-[10px]">
                          New
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {pendingRequestPeople.slice(0, 2).map((person) => (
                          <div
                            key={person.uid}
                            className="app-surface flex items-center justify-between rounded-[22px] p-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={person.photoURL} />
                                <AvatarFallback>{person.name[0]}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{person.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {person.status || 'Wants to connect with you'}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="rounded-full" onClick={() => handleAcceptFriendRequest(person.uid)}>
                                Accept
                              </Button>
                              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => handleRejectFriendRequest(person.uid)}>
                                Later
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {chatRows.length === 0 && (
                      <div className="app-surface-muted rounded-[30px] border-dashed p-8 text-center">
                        <p className="text-base font-semibold">No conversations yet</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Head to the People tab and start your first chat.
                        </p>
                      </div>
                    )}
                    {chatRows.length > 0 && visibleChatRows.length === 0 && (
                      <div className="app-surface-muted rounded-[30px] border-dashed p-8 text-center">
                        <p className="text-base font-semibold">Nothing matches your search</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Try a different name, message preview, or filter.
                        </p>
                      </div>
                    )}
                    {visibleChatRows.map((chat) => (
                      <button
                        key={chat.chatId}
                        onClick={() => openConversation(chat.otherUid, chat.chatId)}
                        className={cn(
                          "w-full px-4 py-4 text-left transition-all rounded-[30px]",
                          selectedOtherUid === chat.otherUid
                            ? "app-hero shadow-lg shadow-primary/10"
                            : "app-surface hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <Avatar className="h-14 w-14 ring-2 ring-background shadow-sm">
                              <AvatarImage src={chat.avatar} />
                              <AvatarFallback>{chat.name[0]}</AvatarFallback>
                            </Avatar>
                            {chat.online && (
                              <div className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <h3 className="truncate text-[15px] font-semibold font-headline">{chat.name}</h3>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{chat.time}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm text-muted-foreground">
                                {chat.lastMessage || 'Say hello 👋'}
                              </p>
                              {chat.unread > 0 ? (
                                <Badge className="h-5 min-w-5 rounded-full bg-accent p-0 text-[10px]">
                                  {chat.unread}
                                </Badge>
                              ) : (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  {chat.online ? 'Online' : 'Seen recently'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'discover' && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Find people..."
                        className="app-surface-muted h-11 rounded-full border-none pl-10"
                      />
                    </div>

                    {pendingRequestPeople.length > 0 && (
                      <div className="app-hero rounded-[30px] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h3 className="app-section-label">
                              Incoming Requests
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              Review who wants to connect with you
                            </p>
                          </div>
                          <Badge variant="secondary">{pendingRequestPeople.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {pendingRequestPeople.map((person) => (
                            <div key={person.uid} className="app-surface flex items-center justify-between rounded-[22px] p-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar className="h-11 w-11">
                                  <AvatarImage src={person.photoURL} />
                                  <AvatarFallback>{person.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{person.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{person.status || 'Available on My Messenger'}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" className="rounded-full" onClick={() => handleAcceptFriendRequest(person.uid)}>
                                  Accept
                                </Button>
                                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => handleRejectFriendRequest(person.uid)}>
                                  Reject
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="app-section-label mb-4">
                      People on My Messenger
                    </h3>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {filteredDirectory.length === 0 && (
                        <div className="app-surface-muted rounded-[30px] border-dashed p-8 text-sm text-muted-foreground">
                          No one else has signed up yet. Invite a friend and build your network.
                        </div>
                      )}
                      {filteredDirectory.map((person) => {
                        const isFriend = myFriends.includes(person.uid);
                        const hasOutgoing = outgoingRequests.includes(person.uid);
                        const hasIncoming = incomingRequests.includes(person.uid);
                        return (
                          <div key={person.uid} className="app-surface rounded-[30px] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="relative">
                                  <Avatar className="h-12 w-12">
                                    <AvatarImage src={person.photoURL} />
                                    <AvatarFallback>{person.name[0]}</AvatarFallback>
                                  </Avatar>
                                  {person.online && (
                                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="truncate text-sm font-semibold">{person.name}</h4>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {person.status || (person.online ? 'Online' : 'Offline')}
                                  </p>
                                  {isFriend && <p className="mt-1 text-[10px] text-foreground/70">Friend</p>}
                                  {hasOutgoing && <p className="mt-1 text-[10px] text-muted-foreground">Friend request sent</p>}
                                  {hasIncoming && <p className="mt-1 text-[10px] text-primary">Incoming request</p>}
                                </div>
                              </div>
                              {person.online && (
                                <Badge variant="secondary" className="rounded-full">Online</Badge>
                              )}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {isFriend ? (
                                <Button variant="secondary" size="sm" className="rounded-full" onClick={() => openConversation(person.uid)}>
                                  Message
                                </Button>
                              ) : hasIncoming ? (
                                <>
                                  <Button size="sm" className="rounded-full" onClick={() => handleAcceptFriendRequest(person.uid)}>
                                    Accept
                                  </Button>
                                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => handleRejectFriendRequest(person.uid)}>
                                    Reject
                                  </Button>
                                </>
                              ) : hasOutgoing ? (
                                <Button variant="outline" size="sm" className="rounded-full" onClick={() => handleCancelFriendRequest(person.uid)}>
                                  Cancel Request
                                </Button>
                              ) : (
                                <Button variant="default" size="sm" className="rounded-full" onClick={() => handleSendFriendRequest(person.uid)}>
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
                <div className="space-y-3">
                  {callHistory.length === 0 && (
                    <div className="app-surface-muted rounded-[30px] border-dashed p-8 text-center">
                      <p className="text-base font-semibold">No calls yet</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Voice and video history will appear here once you connect.
                      </p>
                    </div>
                  )}
                  {callHistory.map((call) => {
                    const isOutgoing = call.callerId === user.uid;
                    const other = isOutgoing
                      ? { name: call.calleeName, avatar: call.calleeAvatar }
                      : { name: call.callerName, avatar: call.callerAvatar };
                    const missed = call.status === 'declined' || call.status === 'missed';
                    return (
                      <div key={call.id} className="app-surface flex items-center gap-4 rounded-[30px] p-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={other.avatar} />
                          <AvatarFallback>{other.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <h4 className={cn("truncate font-semibold text-sm", missed && "text-destructive")}>
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
                            <span className="text-[11px] capitalize text-muted-foreground">{call.type} call</span>
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
                <div className="app-hero p-6 rounded-[32px] flex flex-col items-center text-center">
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
                    <h4 className="app-section-label mb-3 ml-2">Notifications</h4>
                    <div className="app-surface rounded-[28px] overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg"><Bell className="h-4 w-4 text-blue-600" /></div>
                          <span className="text-sm font-medium">Message Notifications</span>
                        </div>
                        <Switch
                          checked={settings.messageNotifications}
                          onCheckedChange={(checked) => updateSettings({ messageNotifications: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-green-100 p-2 rounded-lg"><Phone className="h-4 w-4 text-green-600" /></div>
                          <span className="text-sm font-medium">Calls</span>
                        </div>
                        <Switch
                          checked={settings.callNotifications}
                          onCheckedChange={(checked) => updateSettings({ callNotifications: checked })}
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="app-section-label mb-3 ml-2">Privacy</h4>
                    <div className="app-surface rounded-[28px] overflow-hidden">
                      <div className="flex items-center justify-between p-4 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="bg-orange-100 p-2 rounded-lg"><Eye className="h-4 w-4 text-orange-600" /></div>
                          <span className="text-sm font-medium">Read Receipts</span>
                        </div>
                        <Switch
                          checked={settings.readReceipts}
                          onCheckedChange={(checked) => updateSettings({ readReceipts: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-cyan-100 p-2 rounded-lg"><Smartphone className="h-4 w-4 text-cyan-600" /></div>
                          <span className="text-sm font-medium">Typing Indicator</span>
                        </div>
                        <Switch
                          checked={settings.typingIndicator}
                          onCheckedChange={(checked) => updateSettings({ typingIndicator: checked })}
                        />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="app-section-label mb-3 ml-2">General</h4>
                    <div className="app-surface rounded-[28px] overflow-hidden">
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
                    <div className="app-surface p-4 rounded-[28px] space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-sm font-semibold">App Lock (PIN)</h5>
                          <p className="text-xs text-muted-foreground">Require a PIN to open the app</p>
                        </div>
                        <Switch
                          checked={settings.appLockEnabled}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setPinValue('');
                              setPinDialogOpen(true);
                            } else {
                              handleDisableAppLock();
                            }
                          }}
                        />
                      </div>
                      {settings.appLockEnabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => { setPinValue(''); setPinDialogOpen(true); }}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-2" /> Change PIN
                        </Button>
                      )}
                    </div>
                    <Button variant="outline" className="w-full rounded-xl" onClick={handleChangePassword}>
                      Reset Password by Email
                    </Button>
                  </div>
                )}

                {settingsView === 'theme' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => updateSettings({ theme: 'light' })}
                        className={cn(
                          "app-surface flex flex-col items-center gap-3 p-4 rounded-[28px] border-2 bg-background",
                          settings.theme === 'light' ? "border-primary" : "border-border"
                        )}
                      >
                        <div className="h-16 w-full bg-slate-50 rounded-lg border relative">
                          {settings.theme === 'light' && <Check className="h-4 w-4 absolute top-1 right-1 text-primary" />}
                        </div>
                        <span className="text-xs font-semibold">Light Mode</span>
                      </button>
                      <button
                        onClick={() => updateSettings({ theme: 'dark' })}
                        className={cn(
                          "flex flex-col items-center gap-3 p-4 rounded-[28px] border bg-slate-900 shadow-xl shadow-primary/10",
                          settings.theme === 'dark' ? "border-2 border-primary" : "border-border"
                        )}
                      >
                        <div className="h-16 w-full bg-slate-800 rounded-lg relative">
                          {settings.theme === 'dark' && <Check className="h-4 w-4 absolute top-1 right-1 text-white" />}
                        </div>
                        <span className="text-xs font-semibold text-white">Dark Mode</span>
                      </button>
                    </div>
                    <div className="app-surface p-4 rounded-[28px]">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Follow System Theme</span>
                        <Switch
                          checked={settings.theme === 'system'}
                          onCheckedChange={(checked) => updateSettings({ theme: checked ? 'system' : 'light' })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {settingsView === 'language' && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground px-1">
                      Choosing a language updates your preference. Full app translation is still in progress — the interface currently displays in English.
                    </p>
                    <div className="app-surface rounded-[28px] overflow-hidden">
                      {LANGUAGES.map((lang, i) => (
                        <button
                          key={i}
                          onClick={() => updateSettings({ language: lang })}
                          className="w-full flex items-center justify-between p-4 border-b last:border-0 hover:bg-muted/30"
                        >
                          <span className="text-sm font-medium">{lang}</span>
                          {settings.language === lang && <Check className="h-4 w-4 text-accent" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {settingsView === 'privacy' && (
                  <div className="space-y-4">
                    <div className="app-surface prose prose-sm text-muted-foreground p-4 rounded-[28px]">
                      <p>At My Messenger, we value your privacy. Messages are stored securely in your Firebase project and only shared with the people you message.</p>
                      <p className="mt-2">We do not sell your data to third parties.</p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl"
                      onClick={handleDownloadMyData}
                      disabled={isExportingData}
                    >
                      {isExportingData ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Download My Data
                    </Button>
                  </div>
                )}
              </div>
            )}
                </div>
              )}
            </main>
          </section>

          {!isMobile && activeTab === 'chats' && (
            <section className="app-grid-lines hidden min-h-0 flex-1 bg-background/35 lg:flex">
              {selectedPerson ? (
                <ChatView
                  embedded
                  chat={{
                    id: selectedPerson.uid,
                    name: selectedPerson.name,
                    avatar: selectedPerson.photoURL,
                    online: !!selectedPerson.online,
                    status: selectedPerson.status,
                    email: selectedPerson.email,
                    lastSeen: selectedPerson.lastSeen,
                  }}
                  isBlocked={blockedUsers.includes(selectedPerson.uid)}
                  onBack={() => setSelectedOtherUid(null)}
                  onCall={(type) => callManager.startCall(
                    { id: selectedPerson.uid, name: selectedPerson.name, avatar: selectedPerson.photoURL },
                    type
                  )}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-10">
                  <div className="app-hero max-w-md rounded-[36px] p-10 text-center">
                    <div className="app-surface mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] text-primary">
                      <MessageSquare className="h-9 w-9" />
                    </div>
                    <h2 className="text-gradient-brand text-2xl font-bold font-headline">Pick a conversation</h2>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Your messages, media, typing indicators, and calls will show up here in a full desktop conversation view.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <div className="lg:hidden">
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} unreadCount={totalUnread} />
      </div>

      {/* App Lock PIN setup dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle>Set App Lock PIN</DialogTitle>
            <DialogDescription>You'll need this PIN to open My Messenger.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value)}
              placeholder="Enter a 4-8 digit PIN"
              className="text-center tracking-[0.5em] rounded-xl h-12 bg-muted/50 border-none"
            />
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="ghost" onClick={() => setPinDialogOpen(false)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={handleSetAppLockPin} className="flex-1 rounded-xl bg-accent hover:bg-accent/90">Save PIN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
