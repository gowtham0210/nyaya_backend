const { pool, PG_ERRORS } = require('../config/database');
const { badRequest, conflict, notFound } = require('../utils/errors');
const { applyTranslations } = require('../utils/translate');
const {
  toLocalDateString,
  calculateAccuracy,
  getUserProgressRow,
  getUserStreakRow,
  getLevelForPoints,
  getUpdatedStreak,
  unlockAchievements,
} = require('./gamification');

const QUESTION_TRANSLATION_FIELDS = {
  category: 'category',
  question: 'question',
  explanation: 'answer',
};
const OPTION_TRANSLATION_FIELDS = { optionText: 'option_text' };

// A question can be served once it has at least two options and exactly one
// correct one. The admin API enforces this on save; this guards old rows.
const ELIGIBLE_QUESTION_SQL = `
  (SELECT COUNT(*) FROM daily_question_options o WHERE o.daily_question_id = dq.id) >= 2
  AND (SELECT COUNT(*) FROM daily_question_options o WHERE o.daily_question_id = dq.id AND o.is_correct = 1) = 1
`;

// Same day boundary as the streak (server-local date), so answering "today's"
// question always counts toward today's streak.
function today() {
  return toLocalDateString(new Date());
}

// Returns today's question id, choosing and recording it on the first call of
// the day: the eligible question shown least recently (never-shown first), so
// the bank rotates without repeats until every question has had a turn.
async function getScheduledQuestionId(connection, date) {
  const [existing] = await connection.execute(
    'SELECT daily_question_id FROM daily_question_schedule WHERE schedule_date = ? LIMIT 1',
    [date]
  );

  if (existing[0]) {
    return Number(existing[0].daily_question_id);
  }

  const [candidates] = await connection.execute(
    `
      SELECT dq.id
      FROM daily_questions dq
      WHERE ${ELIGIBLE_QUESTION_SQL}
      ORDER BY
        (SELECT MAX(s.schedule_date) FROM daily_question_schedule s WHERE s.daily_question_id = dq.id) ASC NULLS FIRST,
        dq.id ASC
      LIMIT 1
    `
  );

  if (!candidates[0]) {
    return null;
  }

  // Two first-requests racing: whichever insert lands wins, and both read it back.
  await connection.execute(
    `
      INSERT INTO daily_question_schedule (schedule_date, daily_question_id)
      VALUES (?, ?)
      ON CONFLICT (schedule_date) DO NOTHING
    `,
    [date, Number(candidates[0].id)]
  );
  const [scheduled] = await connection.execute(
    'SELECT daily_question_id FROM daily_question_schedule WHERE schedule_date = ? LIMIT 1',
    [date]
  );

  return Number(scheduled[0].daily_question_id);
}

async function loadQuestion(connection, questionId) {
  const [questionRows] = await connection.execute('SELECT * FROM daily_questions WHERE id = ? LIMIT 1', [
    questionId,
  ]);

  if (!questionRows[0]) {
    return null;
  }

  const [optionRows] = await connection.execute(
    'SELECT * FROM daily_question_options WHERE daily_question_id = ? ORDER BY display_order ASC, id ASC',
    [questionId]
  );

  return { row: questionRows[0], options: optionRows };
}

// What the player sees. The correct option and explanation are only included
// once they've answered (`attempt`), so they can't be read off the response.
async function serializeForPlayer(loaded, attempt, lang) {
  const [question] = await applyTranslations(
    [
      {
        id: Number(loaded.row.id),
        category: loaded.row.category,
        question: loaded.row.question,
        explanation: loaded.row.answer,
      },
    ],
    'daily_question',
    QUESTION_TRANSLATION_FIELDS,
    lang
  );
  const options = await applyTranslations(
    loaded.options.map((option) => ({ id: Number(option.id), optionText: option.option_text })),
    'daily_question_option',
    OPTION_TRANSLATION_FIELDS,
    lang
  );
  const correctOption = loaded.options.find((option) => Number(option.is_correct) === 1);

  return {
    question: {
      id: question.id,
      category: question.category,
      question: question.question,
      pointsReward: Number(loaded.row.points_reward),
      options,
    },
    result: attempt
      ? {
          selectedOptionId: attempt.selected_option_id === null ? null : Number(attempt.selected_option_id),
          correctOptionId: correctOption ? Number(correctOption.id) : null,
          isCorrect: Number(attempt.is_correct) === 1,
          pointsEarned: Number(attempt.points_earned),
          explanation: question.explanation,
        }
      : null,
  };
}

