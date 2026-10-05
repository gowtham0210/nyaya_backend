const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializePracticeSetting } = require('../../utils/serializers');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `
        SELECT *
        FROM practice_settings
        WHERE is_enabled = 1
        ORDER BY array_position(ARRAY['easy', 'medium', 'hard'], difficulty_level::text)
      `
    );

    res.json({ items: rows.map(serializePracticeSetting) });
  })
);

module.exports = router;
