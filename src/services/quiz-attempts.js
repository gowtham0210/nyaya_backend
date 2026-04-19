const {
  calculateAccuracy,
  getAttemptOrThrow,
  getLevelForPoints,
  getUserProgressRow,
  getUserStreakRow,
  getUpdatedStreak,
  unlockAchievements,
} = require('./gamification');
const {
  serializePointTransaction,
  serializeQuizAttempt,
  serializeUserAchievement,
  serializeUserProgress,
  serializeUserStreak,
} = require('../utils/serializers');
const { badRequest, notFound } = require('../utils/errors');

async function recalculateAttempt(connection, attemptId) {
  const [attemptRows] = await connection.execute(
    'SELECT * FROM quiz_attempts WHERE id = ? LIMIT 1',
    [attemptId]
  );
  const attempt = attemptRows[0];

  if (!attempt) {
    throw notFound('Quiz attempt not found');
  }

  const [summaryRows] = await connection.execute(
    `
      SELECT
        COUNT(*) AS answeredQuestions,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correctAnswers,
        SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrongAnswers,
        COALESCE(SUM(points_earned), 0) AS totalPointsEarned
      FROM question_attempts
      WHERE quiz_attempt_id = ?
    `,
    [attemptId]
  );
  const summary = summaryRows[0];
  const answeredQuestions = Number(summary.answeredQuestions || 0);
  const correctAnswers = Number(summary.correctAnswers || 0);
  const wrongAnswers = Number(summary.wrongAnswers || 0);
  const totalPointsEarned = Number(summary.totalPointsEarned || 0);
  const skippedAnswers = Math.max(Number(attempt.total_questions) - answeredQuestions, 0);

  await connection.execute(
    `
      UPDATE quiz_attempts
      SET
        answered_questions = ?,
        correct_answers = ?,
        wrong_answers = ?,
        skipped_answers = ?,
        total_score = ?,
        total_points_earned = ?
      WHERE id = ?
    `,
    [
      answeredQuestions,
      correctAnswers,
      wrongAnswers,
      skippedAnswers,
      totalPointsEarned,
      totalPointsEarned,
      attemptId,
    ]
  );

  return {
    ...attempt,
    answered_questions: answeredQuestions,
    correct_answers: correctAnswers,
    wrong_answers: wrongAnswers,
    skipped_answers: skippedAnswers,
    total_score: totalPointsEarned,
    total_points_earned: totalPointsEarned,
  };
}

async function buildQuizResult(connection, attemptId, userId) {
  const attempt = await getAttemptOrThrow(connection, attemptId, userId);

  if (attempt.status !== 'submitted') {
    throw badRequest('Quiz attempt has not been submitted yet');
  }

  const progress = await getUserProgressRow(connection, userId);
  const streak = await getUserStreakRow(connection, userId);
  const [achievementRows] = await connection.execute(
    `
      SELECT
        ua.*,
        a.code AS achievement_code,
        a.title AS achievement_title,
        a.description AS achievement_description,
        a.achievement_type,
        a.target_value AS achievement_target_value,
        a.reward_points AS achievement_reward_points,
        a.is_active AS achievement_is_active,
        a.created_at AS achievement_created_at,
        a.updated_at AS achievement_updated_at
      FROM user_achievements ua
      INNER JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ?
        AND ua.unlocked_at >= ?
        AND ua.unlocked_at <= DATE_ADD(?, INTERVAL 5 MINUTE)
      ORDER BY ua.unlocked_at ASC, ua.id ASC
    `,
    [userId, attempt.started_at, attempt.submitted_at]
  );
  const [transactionRows] = await connection.execute(
    `
      SELECT *
      FROM point_transactions
      WHERE user_id = ?
        AND created_at >= ?
        AND created_at <= DATE_ADD(?, INTERVAL 5 MINUTE)
      ORDER BY created_at ASC, id ASC
    `,
    [userId, attempt.started_at, attempt.submitted_at]
  );

  return {
    attempt: serializeQuizAttempt(attempt),
    progress: serializeUserProgress(progress),
    streak: serializeUserStreak(streak),
    newAchievements: achievementRows.map(serializeUserAchievement),
    pointTransactions: transactionRows.map(serializePointTransaction),
  };
}

