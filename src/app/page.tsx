
"use client"

import { useState } from "react";
import { BottomNav, TabType } from "@/components/messaging/BottomNav";
import { CHATS, CALLS, DISCOVER } from "./lib/mock-data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, Check, X, Phone, Video, MessageSquare, Shield, Bell, Lock, Palette, TextQuote, Smartphone, Eye, Sparkles, UserCheck, ChevronLeft, LogOut, Plus } from "lucide-react";
import { ChatView } from "@/components/messaging/ChatView";
import { CallOverlay } from "@/components/messaging/CallOverlay";
import { AIChatView } from "@/components/messaging/AIChatView";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type SettingsView = 'main' | 'security' | 'theme' | 'language' | 'privacy';

export default function MessengerApp() {
  const [activeTab, setActiveTab] = useState<TabType>('chats');
  const [selectedChat, setSelectedChat] = useState<typeof CHATS[0] | null>(null);
  const [callState, setCallState] = useState<{ active: boolean; type: 'voice' | 'video'; contact: any; incoming: boolean } | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  
  // Settings sub-navigation
  const [settingsView, setSettingsView] = useState<SettingsView>('main');
  const [isProfileEditing, setIsProfileEditing] = useState(false);

  // Interactive state for Discover tab
  const [friendRequests, setFriendRequests] = useState(DISCOVER.requests);
  const [suggestions, setSuggestions] = useState(DISCOVER.suggestions);
  const [followedIds, setFollowedIds] = useState<string[]>([]);

  const handleAcceptRequest = (id: string) => {
    setFriendRequests(prev => prev.filter(req => req.id !== id));
  };

  const handleDeclineRequest = (id: string) => {
    setFriendRequests(prev => prev.filter(req => req.id !== id));
  };

  const handleFollowSuggestion = (id: string) => {
    if (followedIds.includes(id)) {
      setFollowedIds(prev => prev.filter(fid => fid !== id));
    } else {
      setFollowedIds(prev => [...prev, id]);
    }
  };

  const totalUnread = CHATS.reduce((acc, chat) => acc + chat.unread, 0);

  if (showAIChat) {
    return <AIChatView onBack={() => setShowAIChat(false)} />;
  }

  if (selectedChat) {
    return (
      <ChatView 
        chat={selectedChat} 
        onBack={() => setSelectedChat(null)} 
        onCall={(type) => setCallState({ active: true, type, contact: selectedChat, incoming: false })}
        onAIChat={() => setShowAIChat(true)}
      />
    );
  }

  if (callState?.active) {
    return (
      <CallOverlay 
        name={callState.contact.name} 
        avatar={callState.contact.avatar} 
        type={callState.type} 
        incoming={callState.incoming}
        onEnd={() => setCallState(null)}
        onAccept={() => setCallState({ ...callState, incoming: false })}
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
              {activeTab === 'settings' && settingsView !== 'main' ? settingsView.replace(/^\w/, c => c.toUpperCase()) : activeTab}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full bg-muted/50">
              <Search className="h-5 w-5" />
            </Button>
            {activeTab === 'chats' && (
              <Button variant="ghost" size="icon" onClick={() => setShowAIChat(true)} className="rounded-full bg-accent/10 text-accent">
                <Sparkles className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <main className="flex-1 px-5 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'chats' && (
          <div className="space-y-1">
            {CHATS.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
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
                    <p className="text-sm text-muted-foreground truncate max-w-[180px]">{chat.lastMessage}</p>
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
               <Input placeholder="Find people..." className="pl-10 rounded-full bg-muted/50 border-none h-11" />
            </div>

            {friendRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-primary mb-4 uppercase tracking-wider">Friend Requests</h3>
                {friendRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-4 mb-4 bg-muted/20 p-3 rounded-xl transition-all">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={req.avatar} />
                      <AvatarFallback>{req.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm">{req.name}</h4>
                      <p className="text-[11px] text-muted-foreground">{req.mutualFriends} mutual friends</p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleAcceptRequest(req.id)} size="icon" className="h-9 w-9 rounded-full bg-accent">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => handleDeclineRequest(req.id)} size="icon" variant="ghost" className="h-9 w-9 rounded-full bg-muted">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-primary mb-4 uppercase tracking-wider">Suggested for you</h3>
              <div className="grid grid-cols-1 gap-4">
                {suggestions.map((person) => (
                  <div key={person.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={person.avatar} />
                          <AvatarFallback>{person.name[0]}</AvatarFallback>
                        </Avatar>
                        {person.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">{person.name}</h4>
                        <p className="text-xs text-muted-foreground">{person.role}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleFollowSuggestion(person.id)}
                      className={cn("rounded-full transition-colors", followedIds.includes(person.id) ? "text-green-600 bg-green-50" : "text-accent hover:bg-accent/10")}
                    >
                      {followedIds.includes(person.id) ? <UserCheck className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calls' && (
          <div className="space-y-1">
            {CALLS.map((call) => (
              <div key={call.id} className="flex items-center gap-4 py-3 group">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={call.avatar} />
                  <AvatarFallback>{call.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h4 className={cn("font-semibold text-sm", call.status === 'missed' && "text-destructive")}>
                    {call.name}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {call.type === 'voice' ? <Phone className="h-3 w-3 text-muted-foreground" /> : <Video className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-[11px] text-muted-foreground">{call.time}</span>
                    <span className="text-[11px] text-muted-foreground opacity-50">•</span>
                    <span className={cn("text-[11px] font-medium", call.status === 'completed' ? "text-accent" : "text-destructive")}>
                      {call.status === 'completed' ? call.duration : 'Missed'}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/5">
                  {call.type === 'voice' ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </Button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {settingsView === 'main' ? (
              <>
                <div className="bg-primary/5 p-6 rounded-3xl flex flex-col items-center text-center">
                  <Avatar className="h-24 w-24 mb-4 ring-4 ring-background shadow-xl">
                    <AvatarImage src="https://picsum.photos/seed/user/200/200" />
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                  <h3 className="text-xl font-bold font-headline">John Doe</h3>
                  <p className="text-sm text-muted-foreground">Product Designer</p>
                  <Button variant="outline" onClick={() => setIsProfileEditing(true)} className="mt-4 rounded-full px-6 text-xs h-8">Edit Profile</Button>
                </div>

                <div className="space-y-4">
                   <section>
                     <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 ml-2">Notifications</h4>
                     <div className="bg-card rounded-2xl border overflow-hidden">
                       <div className="flex items-center justify-between p-4 border-b last:border-0">
                         <div className="flex items-center gap-3">
                           <div className="bg-blue-100 p-2 rounded-lg"><MessageSquare className="h-4 w-4 text-blue-600" /></div>
                           <span className="text-sm font-medium">Messages</span>
                         </div>
                         <Switch defaultChecked />
                       </div>
                       <div className="flex items-center justify-between p-4 border-b last:border-0">
                         <div className="flex items-center gap-3">
                           <div className="bg-green-100 p-2 rounded-lg"><Phone className="h-4 w-4 text-green-600" /></div>
                           <span className="text-sm font-medium">Calls</span>
                         </div>
                         <Switch defaultChecked />
                       </div>
                       <div className="flex items-center justify-between p-4">
                         <div className="flex items-center gap-3">
                           <div className="bg-purple-100 p-2 rounded-lg"><UserPlus className="h-4 w-4 text-purple-600" /></div>
                           <span className="text-sm font-medium">Friend Requests</span>
                         </div>
                         <Switch />
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
                       <div className="flex items-center justify-between p-4 border-b last:border-0">
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
                         { id: 'security' as const, icon: Shield, label: 'Account Security', color: 'slate' },
                         { id: 'theme' as const, icon: Palette, label: 'Theme & Appearance', color: 'pink' },
                         { id: 'language' as const, icon: TextQuote, label: 'Language', color: 'indigo' },
                         { id: 'privacy' as const, icon: Lock, label: 'Privacy Policy', color: 'slate' }
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
                           <Badge variant="ghost" className="text-[10px] opacity-50">View</Badge>
                         </button>
                       ))}
                     </div>
                   </section>
                   
                   <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 rounded-2xl h-12">
                     <LogOut className="h-4 w-4 mr-2" />
                     Log Out
                   </Button>
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
                        {i === 0 && <Check className="h-4 w-4 text-accent" />}
                      </button>
                    ))}
                  </div>
                )}

                {settingsView === 'privacy' && (
                  <div className="space-y-4">
                    <div className="prose prose-sm text-muted-foreground bg-card p-4 rounded-2xl border">
                      <p>At My Messenger, we value your privacy. All your messages are end-to-end encrypted, meaning only you and the person you are communicating with can read them.</p>
                      <p className="mt-2">We do not sell your data to third parties. Your personal information is used only to improve your experience within the app.</p>
                    </div>
                    <Button variant="outline" className="w-full rounded-xl">Download My Data</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} unreadCount={totalUnread} />

      {/* Edit Profile Dialog */}
      <Dialog open={isProfileEditing} onOpenChange={setIsProfileEditing}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your personal information here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-center">
               <div className="relative">
                 <Avatar className="h-20 w-20">
                   <AvatarImage src="https://picsum.photos/seed/user/200/200" />
                   <AvatarFallback>JD</AvatarFallback>
                 </Avatar>
                 <Button size="icon" className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-accent">
                   <Plus className="h-3 w-3" />
                 </Button>
               </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Display Name</label>
              <Input defaultValue="John Doe" className="rounded-xl bg-muted/50 border-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider ml-1">Status</label>
              <Input defaultValue="Product Designer" className="rounded-xl bg-muted/50 border-none" />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="ghost" onClick={() => setIsProfileEditing(false)} className="flex-1 rounded-xl">Cancel</Button>
            <Button onClick={() => setIsProfileEditing(false)} className="flex-1 rounded-xl bg-accent hover:bg-accent/90">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
