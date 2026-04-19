import { BarChart3, BookOpen, Flag, Home, Layers3, Settings2, ShieldQuestion, Trophy, Users } from 'lucide-react';

export const FEATURE_FLAGS = {
  usersEnabled: false,
  attemptsEnabled: false,
};

export const navigationSections = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: Home }],
  },
  {
    label: 'Content',
    items: [
      { label: 'Categories', path: '/content/categories', icon: BookOpen },
      { label: 'Quizzes', path: '/content/quizzes', icon: Layers3 },
      { label: 'Questions', path: '/content/questions', icon: ShieldQuestion },
    ],
  },
  {
    label: 'Gamification',
    items: [
      { label: 'Levels', path: '/gamification/levels', icon: Flag },
      { label: 'Leaderboards', path: '/gamification/leaderboards', icon: Trophy },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Users',
        path: '/users',
        icon: Users,
        disabled: !FEATURE_FLAGS.usersEnabled,
        badge: 'Soon',
      },
      {
        label: 'Attempts',
        path: '/attempts',
        icon: BarChart3,
        disabled: !FEATURE_FLAGS.attemptsEnabled,
        badge: 'Soon',
      },
      { label: 'Settings', path: '/settings', icon: Settings2 },
    ],
  },
];

export const routeTitles = {
  '/login': { title: 'Login', breadcrumb: 'Login' },
  '/dashboard': { title: 'Dashboard', breadcrumb: 'Dashboard' },
  '/content/categories': { title: 'Categories', breadcrumb: 'Content / Categories' },
  '/content/quizzes': { title: 'Quizzes', breadcrumb: 'Content / Quizzes' },
  '/content/questions': { title: 'Questions', breadcrumb: 'Content / Questions' },
  '/gamification/levels': { title: 'Levels', breadcrumb: 'Gamification / Levels' },
  '/gamification/leaderboards': { title: 'Leaderboards', breadcrumb: 'Gamification / Leaderboards' },
  '/users': { title: 'Users', breadcrumb: 'Users' },
  '/attempts': { title: 'Attempts', breadcrumb: 'Attempts' },
  '/settings': { title: 'Settings', breadcrumb: 'Settings' },
  '/access-denied': { title: 'Access denied', breadcrumb: 'Access denied' },
};
