"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from '@capacitor/app';
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
  Smartphone, Eye, ChevronLeft, ChevronDown, LogOut, Plus, PhoneMissed, PhoneIncoming, PhoneOutgoing, Loader2,
  Check, X, Download, KeyRound, MessageSquare, Users, UserCog, Code, Globe, Trash2, VolumeX, UserMinus
} from "lucide-react";
import { ChatView } from "@/components/messaging/ChatView";
import { CallOverlay } from "@/components/messaging/CallOverlay";
import Image from "next/image";
import AppLogo from "./app logo.svg";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { AppLockScreen, sha256 } from "@/components/messaging/AppLockScreen";
import { PatternLock } from "@/components/messaging/PatternLock";
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
  deleteChatHistory,
  blockUser,
  unfriendUser,
  type ChatSummary,
  type DirectoryUser,
} from "@/lib/chat";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { subscribeCallHistory, clearCallHistory, type CallDoc } from "@/lib/webrtc";
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

type SettingsView = 'main' | 'security' | 'theme' | 'privacy' | 'accountMode' | 'developer';

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
  const { user, profile, loading, logout, deleteAccount, login, loginWithGoogle, finishDeleteAccount, sendPasswordReset, registerPushNotifications } = useAuth();
  const { settings, updateSettings } = useSettings();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [isLockDropdownOpen, setIsLockDropdownOpen] = useState(false);
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

  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [isPushRegistering, setIsPushRegistering] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        setShowNotificationBanner(true);
      }
    }
  }, []);
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
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [selectedUserDetails, setSelectedUserDetails] = useState<DirectoryUser | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [setupLockType, setSetupLockType] = useState<"pin" | "password" | "pattern" | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [isExportingData, setIsExportingData] = useState(false);
  const lastBackPressTimeRef = useRef(0);
  const [activeLongPressChat, setActiveLongPressChat] = useState<any>(null);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const callManager = useCallManager();

  // Hardware Back Button Handler for Mobile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listener = CapApp.addListener('backButton', (info) => {
      // 1. Dispatch custom event for child components (ChatView, Modals, etc.)
      const event = new Event('hardwareBackPress', { cancelable: true });
      window.dispatchEvent(event);
      if (event.defaultPrevented) {
        return; // Handled by a child component
      }

      // 2. Global modals in page.tsx
      if (isProfileEditing || reauthOpen || confirmDeleteChat || activeLongPressChat) {
        setIsProfileEditing(false);
        setReauthOpen(false);
        setConfirmDeleteChat(null);
        setActiveLongPressChat(null);
        return;
      }

      // 3. Sub-screens
      if (selectedOtherUid || selectedGroupId) {
        setSelectedOtherUid(null);
        setSelectedGroupId(null);
        return;
      }

      if (activeTab === 'settings' && settingsView !== 'main') {
        setSettingsView('main');
        return;
      }

      if (activeTab === 'chats' && chatSearchOpen) {
        setChatSearchOpen(false);
        setChatSearchQuery('');
        setChatFilter('all');
        return;
      }

      if (activeTab !== 'chats') {
        setActiveTab('chats');
        return;
      }

      // 4. Double tap to exit when on homepage
      if (Date.now() - lastBackPressTimeRef.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTimeRef.current = Date.now();
        toast({ description: "Press back again to exit" });
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [selectedOtherUid, selectedGroupId, activeTab, settingsView, chatSearchOpen, isProfileEditing, reauthOpen, confirmDeleteChat, activeLongPressChat, toast]);

  // App Lock: require the PIN once per app load if enabled.
  useEffect(() => {
    if (settings.appLockType !== "none" && settings.appLockHash) {
      setLocked(true);
    } else {
      setLocked(false);
    }
    // Only re-evaluate when the lock is (de)activated, not on every settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.appLockType, settings.appLockHash]);

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
      if (window.location.hash !== '#modal') {
        window.history.pushState(null, '', '#modal');
      }
    } else {
      if (window.location.hash === '#modal') {
        window.history.back();
      }
    }
  }, [isSubScreenActive]);

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.hash !== '#modal') {
        setSelectedOtherUid(null);
        setSelectedGroupId(null);
        setIsCreateGroupOpen(false);
        setChatSearchOpen(false);
        setSettingsView('main');
      }
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
          nickname: chat.nicknames?.[otherUid] || undefined,
        };
      })
      .filter((c) => c && c.lastMessage) as Array<{
        chatId: string; otherUid?: string; isGroup?: boolean; name: string; avatar: string;
        online: boolean; lastMessage: string; lastSenderId?: string; time: string; unread: number;
        participants?: string[]; quickEmoji?: string; nickname?: string;
      }>;
  }, [chats, user, directoryMap]);

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
        setSelectedGroupId(chatId);
        setSelectedOtherUid(null);
      } else if (otherUid) {
        setSelectedOtherUid(otherUid);
        setSelectedGroupId(null);
      }
    }
  );



  const filteredDirectory = directory.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Exclude users who are blocked by us or have blocked us
    if (blockedUsers.includes(d.uid) || (user?.uid && d.blockedUsers?.includes(user.uid))) {
      return false;
    }

    // Do not show people we are already friends with
    if (myFriends.includes(d.uid)) return false;

    // Privacy Logic: Do not show private accounts (since they are not friends)
    if (d.accountMode === 'private') return false;

    return true;
  });

  const pendingRequestPeople = useMemo(
    () => directory.filter((person) => incomingRequests.includes(person.uid)),
    [directory, incomingRequests]
  );

  const friendsList = useMemo(
    () => directory.filter((person) => myFriends.includes(person.uid)),
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
    () => filteredDirectory.filter((person) => {
      if (!person.online) return false;
      const isFriend = myFriends.includes(person.uid);
      if (person.accountMode === 'private' && !isFriend) return false;
      return true;
    }).slice(0, 8),
    [filteredDirectory, myFriends]
  );
  const discoverSuggestions = useMemo(
    () =>
      filteredDirectory.filter(
        (person) =>
          !myFriends.includes(person.uid) &&
          !chats.some(c => !c.isGroup && c.participants.includes(person.uid)) &&
          !incomingRequests.includes(person.uid) &&
          !outgoingRequests.includes(person.uid) &&
          person.accountMode !== 'private' // Suggestions should only be public people
      ),
    [filteredDirectory, incomingRequests, myFriends, outgoingRequests, chats]
  );

  const openConversation = async (otherUid: string | null, chatId?: string, isGroup?: boolean) => {
    if (!user) return;
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
        bio: editBio,
        location: editLocation,
        website: editWebsite,
        occupation: editOccupation,
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
    if (!profile) return;
    setIsExportingData(true);
    try {
      // Dynamically import jsPDF to avoid SSR issues
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();

      doc.setFontSize(22);
      doc.text("My Messenger - Data Export", 20, 20);

      doc.setFontSize(16);
      doc.text("Profile Information", 20, 35);

      doc.setFontSize(12);
      let y = 45;

      const addRow = (label: string, value: string) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, 20, y);
        doc.setFont("helvetica", "normal");
        // Handle long text wrapping
        const splitText = doc.splitTextToSize(value || "Not provided", 120);
        doc.text(splitText, 60, y);
        y += 8 * splitText.length;
      };

      addRow("Name", profile.name);
      addRow("Email", profile.email);
      addRow("Status", profile.status);
      addRow("Account Mode", profile.accountMode === 'private' ? 'Private' : 'Public');
      addRow("Bio", profile.bio || "");
      addRow("Location", profile.location || "");
      addRow("Website", profile.website || "");
      addRow("Occupation", profile.occupation || "");

      const dateString = new Date().toLocaleDateString();
      addRow("Export Date", dateString);

      doc.save(`my-messenger-data-${profile.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);

      toast({ title: "Download Complete", description: "Your data has been exported as a PDF." });
    } catch (error: any) {
      console.error(error);
      toast({ title: "Export Failed", description: "There was an error downloading your data." });
    } finally {
      setIsExportingData(false);
    }
  };

  const handleSetAppLock = async (hashStr: string) => {
    if (!setupLockType) return;
    if (setupLockType === "pin" && hashStr.length < 4) {
      toast({ title: "PIN too short", description: "Use at least 4 digits." });
      return;
    }
    if (setupLockType === "password" && hashStr.length < 4) {
      toast({ title: "Password too short", description: "Use at least 4 characters." });
      return;
    }
    const hash = await sha256(hashStr);
    updateSettings({ appLockType: setupLockType, appLockHash: hash });
    setSetupLockType(null);
    setPinValue('');
    toast({ title: `App Lock enabled` });
  };

  const handleDisableAppLock = () => {
    updateSettings({ appLockType: "none", appLockHash: null });
    toast({ title: "App Lock disabled" });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (locked && settings.appLockType !== "none" && settings.appLockHash) {
    return <AppLockScreen lockType={settings.appLockType} expectedHash={settings.appLockHash} onUnlock={() => setLocked(false)} />;
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
      <div className="fixed inset-0 flex flex-col h-[100dvh] w-full overflow-hidden">
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
            nickname: chats.find(c => c.id === activeChatId)?.nicknames?.[selectedPerson.uid],
            location: selectedPerson.location,
            website: selectedPerson.website,
            occupation: selectedPerson.occupation
          }}
          isBlocked={blockedUsers.includes(selectedPerson.uid)}
          amIBlocked={selectedPerson.blockedUsers?.includes(user?.uid as string)}
          isFriend={myFriends.includes(selectedPerson.uid)}
          hasHistory={!!chats.find(c => c.id === activeChatId)?.lastMessage}
          isRequestSent={outgoingRequests.includes(selectedPerson.uid)}
          isRequestReceived={incomingRequests.includes(selectedPerson.uid)}
          onCancelRequest={() => handleCancelFriendRequest(selectedPerson.uid)}
          onAcceptRequest={() => handleAcceptFriendRequest(selectedPerson.uid)}
          onBack={() => {
            if (isMobile && window.history.state?.chatOpen) {
              window.history.back();
            } else {
              setSelectedOtherUid(null);
            }
          }}
          onUnfriend={() => {
            if (isMobile && window.history.state?.chatOpen) {
              window.history.back();
            } else {
              setSelectedOtherUid(null);
            }
            setActiveTab('discover');
          }}
          onCall={(type) => callManager.startCall(
            { id: selectedPerson.uid, name: selectedPerson.name, avatar: selectedPerson.photoURL },
            type
          )}
          onAddFriend={() => handleSendFriendRequest(selectedPerson.uid)}
        />
      </div>
    );
  } else if (selectedGroupChat && isMobile) {
    return (
      <div className="fixed inset-0 flex flex-col h-[100dvh] w-full overflow-hidden">
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
      </div>
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
              onClick={() => {
                setEditName(profile?.name || '');
                setEditStatus(profile?.status || '');
                setEditBio(profile?.bio || '');
                setEditLocation(profile?.location || '');
                setEditWebsite(profile?.website || '');
                setEditOccupation(profile?.occupation || '');
                setIsProfileEditing(true);
              }}
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
                  { id: 'accountMode' as const, icon: UserCog, label: 'Account Mode' },
                  { id: 'security' as const, icon: Shield, label: 'Account Security' },
                  { id: 'theme' as const, icon: Palette, label: 'Theme & Appearance' },
                  { id: 'privacy' as const, icon: Lock, label: 'Privacy Policy' },
                  { id: 'developer' as const, icon: Code, label: 'Developer' },
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

            <div className="mt-8 pb-4 text-center">
              <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-widest">Version</p>
              <p className="text-sm font-semibold text-muted-foreground/70">My Messenger v1.0</p>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {settingsView === 'security' && (
            <div className="space-y-4">
              <div className={cn("app-surface p-4 rounded-[28px] space-y-4 transition-all", isLockDropdownOpen && "relative z-[60]")}>
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-semibold">App Lock System</h5>
                    <p className="text-xs text-muted-foreground">Select how to lock your app</p>
                  </div>
                </div>

                <div className="py-2 relative">
                  <button
                    onClick={() => setIsLockDropdownOpen(!isLockDropdownOpen)}
                    className="w-full rounded-xl bg-muted/50 hover:bg-muted/70 border border-transparent h-12 px-4 flex items-center justify-between focus:ring-2 focus:ring-accent/50 cursor-pointer font-medium transition-colors"
                  >
                    <span className="capitalize">{settings.appLockType === 'none' ? 'Disabled' : settings.appLockType}</span>
                    <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", isLockDropdownOpen && "rotate-180")} />
                  </button>

                  {isLockDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsLockDropdownOpen(false)}
                      />
                      <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-card/95 backdrop-blur-xl text-card-foreground rounded-2xl shadow-xl border border-accent/20 z-50 overflow-hidden py-2 animate-in fade-in zoom-in-95 duration-150">
                        {[
                          { value: 'none', label: 'Disabled' },
                          { value: 'pin', label: 'PIN' },
                          { value: 'password', label: 'Password' },
                          { value: 'pattern', label: 'Pattern' }
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setIsLockDropdownOpen(false);
                              if (option.value === 'none') {
                                handleDisableAppLock();
                              } else if (option.value !== settings.appLockType) {
                                setSetupLockType(option.value as "pin" | "password" | "pattern");
                                setPinValue('');
                              }
                            }}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-muted focus:bg-muted transition-colors flex items-center justify-between font-medium outline-none"
                          >
                            {option.label}
                            {settings.appLockType === option.value && <Check className="h-4 w-4 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {settings.appLockType !== 'none' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl w-full"
                    onClick={() => { setPinValue(''); setSetupLockType(settings.appLockType as "pin" | "password" | "pattern"); }}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-2" /> Change {settings.appLockType}
                  </Button>
                )}
              </div>

              <div className="app-surface p-4 rounded-[28px] space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold">Security Information</h5>
                    <p className="text-xs text-muted-foreground">Why app lock is important</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  App lock adds an extra layer of security to your messages. Even if someone unlocks your phone, they won't be able to access your private conversations without your specific app lock PIN, password, or pattern. We use advanced local encryption to keep your data safe.
                </p>
              </div>

              <div className="app-surface p-4 rounded-[28px] space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold">Account Recovery</h5>
                    <p className="text-xs text-muted-foreground">Manage your login credentials</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  If you ever forget your password, you can reset it securely via your registered email address. This ensures that you never lose access to your account permanently.
                </p>
                <Button variant="outline" className="w-full rounded-xl" onClick={handleChangePassword}>
                  Reset Password by Email
                </Button>
              </div>
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

              <div className="app-surface p-5 rounded-[28px] space-y-4">
                <span className="text-sm font-semibold block">Brand Color</span>
                <div className="flex items-center gap-4 flex-wrap">
                  {(['blue', 'green', 'purple', 'orange', 'rose'] as const).map((color) => (
                    <button
                      key={color}
                      onClick={() => updateSettings({ themeColor: color })}
                      className={cn(
                        "h-12 w-12 rounded-full flex items-center justify-center transition-all",
                        settings.themeColor === color ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105 opacity-80 hover:opacity-100",
                        color === 'blue' && "bg-blue-600",
                        color === 'green' && "bg-green-600",
                        color === 'purple' && "bg-purple-600",
                        color === 'orange' && "bg-orange-600",
                        color === 'rose' && "bg-rose-600"
                      )}
                    >
                      {settings.themeColor === color && <Check className="h-6 w-6 text-white drop-shadow-md" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="app-surface p-5 rounded-[28px] space-y-6">
                <div>
                  <span className="text-sm font-semibold mb-3 block">Text Size</span>
                  <div className="flex bg-primary/5 p-1 rounded-full items-center justify-between border border-primary/20">
                    {(['small', 'medium', 'large'] as const).map(size => (
                      <button
                        key={size}
                        onClick={() => updateSettings({ fontSize: size })}
                        className={cn(
                          "flex-1 text-xs font-semibold py-2.5 rounded-full capitalize transition-colors",
                          settings.fontSize === size ? "bg-primary text-white shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-primary/10"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <span className="text-sm font-semibold">Font Style</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['system', 'inter', 'roboto', 'serif', 'mono'] as const).map(font => (
                      <button
                        key={font}
                        onClick={() => updateSettings({ fontFamily: font })}
                        className={cn(
                          "text-xs font-medium py-3 px-3 rounded-xl border text-left capitalize transition-colors",
                          settings.fontFamily === font ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary/50 text-muted-foreground"
                        )}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <span className="text-sm font-semibold mb-4 block text-muted-foreground">Chat Preview</span>
                  <div className="bg-secondary/30 p-4 rounded-[24px] space-y-4 border border-border/50 relative overflow-hidden">
                    {/* Left message */}
                    <div className="flex gap-2">
                      <div className="bg-primary text-white p-3.5 rounded-2xl rounded-tl-sm text-[length:inherit] max-w-[85%] shadow-sm">
                        Hey! How does this text look?
                      </div>
                    </div>
                    {/* Right message */}
                    <div className="flex gap-2 justify-end">
                      <div className="app-surface border border-border/40 p-3.5 rounded-2xl rounded-tr-sm text-[length:inherit] max-w-[85%] shadow-sm">
                        Looks perfect to me! The new font is super clear. 🚀
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {settingsView === 'developer' && (
            <div className="space-y-6">
              <div className="app-surface p-6 rounded-[32px] text-center space-y-4">
                <div className="w-24 h-24 mx-auto rounded-[32px] overflow-hidden shadow-lg border border-accent/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://0.gravatar.com/avatar/f93ab0553fdd50e05eca8505fc4ed8e78d6e4956d495dc45b169837cd2ed7987?s=256"
                    alt="Saykot"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-headline">Saykot</h3>
                  <p className="text-sm font-medium text-accent">Full-Stack Developer</p>
                </div>
                <div className="text-sm text-muted-foreground space-y-2 pb-2">
                  <p>
                    Hi! I'm Saykot, a passionate Full-Stack Developer based in Barisal, Bangladesh.
                  </p>
                  <p>
                    I specialize in building modern, interactive, and scalable web applications using React, Next.js, Node.js, and other cutting-edge technologies. I love solving complex problems and creating seamless user experiences.
                  </p>
                </div>
                <Button asChild className="w-full rounded-xl bg-gradient-to-r from-accent to-primary hover:opacity-90">
                  <a href="https://saykot.vercel.app/" target="_blank" rel="noopener noreferrer">
                    <Globe className="h-4 w-4 mr-2" /> View Portfolio
                  </a>
                </Button>
              </div>
            </div>
          )}

          {settingsView === 'accountMode' && (
            <div className="space-y-4">
              <div className="app-surface p-4 rounded-[28px] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base font-semibold">Account Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      {settings.accountMode === 'private'
                        ? 'Private: Only friends can see your profile.'
                        : 'Public: Everyone can see your profile.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-medium px-2 py-1 rounded-full",
                      (settings?.accountMode || 'public') === 'private' ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                      {(settings?.accountMode || 'public').toUpperCase()}
                    </span>
                    <Switch
                      checked={(settings?.accountMode || 'public') === 'private'}
                      onCheckedChange={(checked) => updateSettings({ accountMode: checked ? 'private' : 'public' })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {settingsView === 'privacy' && (
            <div className="space-y-4">
              <div className="app-surface prose prose-sm text-muted-foreground p-5 rounded-[28px] border border-border/40">
                <h3 className="text-foreground font-semibold text-base mb-3">Privacy & Data Policy</h3>
                <p className="mb-2">
                  At <strong>My Messenger</strong>, your privacy is our highest priority. We are committed to protecting your personal information and ensuring a secure communication experience.
                </p>
                <ul className="list-disc pl-5 mb-3 space-y-1">
                  <li><strong>End-to-End Security:</strong> Your messages and calls are processed securely. We employ industry-standard encryption to protect your data in transit and at rest.</li>
                  <li><strong>Data Ownership:</strong> You retain full control over your personal data. Your profile information, contacts, and chat history are securely stored in your Firebase instance.</li>
                  <li><strong>No Third-Party Tracking:</strong> We do not sell, rent, or share your personal data with third-party advertisers or data brokers under any circumstances.</li>
                </ul>
                <p>
                  By using My Messenger, you consent to our data practices as outlined above. You can download a copy of your profile data at any time using the button below.
                </p>
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
    <div className="app-shell fixed inset-0 flex flex-col h-[100dvh] w-full overflow-hidden lg:relative lg:h-screen lg:block">
      <div className="flex h-full w-full">
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
              <PopoverContent side="right" align="end" sideOffset={20} collisionPadding={16} className="w-[420px] h-[calc(100vh-32px)] overflow-y-auto p-4 rounded-[34px] border border-border/70 bg-background/66 shadow-[0_24px_60px_rgba(0,0,0,0.25)] backdrop-blur-2xl z-50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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

        <div className="app-grid-lines flex h-full flex-1 flex-col overflow-hidden lg:flex-row lg:gap-4 lg:p-4 lg:pl-0">
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

            <main className="flex-1 overflow-y-auto px-5 pb-24 pt-5 animate-in fade-in slide-in-from-bottom-2 duration-300 lg:px-6 lg:pb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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

                  {/* Notification Permission Banner */}
                  {showNotificationBanner && !chatSearchQuery && (
                    <div className="app-surface-muted flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-[24px] p-4 border border-blue-500/30 bg-blue-500/5 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-500">
                          <Bell className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">Enable Notifications</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Get alerts for messages & calls in the background.
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full sm:w-auto rounded-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                        disabled={isPushRegistering}
                        onClick={async () => {
                          setIsPushRegistering(true);
                          try {
                            const permission = await Notification.requestPermission();
                            if (permission === 'granted') {
                              setShowNotificationBanner(false);
                              await registerPushNotifications();
                              toast({ title: 'Notifications Enabled', description: 'You will now receive alerts in the background.' });
                            } else {
                              setShowNotificationBanner(false);
                            }
                          } catch (error) {
                            console.error(error);
                          } finally {
                            setIsPushRegistering(false);
                          }
                        }}
                      >
                        {isPushRegistering ? 'Enabling...' : 'Enable'}
                      </Button>
                    </div>
                  )}


                  {/* Friends - Horizontal Scroll */}
                  {friendsList.length > 0 && !chatSearchQuery && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-semibold text-muted-foreground">Friends</h3>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                        {friendsList.map((person) => (
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
                              {person.online && (
                                <div className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
                              )}
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
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setActiveLongPressChat(chat);
                        }}
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
                              <h3 className="truncate text-[15px] font-semibold">{chat.nickname || chat.name}</h3>
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
                              <button onClick={() => openConversation(person.uid)} className="relative">
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
                        {filteredDirectory.length} people
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
                            <button onClick={() => openConversation(person.uid)} className="flex min-w-0 items-center gap-3 text-left hover:opacity-80 transition-opacity">
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
                            </button>

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
                  {callHistory.length > 0 && (
                    <div className="flex justify-end px-2 mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive rounded-xl"
                        onClick={async () => {
                          if (user) {
                            try {
                              await clearCallHistory(user.uid);
                            } catch (e) {
                              console.error("Failed to clear call history", e);
                            }
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Clear History
                      </Button>
                    </div>
                  )}
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
                    nickname: chats.find(c => c.id === activeChatId)?.nicknames?.[selectedPerson.uid],
                    location: selectedPerson.location,
                    website: selectedPerson.website,
                    occupation: selectedPerson.occupation
                  }}
                  isBlocked={blockedUsers.includes(selectedPerson.uid)}
                  amIBlocked={selectedPerson.blockedUsers?.includes(user?.uid as string)}
                  isFriend={myFriends.includes(selectedPerson.uid)}
                  hasHistory={!!chats.find(c => c.id === activeChatId)?.lastMessage}
                  isRequestSent={outgoingRequests.includes(selectedPerson.uid)}
                  isRequestReceived={incomingRequests.includes(selectedPerson.uid)}
                  onCancelRequest={() => handleCancelFriendRequest(selectedPerson.uid)}
                  onAcceptRequest={() => handleAcceptFriendRequest(selectedPerson.uid)}
                  onBack={() => setSelectedOtherUid(null)}
                  onAddFriend={() => handleSendFriendRequest(selectedPerson.uid)}
                  onUnfriend={() => {
                    setSelectedOtherUid(null);
                    setActiveTab('discover');
                  }}
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
      <Dialog open={setupLockType !== null} onOpenChange={(open) => !open && setSetupLockType(null)}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle>Set App Lock {setupLockType === "pin" ? "PIN" : setupLockType === "password" ? "Password" : "Pattern"}</DialogTitle>
            <DialogDescription>You'll need this to open My Messenger.</DialogDescription>
          </DialogHeader>
          <div className="py-2 flex justify-center">
            {setupLockType === "pattern" ? (
              <PatternLock onComplete={(pattern) => handleSetAppLock(pattern)} />
            ) : (
              <Input
                autoFocus
                type="password"
                inputMode={setupLockType === "pin" ? "numeric" : "text"}
                maxLength={setupLockType === "pin" ? 8 : 64}
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value)}
                placeholder={setupLockType === "pin" ? "Enter a 4-8 digit PIN" : "Enter a password"}
                className={cn(
                  "text-center rounded-xl h-12 bg-muted/50 border-none",
                  setupLockType === "pin" && "tracking-[0.5em]"
                )}
              />
            )}
          </div>
          {setupLockType !== "pattern" && (
            <DialogFooter className="flex-row gap-2">
              <Button variant="ghost" onClick={() => setSetupLockType(null)} className="flex-1 rounded-xl">Cancel</Button>
              <Button onClick={() => handleSetAppLock(pinValue)} className="flex-1 rounded-xl bg-accent hover:bg-accent/90">Save</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Chat Long Press Sheet */}
      <Sheet open={!!activeLongPressChat} onOpenChange={(open) => {
        if (!open) setActiveLongPressChat(null);
      }}>
        <SheetContent side="bottom" className="rounded-t-3xl p-4 bg-background border-none shadow-2xl z-[100] text-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Chat Options</SheetTitle>
          </SheetHeader>
          {activeLongPressChat && (
            <div className="flex flex-col gap-2 mt-2">
              <Button variant="secondary" className="justify-start gap-3 h-14 rounded-2xl text-base bg-muted/50 hover:bg-muted" onClick={() => {
                openConversation(activeLongPressChat.otherUid ?? null, activeLongPressChat.chatId, activeLongPressChat.isGroup);
                setActiveLongPressChat(null);
              }}>
                <MessageSquare className="h-5 w-5" /> Open Chat
              </Button>
              <Button variant="secondary" className="justify-start gap-3 h-14 rounded-2xl text-base bg-muted/50 hover:bg-muted" onClick={() => {
                toast({ title: "Chat muted" });
                setActiveLongPressChat(null);
              }}>
                <VolumeX className="h-5 w-5" /> Mute
              </Button>
              {!activeLongPressChat.isGroup && activeLongPressChat.otherUid && myFriends.includes(activeLongPressChat.otherUid) && (
                <Button variant="secondary" className="justify-start gap-3 h-14 rounded-2xl text-base bg-muted/50 hover:bg-muted text-destructive hover:text-destructive" onClick={async () => {
                  try {
                    await unfriendUser(user!.uid, activeLongPressChat.otherUid);
                    toast({ title: "User unfriended" });
                    setActiveLongPressChat(null);
                  } catch (e: any) {
                    toast({ title: "Failed to unfriend user", description: e.message, variant: "destructive" });
                  }
                }}>
                  <UserMinus className="h-5 w-5" /> Unfriend
                </Button>
              )}
              {!activeLongPressChat.isGroup && activeLongPressChat.otherUid && (
                <Button variant="secondary" className="justify-start gap-3 h-14 rounded-2xl text-base bg-muted/50 hover:bg-muted text-destructive hover:text-destructive" onClick={async () => {
                  try {
                    await blockUser(user!.uid, activeLongPressChat.otherUid);
                    toast({ title: "User blocked" });
                    setActiveLongPressChat(null);
                  } catch (e: any) {
                    toast({ title: "Failed to block user", description: e.message, variant: "destructive" });
                  }
                }}>
                  <Shield className="h-5 w-5" /> Block
                </Button>
              )}
              <Button variant="secondary" className="justify-start gap-3 h-14 rounded-2xl text-base text-destructive hover:text-destructive bg-destructive/10 hover:bg-destructive/20" onClick={() => {
                setConfirmDeleteChat(activeLongPressChat);
                setActiveLongPressChat(null);
              }}>
                <Trash2 className="h-5 w-5" /> Delete
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm Delete Chat Dialog */}
      <Dialog open={!!confirmDeleteChat} onOpenChange={(open) => {
        if (!open) setConfirmDeleteChat(null);
      }}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete Chat?</DialogTitle>
            <DialogDescription>
              This will permanently remove the chat history for you. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 mt-4">
            <Button variant="ghost" onClick={() => setConfirmDeleteChat(null)} className="flex-1 rounded-xl">Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (confirmDeleteChat) {
                try {
                  if (confirmDeleteChat.isGroup) {
                    await deleteGroupChat(confirmDeleteChat.chatId);
                  } else {
                    await deleteChatHistory(confirmDeleteChat.chatId);
                  }
                  toast({ title: "Chat deleted" });
                  if (activeChatId === confirmDeleteChat.chatId) {
                    setSelectedOtherUid(null);
                    setSelectedGroupId(null);
                  }
                } catch (e: any) {
                  toast({ title: "Failed to delete chat", description: e.message, variant: "destructive" });
                }
                setConfirmDeleteChat(null);
              }
            }} className="flex-1 rounded-xl">Delete</Button>
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
                className="relative rounded-full aspect-square border border-muted/60 p-1 hover:ring-2 hover:ring-accent transition-all flex items-center justify-center"
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
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Bio</label>
              <Input value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="A little about yourself..." className="rounded-xl bg-muted/50 border-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Location</label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="City, Country" className="rounded-xl bg-muted/50 border-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Occupation</label>
                <Input value={editOccupation} onChange={(e) => setEditOccupation(e.target.value)} placeholder="What do you do?" className="rounded-xl bg-muted/50 border-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Website</label>
              <Input value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} placeholder="https://" className="rounded-xl bg-muted/50 border-none" />
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
                  await deleteAccount();
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
                  await deleteAccount();
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
                {myFriends.length === 0 ? (
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
            <Button onClick={handleCreateGroup} disabled={!createGroupName.trim() || createGroupSelectedFriends.length < 2}>
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUserDetails} onOpenChange={(open) => !open && setSelectedUserDetails(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden bg-background/95 backdrop-blur-3xl border border-border/50">
          <div className="relative">
            {/* Header Background */}
            <div className="h-32 bg-gradient-to-br from-primary/20 via-accent/10 to-background/5" />

            <div className="px-6 pb-6 -mt-12 relative">
              <Avatar className="h-24 w-24 ring-4 ring-background shadow-xl bg-muted mb-4">
                <AvatarImage src={selectedUserDetails?.photoURL} />
                <AvatarFallback className="text-xl">{selectedUserDetails?.name[0]}</AvatarFallback>
              </Avatar>

              <div className="space-y-4 mb-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold font-headline">{selectedUserDetails?.name}</h2>
                  {selectedUserDetails?.status && (
                    <p className="text-sm text-muted-foreground">{selectedUserDetails.status}</p>
                  )}
                </div>

                {user && selectedUserDetails && user.uid !== selectedUserDetails.uid && (
                  <div className="flex items-center gap-3">
                    {myFriends.includes(selectedUserDetails.uid) ? (
                      <Button variant="outline" className="rounded-full flex-1" onClick={() => openConversation(selectedUserDetails.uid)}>
                        <MessageSquare className="h-4 w-4 mr-2" /> Message
                      </Button>
                    ) : outgoingRequests.includes(selectedUserDetails.uid) ? (
                      <Button variant="secondary" className="rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 flex-1" onClick={async () => {
                        try {
                          await cancelFriendRequest(user.uid, selectedUserDetails.uid);
                          toast({ title: "Request Cancelled" });
                        } catch (e) {
                          toast({ title: "Failed to cancel request" });
                        }
                      }}>
                        Cancel Request
                      </Button>
                    ) : incomingRequests.includes(selectedUserDetails.uid) ? (
                      <Button variant="default" className="rounded-full flex-1" onClick={async () => {
                        try {
                          await acceptFriendRequest(user.uid, selectedUserDetails.uid);
                          toast({ title: "Request Accepted" });
                        } catch (e) {
                          toast({ title: "Failed to accept request" });
                        }
                      }}>
                        Accept Request
                      </Button>
                    ) : (
                      <Button variant="default" className="rounded-full bg-[#0084ff] hover:bg-[#0084ff]/90 text-white flex-1" onClick={async () => {
                        try {
                          await sendFriendRequest(user.uid, selectedUserDetails.uid);
                          toast({ title: "Request Sent" });
                        } catch (e) {
                          toast({ title: "Failed to send request" });
                        }
                      }}>
                        <Plus className="h-4 w-4 mr-2" /> Add Friend
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {(() => {
                const hasDetails = selectedUserDetails?.bio || selectedUserDetails?.location || selectedUserDetails?.occupation || selectedUserDetails?.website;
                if (!hasDetails) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border/50">
                      <p className="text-sm font-medium">No additional details provided</p>
                    </div>
                  );
                }
                return (
                  <div className="grid gap-4 text-sm bg-muted/20 p-5 rounded-2xl border border-border/50">
                    {selectedUserDetails?.bio && (
                      <div>
                        <h4 className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-1">About</h4>
                        <p className="text-foreground/90">{selectedUserDetails.bio}</p>
                      </div>
                    )}

                    {(selectedUserDetails?.location || selectedUserDetails?.occupation) && (
                      <div className="grid grid-cols-2 gap-4">
                        {selectedUserDetails?.location && (
                          <div>
                            <h4 className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Location</h4>
                            <p className="text-foreground/90">{selectedUserDetails.location}</p>
                          </div>
                        )}
                        {selectedUserDetails?.occupation && (
                          <div>
                            <h4 className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Occupation</h4>
                            <p className="text-foreground/90">{selectedUserDetails.occupation}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedUserDetails?.website && (
                      <div>
                        <h4 className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Website</h4>
                        <a href={selectedUserDetails.website.startsWith('http') ? selectedUserDetails.website : `https://${selectedUserDetails.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {selectedUserDetails.website}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