async function submitAttempt(connection, attemptId, userId) {
  const attempt = await getAttemptOrThrow(connection, attemptId, userId);

  if (attempt.status === 'submitted') {
    return buildQuizResult(connection, attemptId, userId);
  }

  if (attempt.status !== 'in_progress') {
    throw badRequest('Only in-progress quiz attempts can be submitted');
  }

  const recalculatedAttempt = await recalculateAttempt(connection, attemptId);
  const submittedAt = new Date();
  const completedInSeconds = Math.max(
    Math.floor((submittedAt.getTime() - new Date(recalculatedAttempt.started_at).getTime()) / 1000),
    0
  );

  await connection.execute(
    `
      UPDATE quiz_attempts
      SET
        status = 'submitted',
        submitted_at = ?,
        completed_in_seconds = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [submittedAt, completedInSeconds, attemptId]
  );

  const progress = await getUserProgressRow(connection, userId);
  const streak = await getUserStreakRow(connection, userId);
  const streakUpdate = getUpdatedStreak(streak, submittedAt);

  const progressBeforeRewards = {
    totalPoints: Number(progress.total_points) + Number(recalculatedAttempt.total_points_earned),
    totalQuizzesAttempted: Number(progress.total_quizzes_attempted) + 1,
    totalQuizzesCompleted: Number(progress.total_quizzes_completed) + 1,
    totalQuestionsAnswered:
      Number(progress.total_questions_answered) + Number(recalculatedAttempt.answered_questions),
    totalCorrectAnswers:
      Number(progress.total_correct_answers) + Number(recalculatedAttempt.correct_answers),
    totalWrongAnswers: Number(progress.total_wrong_answers) + Number(recalculatedAttempt.wrong_answers),
    currentStreak: streakUpdate.currentStreak,
  };

  const newlyUnlockedAchievements = await unlockAchievements(
    connection,
    userId,
    progressBeforeRewards,
    submittedAt
  );
  const achievementRewardPoints = newlyUnlockedAchievements.reduce(
    (total, achievement) => total + Number(achievement.reward_points),
    0
  );
  const finalTotalPoints = progressBeforeRewards.totalPoints + achievementRewardPoints;
  const currentLevel = await getLevelForPoints(connection, finalTotalPoints);
  const accuracyPercentage = calculateAccuracy(
    progressBeforeRewards.totalCorrectAnswers,
    progressBeforeRewards.totalQuestionsAnswered
  );

  await connection.execute(
    `
      UPDATE user_progress
      SET
        total_points = ?,
        current_level_id = ?,
        total_quizzes_attempted = ?,
        total_quizzes_completed = ?,
        total_questions_answered = ?,
        total_correct_answers = ?,
        total_wrong_answers = ?,
        accuracy_percentage = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `,
    [
      finalTotalPoints,
      currentLevel ? Number(currentLevel.id) : null,
      progressBeforeRewards.totalQuizzesAttempted,
      progressBeforeRewards.totalQuizzesCompleted,
      progressBeforeRewards.totalQuestionsAnswered,
      progressBeforeRewards.totalCorrectAnswers,
      progressBeforeRewards.totalWrongAnswers,
      accuracyPercentage,
      userId,
    ]
  );

  await connection.execute(
    `
      UPDATE user_streaks
      SET
        current_streak = ?,
        max_streak = ?,
        last_activity_date = ?,
        streak_start_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `,
    [
      streakUpdate.currentStreak,
      streakUpdate.maxStreak,
      streakUpdate.lastActivityDate,
      streakUpdate.streakStartDate,
      userId,
    ]
  );

  await connection.execute(
    `
      INSERT INTO point_transactions (
        user_id,
        source_type,
        source_id,
        points_delta,
        description
      )
      VALUES (?, 'quiz_completion', ?, ?, ?)
    `,
    [
      userId,
      attemptId,
      Number(recalculatedAttempt.total_points_earned),
      `Quiz attempt #${attemptId} completed`,
    ]
  );

  for (const achievement of newlyUnlockedAchievements) {
    if (Number(achievement.reward_points) === 0) {
      continue;
    }

    await connection.execute(
      `
        INSERT INTO point_transactions (
          user_id,
          source_type,
          source_id,
          points_delta,
          description
        )
        VALUES (?, 'manual_adjustment', ?, ?, ?)
      `,
      [
        userId,
        Number(achievement.achievement_id),
        Number(achievement.reward_points),
        `Achievement unlocked: ${achievement.achievement_title}`,
      ]
    );
  }

  return buildQuizResult(connection, attemptId, userId);
}

module.exports = {
  recalculateAttempt,
  buildQuizResult,
  submitAttempt,
};
