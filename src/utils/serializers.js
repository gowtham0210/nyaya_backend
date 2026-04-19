function toIsoString(value) {
  return value ? new Date(value).toISOString() : null;
}

function toDateString(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function serializeUser(row) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeCategory(row) {
  return {
    id: Number(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeQuiz(row) {
  return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    title: row.title,
    slug: row.slug,
    description: row.description,
    difficulty: row.difficulty_level,
    totalQuestions: Number(row.total_questions),
    timeLimitSeconds: row.time_limit_seconds === null ? null : Number(row.time_limit_seconds),
    passingScore: row.passing_score === null ? null : Number(row.passing_score),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeQuestion(row) {
  return {
    id: Number(row.id),
    quizId: Number(row.quiz_id),
    questionText: row.question_text,
    questionType: row.question_type,
    explanation: row.explanation,
    difficulty: row.difficulty_level,
    pointsReward: Number(row.points_reward),
    negativePoints: Number(row.negative_points),
    displayOrder: Number(row.display_order),
    isActive: Boolean(row.is_active),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeQuestionOption(row) {
  return {
    id: Number(row.id),
    questionId: Number(row.question_id),
    optionText: row.option_text,
    isCorrect: Boolean(row.is_correct),
    displayOrder: Number(row.display_order),
    createdAt: toIsoString(row.created_at),
  };
}

function serializePlayableQuestion(row, options = []) {
  return {
    id: Number(row.id),
    questionText: row.question_text,
    questionType: row.question_type,
    explanation: row.explanation,
    pointsReward: Number(row.points_reward),
    negativePoints: Number(row.negative_points),
    displayOrder: Number(row.display_order),
    options: options.map((option) => ({
      id: Number(option.id),
      optionText: option.option_text,
      displayOrder: Number(option.display_order),
    })),
  };
}

function serializeQuizAttempt(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    quizId: Number(row.quiz_id),
    status: row.status,
    totalQuestions: Number(row.total_questions),
    answeredQuestions: Number(row.answered_questions),
    correctAnswers: Number(row.correct_answers),
    wrongAnswers: Number(row.wrong_answers),
    skippedAnswers: Number(row.skipped_answers),
    totalScore: Number(row.total_score),
    totalPointsEarned: Number(row.total_points_earned),
    completedInSeconds: row.completed_in_seconds === null ? null : Number(row.completed_in_seconds),
    startedAt: toIsoString(row.started_at),
    submittedAt: toIsoString(row.submitted_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeQuestionAttempt(row) {
  return {
    id: Number(row.id),
    quizAttemptId: Number(row.quiz_attempt_id),
    userId: Number(row.user_id),
    questionId: Number(row.question_id),
    selectedOptionId: row.selected_option_id === null ? null : Number(row.selected_option_id),
    isCorrect: Boolean(row.is_correct),
    pointsEarned: Number(row.points_earned),
    answeredAt: toIsoString(row.answered_at),
    responseTimeMs: row.response_time_ms === null ? null : Number(row.response_time_ms),
    createdAt: toIsoString(row.created_at),
  };
}

function serializePointTransaction(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    sourceType: row.source_type,
    sourceId: row.source_id === null ? null : Number(row.source_id),
    pointsDelta: Number(row.points_delta),
    description: row.description,
    createdAt: toIsoString(row.created_at),
  };
}

function serializeUserProgress(row) {
  return {
    userId: Number(row.user_id),
    totalPoints: Number(row.total_points),
    currentLevelId: row.current_level_id === null ? null : Number(row.current_level_id),
    totalQuizzesAttempted: Number(row.total_quizzes_attempted),
    totalQuizzesCompleted: Number(row.total_quizzes_completed),
    totalQuestionsAnswered: Number(row.total_questions_answered),
    totalCorrectAnswers: Number(row.total_correct_answers),
    totalWrongAnswers: Number(row.total_wrong_answers),
    accuracyPercentage: Number(row.accuracy_percentage),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeUserStreak(row) {
  return {
    userId: Number(row.user_id),
    currentStreak: Number(row.current_streak),
    maxStreak: Number(row.max_streak),
    lastActivityDate: toDateString(row.last_activity_date),
    streakStartDate: toDateString(row.streak_start_date),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeLevel(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    minPoints: Number(row.min_points),
    maxPoints: Number(row.max_points),
    badgeIcon: row.badge_icon,
    rewardDescription: row.reward_description,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function serializeUserAchievement(row) {
  const userAchievement = {
    id: Number(row.id),
    userId: Number(row.user_id),
    achievementId: Number(row.achievement_id),
    unlockedAt: toIsoString(row.unlocked_at),
    rewardPoints: Number(row.reward_points),
    createdAt: toIsoString(row.created_at),
  };

  if (row.achievement_code) {
    userAchievement.achievement = {
      id: Number(row.achievement_id),
      code: row.achievement_code,
      title: row.achievement_title,
      description: row.achievement_description,
      achievementType: row.achievement_type,
      targetValue: Number(row.achievement_target_value),
      rewardPoints: Number(row.achievement_reward_points),
      isActive: Boolean(row.achievement_is_active),
      createdAt: toIsoString(row.achievement_created_at),
      updatedAt: toIsoString(row.achievement_updated_at),
    };
  }

  return userAchievement;
}

function serializeLeaderboardEntry(row, rank) {
  return {
    rank,
    userId: Number(row.user_id),
    fullName: row.full_name,
    totalPoints: Number(row.total_points),
    currentLevelId: row.current_level_id === null ? null : Number(row.current_level_id),
  };
}

module.exports = {
  serializeUser,
  serializeCategory,
  serializeQuiz,
  serializeQuestion,
  serializeQuestionOption,
  serializePlayableQuestion,
  serializeQuizAttempt,
  serializeQuestionAttempt,
  serializePointTransaction,
  serializeUserProgress,
  serializeUserStreak,
  serializeLevel,
  serializeUserAchievement,
  serializeLeaderboardEntry,
};
