/**
 * Seeds the gamification reference data: player levels and achievements.
 * A new player starts on the level with min_points = 0, and levels and
 * achievements unlock as they earn points (see services/gamification.js).
 * Safe to re-run: rows are upserted by code, and rows not in these lists
 * (e.g. ones an admin created) are left alone.
 *
 *   npm run db:seed-content
 */
const { pool } = require('../config/database');

// Ranges are contiguous; the last level's max_points is just a display cap.
const LEVELS = [
  {
    code: 'citizen',
    name: 'Aware Citizen',
    minPoints: 0,
    maxPoints: 99,
    badgeIcon: 'badge-citizen',
    rewardDescription: 'Starting out: learn your basic rights.',
  },
  {
    code: 'paralegal',
    name: 'Paralegal',
    minPoints: 100,
    maxPoints: 299,
    badgeIcon: 'badge-paralegal',
    rewardDescription: 'Unlocks intermediate quizzes.',
  },
  {
    code: 'advocate',
    name: 'Advocate',
    minPoints: 300,
    maxPoints: 699,
    badgeIcon: 'badge-advocate',
    rewardDescription: 'Unlocks advanced quizzes across all categories.',
  },
  {
    code: 'senior-advocate',
    name: 'Senior Advocate',
    minPoints: 700,
    maxPoints: 1499,
    badgeIcon: 'badge-senior-advocate',
    rewardDescription: 'Recognised for consistent legal knowledge.',
  },
  {
    code: 'judge',
    name: 'Judge',
    minPoints: 1500,
    maxPoints: 2999,
    badgeIcon: 'badge-judge',
    rewardDescription: 'Expert-level mastery of Indian law.',
  },
  {
    code: 'chief-justice',
    name: 'Chief Justice',
    minPoints: 3000,
    maxPoints: 999999,
    badgeIcon: 'badge-chief-justice',
    rewardDescription: 'The highest rank in Nyaya.',
  },
];

// achievement_type must be one of the types evaluated in
// services/gamification.js: quiz_completions, correct_answers, points_earned,
// streak_days.
const ACHIEVEMENTS = [
  {
    code: 'first-quiz',
    title: 'First Hearing',
    description: 'Complete your first quiz.',
    type: 'quiz_completions',
    target: 1,
    reward: 10,
  },
  {
    code: 'quizzes-10',
    title: 'Regular in Court',
    description: 'Complete 10 quizzes.',
    type: 'quiz_completions',
    target: 10,
    reward: 25,
  },
  {
    code: 'quizzes-50',
    title: 'Case Veteran',
    description: 'Complete 50 quizzes.',
    type: 'quiz_completions',
    target: 50,
    reward: 100,
  },
  {
    code: 'correct-10',
    title: 'Sound Argument',
    description: 'Answer 10 questions correctly.',
    type: 'correct_answers',
    target: 10,
    reward: 10,
  },
  {
    code: 'correct-100',
    title: 'Well Versed',
    description: 'Answer 100 questions correctly.',
    type: 'correct_answers',
    target: 100,
    reward: 50,
  },
  {
    code: 'correct-500',
    title: 'Legal Scholar',
    description: 'Answer 500 questions correctly.',
    type: 'correct_answers',
    target: 500,
    reward: 150,
  },
  {
    code: 'points-250',
    title: 'Rising Counsel',
    description: 'Earn 250 points.',
    type: 'points_earned',
    target: 250,
    reward: 20,
  },
  {
    code: 'points-1000',
    title: 'Distinguished Counsel',
    description: 'Earn 1,000 points.',
    type: 'points_earned',
    target: 1000,
    reward: 75,
  },
  {
    code: 'points-5000',
    title: 'Legal Luminary',
    description: 'Earn 5,000 points.',
    type: 'points_earned',
    target: 5000,
    reward: 250,
  },
  {
    code: 'streak-3',
    title: 'Three-Day Session',
    description: 'Keep a 3-day learning streak.',
    type: 'streak_days',
    target: 3,
    reward: 15,
  },
  {
    code: 'streak-7',
    title: 'Week in Session',
    description: 'Keep a 7-day learning streak.',
    type: 'streak_days',
    target: 7,
    reward: 40,
  },
  {
    code: 'streak-30',
    title: 'Full Term',
    description: 'Keep a 30-day learning streak.',
    type: 'streak_days',
    target: 30,
    reward: 200,
  },
];

async function run() {
  for (const level of LEVELS) {
    await pool.execute(
      `
        INSERT INTO levels (code, name, min_points, max_points, badge_icon, reward_description)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          min_points = VALUES(min_points),
          max_points = VALUES(max_points),
          badge_icon = VALUES(badge_icon),
          reward_description = VALUES(reward_description)
      `,
      [level.code, level.name, level.minPoints, level.maxPoints, level.badgeIcon, level.rewardDescription]
    );
  }

  for (const achievement of ACHIEVEMENTS) {
    await pool.execute(
      `
        INSERT INTO achievements (code, title, description, achievement_type, target_value, reward_points, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          achievement_type = VALUES(achievement_type),
          target_value = VALUES(target_value),
          reward_points = VALUES(reward_points)
      `,
      [
        achievement.code,
        achievement.title,
        achievement.description,
        achievement.type,
        achievement.target,
        achievement.reward,
      ]
    );
  }

  // Players created before any level existed have current_level_id = NULL;
  // put them on the level that matches their points.
  const [result] = await pool.query(`
    UPDATE user_progress up
    SET up.current_level_id = (
      SELECT l.id FROM levels l
      WHERE l.min_points <= up.total_points
      ORDER BY l.min_points DESC, l.id DESC
      LIMIT 1
    )
    WHERE up.current_level_id IS NULL
  `);

  console.log(
    `Seeded ${LEVELS.length} levels and ${ACHIEVEMENTS.length} achievements; ` +
      `assigned a level to ${result.affectedRows} existing player(s).`
  );
  await pool.end();
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
