export const CHATS = [
  {
    id: '1',
    name: 'Sarah Wilson',
    avatar: 'https://picsum.photos/seed/sarah/200/200',
    lastMessage: 'The proposal looks great!',
    time: '10:45 AM',
    unread: 2,
    online: true,
    status: 'read' as const,
  },
  {
    id: '2',
    name: 'David Chen',
    avatar: 'https://picsum.photos/seed/david/200/200',
    lastMessage: 'Can we reschedule the call?',
    time: '9:30 AM',
    unread: 0,
    online: false,
    status: 'delivered' as const,
  },
  {
    id: '3',
    name: 'Design Team',
    avatar: 'https://picsum.photos/seed/team/200/200',
    lastMessage: 'James: Check out the new icons',
    time: 'Yesterday',
    unread: 5,
    online: true,
    status: 'sent' as const,
  },
];

export const CALLS = [
  {
    id: '1',
    name: 'Sarah Wilson',
    avatar: 'https://picsum.photos/seed/sarah/200/200',
    type: 'video' as const,
    direction: 'incoming' as const,
    status: 'missed' as const,
    time: 'Today, 2:40 PM',
    duration: '0:00',
  },
  {
    id: '2',
    name: 'David Chen',
    avatar: 'https://picsum.photos/seed/david/200/200',
    type: 'voice' as const,
    direction: 'outgoing' as const,
    status: 'completed' as const,
    time: 'Today, 11:15 AM',
    duration: '12:45',
  },
  {
    id: '3',
    name: 'Alex Rivera',
    avatar: 'https://picsum.photos/seed/alex/200/200',
    type: 'voice' as const,
    direction: 'incoming' as const,
    status: 'completed' as const,
    time: 'Yesterday, 5:20 PM',
    duration: '5:30',
  },
];

export const DISCOVER = {
  requests: [
    {
      id: 'req1',
      name: 'Emma Thompson',
      avatar: 'https://picsum.photos/seed/emma/200/200',
      mutualFriends: 12,
    },
  ],
  suggestions: [
    {
      id: 's1',
      name: 'Michael Scott',
      avatar: 'https://picsum.photos/seed/michael/200/200',
      online: true,
      role: 'Regional Manager',
    },
    {
      id: 's2',
      name: 'Pam Beesly',
      avatar: 'https://picsum.photos/seed/pam/200/200',
      online: false,
      role: 'Receptionist',
    },
    {
      id: 's3',
      name: 'Dwight Schrute',
      avatar: 'https://picsum.photos/seed/dwight/200/200',
      online: true,
      role: 'Assistant (to the) Regional Manager',
    },
  ],
};