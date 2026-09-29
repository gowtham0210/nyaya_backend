const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { badRequest } = require('../../utils/errors');
const { requireFields } = require('../../utils/sql');
const {
  getSnapshot,
  spendCredits,
  refundTransaction,
  penaliseWrongAnswer,
  rewardAd,
  claimChest,
  serializeSnapshot,
} = require('../../services/credits');

const CHEST_TYPES = ['level', 'pool'];

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { credits, updatedAt } = await withTransaction((connection) =>
      getSnapshot(connection, req.auth.userId)
    );

    res.json(serializeSnapshot(credits, updatedAt));
  })
);

router.post(
  '/spend',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['reason']);

    const result = await withTransaction((connection) =>
      spendCredits(connection, req.auth.userId, String(payload.reason))
    );

    res.json(result);
  })
);

router.post(
  '/:transactionId/refund',
  asyncHandler(async (req, res) => {
    const transactionId = Number(req.params.transactionId);
    const result = await withTransaction((connection) =>
      refundTransaction(connection, req.auth.userId, transactionId)
    );

    res.json(result);
  })
);

router.post(
  '/penalty',
  asyncHandler(async (req, res) => {
    const result = await withTransaction((connection) =>
      penaliseWrongAnswer(connection, req.auth.userId)
    );

    res.json(result);
  })
);

router.post(
  '/ad-reward',
  asyncHandler(async (req, res) => {
    const result = await withTransaction((connection) => rewardAd(connection, req.auth.userId));

    res.json(result);
  })
);

router.get(
  '/chests/:chestType',
  asyncHandler(async (req, res) => {
    if (!CHEST_TYPES.includes(req.params.chestType)) {
      throw badRequest(`Unknown chest type: ${req.params.chestType}`);
    }

    const [rows] = await pool.execute(
      'SELECT chest_index FROM credit_chest_claims WHERE user_id = ? AND chest_type = ?',
      [req.auth.userId, req.params.chestType]
    );

    res.json({ items: rows.map((row) => Number(row.chest_index)) });
  })
);

router.post(
  '/chests/:chestType/:chestIndex/claim',
  asyncHandler(async (req, res) => {
    const chestIndex = Number(req.params.chestIndex);
    const result = await withTransaction((connection) =>
      claimChest(connection, req.auth.userId, req.params.chestType, chestIndex)
    );

    res.json(result);
  })
);

module.exports = router;