async function getTodayForUser(userId, lang) {
  const date = today();
  const connection = await pool.getConnection();

  try {
    const [attemptRows] = await connection.execute(
      'SELECT * FROM daily_question_attempts WHERE user_id = ? AND attempt_date = ? LIMIT 1',
      [userId, date]
    );
    const attempt = attemptRows[0] || null;
    // Once answered, keep showing the question they actually answered.
    const questionId = attempt ? attempt.daily_question_id : await getScheduledQuestionId(connection, date);
    const loaded = questionId === null ? null : await loadQuestion(connection, questionId);

    if (!loaded) {
      return { date, answered: Boolean(attempt), question: null, result: null };
    }

    return { date, answered: Boolean(attempt), ...(await serializeForPlayer(loaded, attempt, lang)) };
  } finally {
    connection.release();
  }
}

// Grades today's answer and applies it like a one-question quiz: points for a
// correct answer, the streak, accuracy, level and achievements. One per day.
async function answerToday(connection, userId, selectedOptionId, lang) {
  const date = today();
  const questionId = await getScheduledQuestionId(connection, date);

  if (questionId === null) {
    throw notFound('There is no daily question today');
  }

  const loaded = await loadQuestion(connection, questionId);
  const selectedOption = loaded.options.find((option) => Number(option.id) === selectedOptionId);

  if (!selectedOption) {
    throw badRequest("selectedOptionId is not one of today's options");
  }

  const isCorrect = Number(selectedOption.is_correct) === 1;
  const pointsEarned = isCorrect ? Number(loaded.row.points_reward) : 0;
  let attemptId;

  try {
    const [result] = await connection.execute(
      `
        INSERT INTO daily_question_attempts (
          user_id,
          attempt_date,
          daily_question_id,
          selected_option_id,
          is_correct,
          points_earned
        )
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id
      `,
      [userId, date, questionId, selectedOptionId, isCorrect ? 1 : 0, pointsEarned]
    );
    attemptId = Number(result.insertId);
  } catch (error) {
    if (error.code === PG_ERRORS.uniqueViolation) {
      throw conflict("You've already answered today's question");
    }

    throw error;
  }

  await getUserProgressRow(connection, userId);
  // Lock the player's totals so a quiz submitted at the same moment can't
  // overwrite these points (both paths read-modify-write user_progress).
  const [[progress]] = await connection.execute(
    'SELECT * FROM user_progress WHERE user_id = ? FOR UPDATE',
    [userId]
  );
  const streak = await getUserStreakRow(connection, userId);
  const answeredAt = new Date();
  const streakUpdate = getUpdatedStreak(streak, answeredAt);

  const metrics = {
    totalPoints: Number(progress.total_points) + pointsEarned,
    totalQuizzesCompleted: Number(progress.total_quizzes_completed),
    totalQuestionsAnswered: Number(progress.total_questions_answered) + 1,
    totalCorrectAnswers: Number(progress.total_correct_answers) + (isCorrect ? 1 : 0),
    totalWrongAnswers: Number(progress.total_wrong_answers) + (isCorrect ? 0 : 1),
    currentStreak: streakUpdate.currentStreak,
  };
  const unlockedAchievements = await unlockAchievements(connection, userId, metrics, answeredAt);
  const achievementPoints = unlockedAchievements.reduce(
    (total, achievement) => total + Number(achievement.reward_points),
    0
  );
  const totalPoints = metrics.totalPoints + achievementPoints;
  const level = await getLevelForPoints(connection, totalPoints);

  await connection.execute(
    `
      UPDATE user_progress
      SET
        total_points = ?,
        current_level_id = ?,
        total_questions_answered = ?,
        total_correct_answers = ?,
        total_wrong_answers = ?,
        accuracy_percentage = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `,
    [
      totalPoints,
      level ? Number(level.id) : null,
      metrics.totalQuestionsAnswered,
      metrics.totalCorrectAnswers,
      metrics.totalWrongAnswers,
      calculateAccuracy(metrics.totalCorrectAnswers, metrics.totalQuestionsAnswered),
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

  if (pointsEarned > 0) {
    await connection.execute(
      `
        INSERT INTO point_transactions (user_id, source_type, source_id, points_delta, description)
        VALUES (?, 'daily_question', ?, ?, ?)
      `,
      [userId, attemptId, pointsEarned, `Daily question for ${date} answered correctly`]
    );
  }

  for (const achievement of unlockedAchievements) {
    if (Number(achievement.reward_points) === 0) {
      continue;
    }

    await connection.execute(
      `
        INSERT INTO point_transactions (user_id, source_type, source_id, points_delta, description)
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

  const [[attempt]] = await connection.execute('SELECT * FROM daily_question_attempts WHERE id = ?', [attemptId]);

  return {
    date,
    answered: true,
    ...(await serializeForPlayer(loaded, attempt, lang)),
    totalPoints,
    currentStreak: streakUpdate.currentStreak,
    unlockedAchievements: unlockedAchievements.map((achievement) => ({
      code: achievement.achievement_code,
      title: achievement.achievement_title,
      rewardPoints: Number(achievement.reward_points),
    })),
  };
}

module.exports = {
  getTodayForUser,
  answerToday,
};
