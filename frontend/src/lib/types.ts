export interface User {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Quiz {
  id: number;
  categoryId: number;
  title: string;
  slug: string;
  description: string | null;
  difficulty: string;
  totalQuestions: number;
  timeLimitSeconds: number | null;
  passingScore: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionOption {
  id: number;
  questionId: number;
  optionText: string;
  isCorrect: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface Question {
  id: number;
  quizId: number;
  questionText: string;
  questionType: string;
  explanation: string | null;
  difficulty: string;
  pointsReward: number;
  negativePoints: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  options: QuestionOption[];
}

export interface Level {
  id: number;
  code: string;
  name: string;
  minPoints: number;
  maxPoints: number;
  badgeIcon: string | null;
  rewardDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  fullName: string;
  totalPoints: number;
  currentLevelId: number | null;
}

export interface DashboardSummary {
  stats: {
    activeCategories: number;
    totalCategories: number;
    activeQuizzes: number;
    totalQuizzes: number;
    activeQuestions: number;
    totalQuestions: number;
    totalLevels: number;
    attemptsToday: number;
    activeUsers7d: number;
    activeUsers30d: number;
  };
  topQuizzes: Array<{
    id: number;
    title: string;
    slug: string;
    totalAttempts: number;
    submittedAttempts: number;
  }>;
  leaderboardPreview: LeaderboardEntry[];
  recentQuestions: Array<{
    id: number;
    questionText: string;
    quizId: number;
    quizTitle: string;
    createdAt: string;
  }>;
  recentAttempts: Array<{
    id: number;
    status: string;
    quizId: number;
    quizTitle: string;
    userId: number;
    fullName: string;
    startedAt: string;
    createdAt: string;
  }>;
}

export interface PaginatedResponse<T> {
  page: number;
  size: number;
  total: number;
  items: T[];
}

export interface ApiMessage {
  message?: string;
  details?: unknown;
}
