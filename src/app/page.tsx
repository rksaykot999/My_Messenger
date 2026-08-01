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
import Image from "next/image";
import AppLogo from "./app logo.svg";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  createGroupChat,
  leaveGroupChat,
  deleteGroupChat,
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [createGroupName, setCreateGroupName] = useState('');
  const [createGroupSelectedFriends, setCreateGroupSelectedFriends] = useState<string[]>([]);

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

  // Handle Android/Web back button to close sub-screens instead of exiting app
  const isSubScreenActive = !!(
    selectedOtherUid || 
    selectedGroupId || 
    isCreateGroupOpen || 
    chatSearchOpen || 
    settingsView !== 'main'
  );

  useEffect(() => {
    if (isSubScreenActive) {
      if (!window.history.state?.internal) {
        window.history.pushState({ internal: true }, '');
      }
    } else if (window.history.state?.internal) {
      window.history.back();
    }
  }, [isSubScreenActive]);

  useEffect(() => {
    const handlePopState = () => {
      setSelectedOtherUid(null);
      setSelectedGroupId(null);
      setIsCreateGroupOpen(false);
      setChatSearchOpen(false);
      setSettingsView('main');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  // Resolve each Firestore chat into a display-friendly row.
  const chatRows = useMemo(() => {
    if (!user) return [];
    return chats
      .map((chat) => {
        if (chat.isGroup) {
          return {
            chatId: chat.id,
            isGroup: true,
            name: chat.groupName || 'Group Chat',
            avatar: chat.groupAvatar || '',
            online: false,
            lastMessage: chat.lastMessage,
            lastSenderId: chat.lastSenderId,
            time: timeAgo(chat.lastMessageAt),
            unread: chat.unread?.[user.uid] || 0,
            participants: chat.participants,
            quickEmoji: chat.quickEmoji,
          };
        }

        const otherUid = chat.participants.find((p) => p !== user.uid);
        const other = otherUid ? directoryMap[otherUid] : undefined;
        if (!otherUid || !other) return null;
        return {
          chatId: chat.id,
          otherUid,
          isGroup: false,
          name: other.name,
          avatar: other.photoURL,
          online: !!other.online,
          lastMessage: chat.lastMessage,
          lastSenderId: chat.lastSenderId,
          time: timeAgo(chat.lastMessageAt),
          unread: chat.unread?.[user.uid] || 0,
          quickEmoji: chat.quickEmoji,
        };
      })
      .filter(Boolean) as Array<{
        chatId: string; otherUid?: string; isGroup?: boolean; name: string; avatar: string;
        online: boolean; lastMessage: string; lastSenderId?: string; time: string; unread: number;
        participants?: string[]; quickEmoji?: string;
      }>;
  }, [chats, directoryMap, user]);

  const totalUnread = chatRows.reduce((acc, c) => acc + c.unread, 0);

  const activeChatId = useMemo(() => {
    if (selectedGroupId) return selectedGroupId;
    if (!selectedOtherUid || !user) return null;
    return [user.uid, selectedOtherUid].sort().join('_');
  }, [selectedGroupId, selectedOtherUid, user]);

  useMessageNotifications(
    user?.uid,
    chats,
    directoryMapLite,
    activeChatId,
    (chatId) => {
      const chat = chats.find((c) => c.id === chatId);
      const otherUid = chat?.participants.find((p) => p !== user?.uid);
      if (chat?.isGroup) {
        if (isMobile && !selectedGroupId && !selectedOtherUid) {
          window.history.pushState({ chatOpen: true }, '');
        }
        setSelectedGroupId(chatId);
        setSelectedOtherUid(null);
      } else if (otherUid) {
        if (isMobile && !selectedOtherUid && !selectedGroupId) {
          window.history.pushState({ chatOpen: true }, '');
        }
        setSelectedOtherUid(otherUid);
        setSelectedGroupId(null);
      }
    }
  );

  useEffect(() => {
    const handlePopState = () => {
      if (selectedOtherUid || selectedGroupId) {
        setSelectedOtherUid(null);
        setSelectedGroupId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedOtherUid, selectedGroupId]);

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
  const selectedGroupChat = selectedGroupId ? chats.find(c => c.id === selectedGroupId) : null;
  const currentTitle =
    activeTab === 'settings' && settingsView !== 'main'
      ? settingsView.replace(/^\w/, (c) => c.toUpperCase())
      : activeTab === 'discover'
        ? 'People'
        : activeTab;
  const shouldShowChatSearch = !isMobile || chatSearchOpen;
  const discoverOnlinePeople = useMemo(
    () => filteredDirectory.filter((person) => person.online).slice(0, 8),
    [filteredDirectory]
  );
  const discoverSuggestions = useMemo(
    () =>
      filteredDirectory.filter(
        (person) =>
          !myFriends.includes(person.uid) &&
          !incomingRequests.includes(person.uid) &&
          !outgoingRequests.includes(person.uid)
      ),
    [filteredDirectory, incomingRequests, myFriends, outgoingRequests]
  );

  const openConversation = async (otherUid: string | null, chatId?: string, isGroup?: boolean) => {
    if (!user) return;
    if (isMobile && !selectedOtherUid && !selectedGroupId) {
      window.history.pushState({ chatOpen: true }, '');
    }
    if (isGroup && chatId) {
      setSelectedGroupId(chatId);
      setSelectedOtherUid(null);
    } else if (otherUid) {
      setSelectedOtherUid(otherUid);
      setSelectedGroupId(null);
    }
    setActiveTab('chats');
    if (chatId) {
      await markChatRead(chatId, user.uid);
    }
  };

  const handleCreateGroup = async () => {
    if (!user || !createGroupName.trim() || createGroupSelectedFriends.length === 0) return;
    try {
      const chatId = await createGroupChat(user.uid, createGroupSelectedFriends, createGroupName.trim());
      setIsCreateGroupOpen(false);
      setCreateGroupName('');
      setCreateGroupSelectedFriends([]);
      openConversation(null, chatId, true);
    } catch (e: any) {
      toast({ title: "Error creating group", description: e.message });
    }
  };

  const handleLeaveGroup = async (chatId: string) => {
    if (!user) return;
    try {
      await leaveGroupChat(chatId, user.uid);
      setSelectedGroupId(null);
      toast({ title: "Left Group", description: "You have left the group chat." });
    } catch (e: any) {
      toast({ title: "Error leaving group", description: e.message });
    }
  };

  const handleDeleteGroup = async (chatId: string) => {
    try {
      await deleteGroupChat(chatId);
      setSelectedGroupId(null);
      toast({ title: "Group Deleted", description: "The group chat was deleted." });
    } catch (e: any) {
      toast({ title: "Error deleting group", description: e.message });
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
          quickEmoji: chats.find(c => c.id === activeChatId)?.quickEmoji,
        }}
        isBlocked={blockedUsers.includes(selectedPerson.uid)}
        onBack={() => {
          if (isMobile && window.history.state?.chatOpen) {
            window.history.back();
          } else {
            setSelectedOtherUid(null);
          }
        }}
        onCall={(type) => callManager.startCall(
          { id: selectedPerson.uid, name: selectedPerson.name, avatar: selectedPerson.photoURL },
          type
        )}
      />
    );
  } else if (selectedGroupChat && isMobile) {
    return (
      <ChatView
        chat={{
          id: selectedGroupChat.id,
          name: selectedGroupChat.groupName || 'Group Chat',
          avatar: selectedGroupChat.groupAvatar || '',
          isGroup: true,
          participants: selectedGroupChat.participants.map(p => ({
            uid: p,
            name: directoryMap[p]?.name || 'Unknown',
            avatar: directoryMap[p]?.photoURL || '',
          })),
          adminId: selectedGroupChat.adminId,
          quickEmoji: selectedGroupChat.quickEmoji,
        }}
        isBlocked={false}
        onLeaveGroup={() => handleLeaveGroup(selectedGroupChat.id)}
        onDeleteGroup={() => handleDeleteGroup(selectedGroupChat.id)}
        onBack={() => {
          if (isMobile && window.history.state?.chatOpen) {
            window.history.back();
          } else {
            setSelectedGroupId(null);
          }
        }}
      />
    );
  }

  const renderSettingsContent = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
            {settingsView === 'main' ? (
              <>
                <div className="app-hero flex flex-col items-center rounded-[32px] p-6 text-center">
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
  );

  return (
    <div className="app-shell min-h-screen lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen w-full lg:h-screen">
        <aside className="hidden lg:flex lg:h-screen lg:w-[92px] shrink-0 lg:flex-col lg:items-center lg:justify-between lg:px-3 lg:py-5">
          <div className="flex w-full flex-col items-center gap-4">
            <div className="app-sidebar flex w-full flex-col items-center gap-4 rounded-[32px] px-2 py-5">
              <button onClick={() => window.location.reload()} className="flex h-14 w-14 items-center justify-center shrink-0 hover:scale-105 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
                <Image src={AppLogo} alt="App Logo" className="h-full w-full object-contain drop-shadow-md" priority />
              </button>
              <div className="flex w-full flex-col gap-3 mt-2">
              {DESKTOP_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setSettingsView('main');
                  }}
                  className={cn(
                    "flex w-full items-center justify-center rounded-[20px] p-3.5 transition-all",
                    activeTab === id
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "app-surface-muted app-card-hover text-muted-foreground hover:text-foreground"
                  )}
                  title={label}
                  aria-label={label}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                </button>
              ))}
              </div>
            </div>
          </div>
          <div className="app-sidebar flex w-full flex-col items-center gap-3 rounded-[28px] px-2 py-4">
            <Popover>
              <PopoverTrigger asChild>
                <button className="outline-none rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-primary hover:opacity-80 transition-opacity">
                  <Avatar className="h-12 w-12 ring-2 ring-background/80 shadow-md shrink-0">
                    <AvatarImage src={profile?.photoURL} />
                    <AvatarFallback>{profile?.name?.[0]}</AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="end" sideOffset={20} className="w-[420px] max-h-[85vh] overflow-y-auto p-4 rounded-[34px] border border-border/70 bg-background/66 shadow-[0_24px_60px_rgba(0,0,0,0.25)] backdrop-blur-2xl z-50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="mb-4 flex items-center justify-between px-2">
                  <div>
                    <h3 className="text-xl font-bold font-headline">Settings</h3>
                    <p className="text-xs text-muted-foreground">Manage your account and preferences.</p>
                  </div>
                  {settingsView !== 'main' && (
                    <Button variant="ghost" size="icon" onClick={() => setSettingsView('main')} className="rounded-full">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  )}
                </div>
                {renderSettingsContent()}
              </PopoverContent>
            </Popover>
          </div>
        </aside>

        <div className="app-grid-lines flex min-h-screen flex-1 flex-col overflow-hidden lg:h-screen lg:min-h-0 lg:flex-row lg:gap-4 lg:p-4 lg:pl-0">
          <section
            className={cn(
              "flex min-h-0 flex-1 flex-col lg:rounded-[34px] lg:border lg:border-border/70 lg:bg-background/66 lg:shadow-[0_24px_60px_rgba(0,0,0,0.25)] lg:backdrop-blur-2xl",
              activeTab === 'chats'
                ? "lg:w-[350px] lg:shrink-0 lg:flex-none xl:w-[400px]"
                : "lg:flex-1"
            )}
          >
            <header className="app-toolbar sticky top-0 z-10 px-5 pb-4 pt-7 lg:rounded-t-[34px] lg:px-6 lg:pt-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-2">
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
                  {activeTab === 'chats' && isMobile && (
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
                      className={cn("app-surface-muted rounded-full", chatSearchOpen && "bg-primary/10 text-primary")}
                    >
                      {chatSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                    </Button>
                  )}
                </div>
              </div>
              {activeTab === 'chats' && shouldShowChatSearch && (
                <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      placeholder="Search conversations..."
                      className="app-input h-11 rounded-full border-none pl-10"
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
                            ? "bg-primary text-primary-foreground"
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
                <div className="space-y-6">
                  {/* Friend Requests - Small Notification */}
                  {pendingRequestPeople.length > 0 && !chatSearchQuery && (
                    <div className="app-surface-muted flex items-center justify-between rounded-[24px] p-3 pl-4 border border-primary/20 bg-primary/5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                          <Users className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-medium">
                          {pendingRequestPeople.length} new friend request{pendingRequestPeople.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs font-semibold" onClick={() => setActiveTab('discover')}>
                        Review
                      </Button>
                    </div>
                  )}

                  {/* Active Now - Horizontal Scroll */}
                  {onlineFriends.length > 0 && !chatSearchQuery && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-semibold text-muted-foreground">Active Now</h3>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                        {onlineFriends.map((person) => (
                          <button
                            key={person.uid}
                            onClick={() => openConversation(person.uid)}
                            className="group flex flex-col items-center gap-1.5 min-w-[72px]"
                          >
                            <div className="relative">
                              <Avatar className="h-16 w-16 ring-2 ring-transparent transition-all group-hover:ring-primary/40">
                                <AvatarImage src={person.photoURL} />
                                <AvatarFallback>{person.name[0]}</AvatarFallback>
                              </Avatar>
                              <div className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                            </div>
                            <span className="w-full truncate text-center text-xs font-medium text-foreground">{person.name.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chat List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1 mb-2">
                      <h3 className="text-sm font-semibold text-muted-foreground">Messages</h3>
                      {totalUnread > 0 && (
                        <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                          {totalUnread} new
                        </Badge>
                      )}
                    </div>

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
                        onClick={() => openConversation(chat.otherUid ?? null, chat.chatId, chat.isGroup)}
                        className={cn(
                          "app-card-hover w-full rounded-[24px] px-3 py-3 text-left transition-all",
                          selectedOtherUid === chat.otherUid
                            ? "bg-primary/10 shadow-sm border border-primary/20"
                            : "hover:bg-muted/50 border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-14 w-14">
                              <AvatarImage src={chat.avatar} />
                              <AvatarFallback>{chat.name[0]}</AvatarFallback>
                            </Avatar>
                            {chat.online && (
                              <div className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center justify-between gap-3">
                              <h3 className="truncate text-[15px] font-semibold">{chat.name}</h3>
                              <span className={cn("shrink-0 text-xs", chat.unread > 0 ? "font-semibold text-primary" : "font-medium text-muted-foreground")}>{chat.time}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <p className={cn("truncate text-sm", chat.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                                {chat.lastMessage ? (
                                  <>
                                    {chat.lastSenderId === user?.uid && <span className="font-medium">You: </span>}
                                    {chat.lastMessage}
                                  </>
                                ) : 'Say hello 👋'}
                              </p>
                              {chat.unread > 0 && (
                                <Badge className="h-5 min-w-5 rounded-full bg-primary p-0 px-1.5 text-[10px] text-primary-foreground">
                                  {chat.unread}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'chats' && (
                <div className="fixed bottom-20 right-6 z-40 lg:absolute lg:bottom-8 lg:right-8">
                  <Button
                    size="icon"
                    className="h-14 w-14 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.2)] bg-primary text-primary-foreground hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95"
                    onClick={() => setIsCreateGroupOpen(true)}
                  >
                    <Plus className="h-6 w-6" />
                  </Button>
                </div>
              )}

              {activeTab === 'discover' && (
                <div className="space-y-6">
                  {/* Clean Search Input */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search people by name..."
                      className="app-input h-14 rounded-full border-none pl-12 shadow-sm text-base"
                    />
                  </div>

                  {pendingRequestPeople.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-semibold text-muted-foreground">Incoming Requests</h3>
                        <Badge variant="secondary" className="rounded-full">{pendingRequestPeople.length}</Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {pendingRequestPeople.map((person) => (
                          <div key={person.uid} className="app-surface-muted flex flex-col gap-3 rounded-[24px] p-3 sm:flex-row sm:items-center sm:justify-between border border-primary/20 bg-primary/5">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar className="h-11 w-11">
                                <AvatarImage src={person.photoURL} />
                                <AvatarFallback>{person.name[0]}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{person.name}</p>
                                <p className="truncate text-xs text-muted-foreground">{person.status || 'Wants to connect'}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="rounded-full px-4" onClick={() => handleAcceptFriendRequest(person.uid)}>
                                Accept
                              </Button>
                              <Button size="sm" variant="ghost" className="rounded-full px-3" onClick={() => handleRejectFriendRequest(person.uid)}>
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {discoverOnlinePeople.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-semibold text-muted-foreground">Online Now</h3>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                        {discoverOnlinePeople.map((person) => {
                          const isFriend = myFriends.includes(person.uid);
                          return (
                            <div key={person.uid} className="group flex flex-col items-center gap-2 min-w-[80px]">
                              <button onClick={() => isFriend ? openConversation(person.uid) : null} className="relative">
                                <Avatar className="h-16 w-16 ring-2 ring-transparent transition-all group-hover:ring-primary/40">
                                  <AvatarImage src={person.photoURL} />
                                  <AvatarFallback>{person.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                              </button>
                              <span className="w-full truncate text-center text-xs font-medium text-foreground">{person.name.split(' ')[0]}</span>
                              {!isFriend && (
                                <Button size="sm" variant="secondary" className="h-6 rounded-full px-3 text-[10px]" onClick={() => handleSendFriendRequest(person.uid)}>
                                  Add
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-semibold text-muted-foreground">People Directory</h3>
                      <Badge variant="secondary" className="rounded-full text-xs">
                        {discoverSuggestions.length} suggestions
                      </Badge>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      {filteredDirectory.length === 0 && (
                        <div className="app-surface-muted rounded-[30px] border-dashed p-8 text-center text-sm text-muted-foreground">
                          No one else has signed up yet. Invite a friend and build your network.
                        </div>
                      )}
                      {filteredDirectory.map((person) => {
                        const isFriend = myFriends.includes(person.uid);
                        const hasOutgoing = outgoingRequests.includes(person.uid);
                        const hasIncoming = incomingRequests.includes(person.uid);
                        return (
                          <div key={person.uid} className="app-card-hover flex items-center justify-between gap-4 rounded-[24px] p-3 hover:bg-muted/50 transition-colors">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={person.photoURL} />
                                  <AvatarFallback>{person.name[0]}</AvatarFallback>
                                </Avatar>
                                {person.online && (
                                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="truncate text-[15px] font-semibold">{person.name}</h4>
                                <p className="truncate text-sm text-muted-foreground">
                                  {person.status || (person.online ? 'Online' : 'Offline')}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                               {isFriend ? (
                                <Button variant="secondary" size="sm" className="rounded-full" onClick={() => openConversation(person.uid)}>
                                  Message
                                </Button>
                              ) : hasIncoming ? (
                                <div className="flex gap-1">
                                  <Button size="sm" className="rounded-full" onClick={() => handleAcceptFriendRequest(person.uid)}>Accept</Button>
                                  <Button variant="ghost" size="sm" className="rounded-full" onClick={() => handleRejectFriendRequest(person.uid)}>Reject</Button>
                                </div>
                              ) : hasOutgoing ? (
                                <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => handleCancelFriendRequest(person.uid)}>
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
                      <div key={call.id} className="app-surface app-card-hover flex items-center gap-4 rounded-[30px] p-4">
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
                <div className="lg:hidden">
                  {renderSettingsContent()}
                </div>
              )}
            </main>
          </section>

          {!isMobile && activeTab === 'chats' && (
            <section className="app-grid-lines hidden min-h-0 flex-1 lg:ml-4 lg:flex lg:rounded-[34px] lg:border lg:border-border/70 lg:bg-background/52 lg:shadow-[0_24px_60px_rgba(0,0,0,0.22)] lg:backdrop-blur-2xl">
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
                    quickEmoji: chats.find(c => c.id === activeChatId)?.quickEmoji,
                  }}
                  isBlocked={blockedUsers.includes(selectedPerson.uid)}
                  onBack={() => setSelectedOtherUid(null)}
                  onCall={(type) => callManager.startCall(
                    { id: selectedPerson.uid, name: selectedPerson.name, avatar: selectedPerson.photoURL },
                    type
                  )}
                />
              ) : selectedGroupChat ? (
                <ChatView
                  embedded
                  chat={{
                    id: selectedGroupChat.id,
                    name: selectedGroupChat.groupName || 'Group Chat',
                    avatar: selectedGroupChat.groupAvatar || '',
                    isGroup: true,
                    participants: selectedGroupChat.participants.map(p => ({
                      uid: p,
                      name: directoryMap[p]?.name || 'Unknown',
                      avatar: directoryMap[p]?.photoURL || '',
                    })),
                    adminId: selectedGroupChat.adminId,
                    quickEmoji: selectedGroupChat.quickEmoji,
                  }}
                  isBlocked={false}
                  onLeaveGroup={() => handleLeaveGroup(selectedGroupChat.id)}
                  onDeleteGroup={() => handleDeleteGroup(selectedGroupChat.id)}
                  onBack={() => setSelectedGroupId(null)}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-10">
                  <div className="app-hero max-w-lg rounded-[40px] p-10 text-center">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-primary/12 text-primary">
                      <MessageSquare className="h-9 w-9" />
                    </div>
                    <h2 className="text-gradient-brand text-2xl font-bold font-headline">Pick a conversation</h2>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Select a chat from the left to open a distraction-free conversation space with messages, media, reactions, typing, and calls.
                    </p>
                    <div className="mt-6 grid grid-cols-3 gap-3 text-left">
                      <div className="app-surface rounded-[24px] p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Focused</p>
                        <p className="mt-1 text-sm font-semibold">Clean desktop layout</p>
                      </div>
                      <div className="app-surface rounded-[24px] p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Comfortable</p>
                        <p className="mt-1 text-sm font-semibold">Balanced dark mode</p>
                      </div>
                      <div className="app-surface rounded-[24px] p-3">
                        <p className="text-[11px] font-medium text-muted-foreground">Ready</p>
                        <p className="mt-1 text-sm font-semibold">Calls and messaging</p>
                      </div>
                    </div>
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
      <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Group Chat</DialogTitle>
            <DialogDescription>
              Select friends and enter a name for your new group.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="E.g., Weekend Plans"
                value={createGroupName}
                onChange={(e) => setCreateGroupName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Select Friends</Label>
              <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
                {onlineFriends.length === 0 && myFriends.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2 text-center">No friends available to add.</p>
                ) : (
                  myFriends.map((friendUid) => {
                    const person = directoryMap[friendUid];
                    if (!person) return null;
                    const isSelected = createGroupSelectedFriends.includes(friendUid);
                    return (
                      <div
                        key={friendUid}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors",
                          isSelected && "bg-primary/10"
                        )}
                        onClick={() => {
                          setCreateGroupSelectedFriends((prev) =>
                            isSelected ? prev.filter((id) => id !== friendUid) : [...prev, friendUid]
                          );
                        }}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={person.photoURL} />
                          <AvatarFallback>{person.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium flex-1">{person.name}</span>
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center",
                          isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input"
                        )}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateGroupOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={!createGroupName.trim() || createGroupSelectedFriends.length === 0}>
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
