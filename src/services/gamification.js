const { notFound } = require('../utils/errors');

function toLocalDateString(value) {
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

function calculateAccuracy(totalCorrectAnswers, totalQuestionsAnswered) {
  if (!totalQuestionsAnswered) {
    return 0;
  }

  return Number(((totalCorrectAnswers / totalQuestionsAnswered) * 100).toFixed(2));
}

async function getDefaultLevelId(connection) {
  const [rows] = await connection.execute(
    'SELECT id FROM levels WHERE min_points <= 0 ORDER BY min_points ASC, id ASC LIMIT 1'
  );

  return rows[0] ? Number(rows[0].id) : null;
}

async function ensureUserSummaryRows(connection, userId) {
  const defaultLevelId = await getDefaultLevelId(connection);

  await connection.execute(
    `
      INSERT INTO user_progress (
        user_id,
        total_points,
        current_level_id,
        total_quizzes_attempted,
        total_quizzes_completed,
        total_questions_answered,
        total_correct_answers,
        total_wrong_answers,
        accuracy_percentage
      )
      VALUES (?, 0, ?, 0, 0, 0, 0, 0, 0.00)
      ON DUPLICATE KEY UPDATE user_id = user_id
    `,
    [userId, defaultLevelId]
  );

  await connection.execute(
    `
      INSERT INTO user_streaks (
        user_id,
        current_streak,
        max_streak,
        last_activity_date,
        streak_start_date
      )
      VALUES (?, 0, 0, NULL, NULL)
      ON DUPLICATE KEY UPDATE user_id = user_id
    `,
    [userId]
  );
}

async function getUserProgressRow(connection, userId) {
  await ensureUserSummaryRows(connection, userId);
  const [rows] = await connection.execute(
    'SELECT * FROM user_progress WHERE user_id = ? LIMIT 1',
    [userId]
  );

  return rows[0];
}

async function getUserStreakRow(connection, userId) {
  await ensureUserSummaryRows(connection, userId);
  const [rows] = await connection.execute(
    'SELECT * FROM user_streaks WHERE user_id = ? LIMIT 1',
    [userId]
  );

  return rows[0];
}

async function getLevelForPoints(connection, totalPoints) {
  const [rows] = await connection.execute(
    `
      SELECT *
      FROM levels
      WHERE min_points <= ?
      ORDER BY min_points DESC, max_points DESC, id DESC
      LIMIT 1
    `,
    [totalPoints]
  );

  return rows[0] || null;
}

async function getNextLevel(connection, totalPoints) {
  const [rows] = await connection.execute(
    `
      SELECT *
      FROM levels
      WHERE min_points > ?
      ORDER BY min_points ASC, id ASC
      LIMIT 1
    `,
    [totalPoints]
  );

  return rows[0] || null;
}

function getUpdatedStreak(currentStreakRow, activityDate) {
  const today = toLocalDateString(activityDate);
  const lastDate = toLocalDateString(currentStreakRow.last_activity_date);

  if (!lastDate) {
    return {
      currentStreak: 1,
      maxStreak: Math.max(1, Number(currentStreakRow.max_streak || 0)),
      lastActivityDate: today,
      streakStartDate: today,
    };
  }

  if (lastDate === today) {
    return {
      currentStreak: Number(currentStreakRow.current_streak),
      maxStreak: Number(currentStreakRow.max_streak),
      lastActivityDate: today,
      streakStartDate: toLocalDateString(currentStreakRow.streak_start_date) || today,
    };
  }

  const yesterday = new Date(activityDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = toLocalDateString(yesterday);

  if (lastDate === yesterdayString) {
    const nextCurrentStreak = Number(currentStreakRow.current_streak) + 1;

    return {
      currentStreak: nextCurrentStreak,
      maxStreak: Math.max(nextCurrentStreak, Number(currentStreakRow.max_streak)),
      lastActivityDate: today,
      streakStartDate: toLocalDateString(currentStreakRow.streak_start_date) || yesterdayString,
    };
  }

  return {
    currentStreak: 1,
    maxStreak: Math.max(1, Number(currentStreakRow.max_streak)),
    lastActivityDate: today,
    streakStartDate: today,
  };
}

async function unlockAchievements(connection, userId, metrics, unlockedAt) {
  const [achievementRows] = await connection.execute(
    'SELECT * FROM achievements WHERE is_active = 1 ORDER BY id ASC'
  );
  const [existingRows] = await connection.execute(
    'SELECT achievement_id FROM user_achievements WHERE user_id = ?',
    [userId]
  );
  const existingIds = new Set(existingRows.map((row) => Number(row.achievement_id)));
  const unlockedAchievements = [];

  for (const achievement of achievementRows) {
    const achievementId = Number(achievement.id);

    if (existingIds.has(achievementId)) {
      continue;
    }

    const targetValue = Number(achievement.target_value);
    let currentValue = 0;

    switch (achievement.achievement_type) {
      case 'correct_answers':
        currentValue = metrics.totalCorrectAnswers;
        break;
      case 'quiz_completions':
        currentValue = metrics.totalQuizzesCompleted;
        break;
      case 'points_earned':
        currentValue = metrics.totalPoints;
        break;
      case 'streak_days':
        currentValue = metrics.currentStreak;
        break;
      default:
        currentValue = 0;
    }

    if (currentValue < targetValue) {
      continue;
    }

    const [result] = await connection.execute(
      `
        INSERT INTO user_achievements (
          user_id,
          achievement_id,
          unlocked_at,
          reward_points
        )
        VALUES (?, ?, ?, ?)
      `,
      [userId, achievementId, unlockedAt, Number(achievement.reward_points)]
    );

    unlockedAchievements.push({
      id: Number(result.insertId),
      user_id: userId,
      achievement_id: achievementId,
      unlocked_at: unlockedAt,
      reward_points: Number(achievement.reward_points),
      created_at: unlockedAt,
      achievement_code: achievement.code,
      achievement_title: achievement.title,
      achievement_description: achievement.description,
      achievement_type: achievement.achievement_type,
      achievement_target_value: achievement.target_value,
      achievement_reward_points: achievement.reward_points,
      achievement_is_active: achievement.is_active,
      achievement_created_at: achievement.created_at,
      achievement_updated_at: achievement.updated_at,
    });
  }

  return unlockedAchievements;
}

async function getAttemptOrThrow(connection, attemptId, userId) {
  const [rows] = await connection.execute(
    'SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ? LIMIT 1',
    [attemptId, userId]
  );

  if (!rows[0]) {
    throw notFound('Quiz attempt not found');
  }

  return rows[0];
}

module.exports = {
  calculateAccuracy,
  ensureUserSummaryRows,
  getUserProgressRow,
  getUserStreakRow,
  getLevelForPoints,
  getNextLevel,
  getUpdatedStreak,
  unlockAchievements,
  getAttemptOrThrow,
};
