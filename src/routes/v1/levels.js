const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializeLevel } = require('../../utils/serializers');
const { getLevelForPoints, getNextLevel, getUserProgressRow } = require('../../services/gamification');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM levels ORDER BY min_points ASC, id ASC');

    res.json({
      items: rows.map(serializeLevel),
    });
  })
);

router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (connection) => {
      const progress = await getUserProgressRow(connection, req.auth.userId);
      const totalPoints = Number(progress.total_points);
      const currentLevel = await getLevelForPoints(connection, totalPoints);
      const nextLevel = await getNextLevel(connection, totalPoints);

      return {
        totalPoints,
        currentLevel,
        nextLevel,
      };
    });

    res.json({
      totalPoints: result.totalPoints,
      currentLevel: result.currentLevel ? serializeLevel(result.currentLevel) : null,
      nextLevel: result.nextLevel ? serializeLevel(result.nextLevel) : null,
      pointsToNextLevel: result.nextLevel
        ? Math.max(Number(result.nextLevel.min_points) - result.totalPoints, 0)
        : null,
    });
  })
);

module.exports = router;
