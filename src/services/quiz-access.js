const { pool } = require('../config/database');

// A quiz may be tied to a level (quizzes.level_id). That level's min_points
// is the bar a player has to clear before the quiz opens up: below it the
// quiz still lists, marked locked, but its questions and new attempts are
// refused. A quiz with no level is open to everyone.
async function getQuizAccess(userId, connection = pool) {
  const [progressRows] = await connection.execute(
    'SELECT total_points FROM user_progress WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const totalPoints = Number(progressRows[0] ? progressRows[0].total_points : 0);

  const [levelRows] = await connection.execute('SELECT id, min_points FROM levels');
  const minPointsByLevel = new Map(
    levelRows.map((level) => [Number(level.id), Number(level.min_points)])
  );

  const requiredPoints = (quizRow) =>
    quizRow.level_id === null || quizRow.level_id === undefined
      ? null
      : minPointsByLevel.get(Number(quizRow.level_id)) ?? 0;

  return {
    totalPoints,
    requiredPoints,
    isLocked: (quizRow) => {
      const required = requiredPoints(quizRow);
      return required !== null && totalPoints < required;
    },
  };
}

module.exports = { getQuizAccess };
