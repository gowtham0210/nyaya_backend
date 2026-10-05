const { badRequest, conflict, notFound } = require('../utils/errors');
const { getUserProgressRow } = require('./gamification');

const MAX_CREDITS = 100;
const REGEN_AMOUNT = 20;
const REGEN_INTERVAL_MS = 5 * 60 * 60 * 1000;
const LEVEL_CHEST_REWARD = 10;
const POOL_CHEST_REWARD = 40;
const LEVELS_PER_CHEST = 4;
const POOL_CLUSTER_LEVELS = 5;
const POOL_NORMAL_SIZE = 5;
const POOL_BOSS_SIZE = 10;
const AD_REWARD = 25;
// ponytail: a real ad reward needs server-side verification from the ad
// network's callback; without that integration this cooldown is the only
// thing stopping a scripted client from farming rewardAd. Good enough to
// close casual abuse, not a substitute for real ad SSV.
const AD_REWARD_COOLDOWN_MS = 60 * 1000;

const SPEND_REASONS = { quiz_entry: 25 };
const CHEST_TYPES = { level: LEVEL_CHEST_REWARD, pool: POOL_CHEST_REWARD };
const WRONG_ANSWER_PENALTY = 5;

function applyRegen(credits, creditsUpdatedAt, now = new Date()) {
  if (credits >= MAX_CREDITS) {
    return { credits: MAX_CREDITS, updatedAt: now };
  }

  const last = creditsUpdatedAt ? new Date(creditsUpdatedAt) : now;
  const elapsedMs = now.getTime() - last.getTime();
  const ticks = Math.floor(elapsedMs / REGEN_INTERVAL_MS);

  if (ticks <= 0) {
    return { credits, updatedAt: last };
  }

  const regened = Math.min(credits + ticks * REGEN_AMOUNT, MAX_CREDITS);
  const updatedAt =
    regened >= MAX_CREDITS ? now : new Date(last.getTime() + ticks * REGEN_INTERVAL_MS);

  return { credits: regened, updatedAt };
}

function nextRegenAt(credits, updatedAt) {
  if (credits >= MAX_CREDITS) {
    return null;
  }

  return new Date(updatedAt.getTime() + REGEN_INTERVAL_MS);
}

async function persistCredits(connection, userId, credits, updatedAt) {
  await connection.execute(
    'UPDATE user_progress SET credits = ?, credits_updated_at = ? WHERE user_id = ?',
    [credits, updatedAt, userId]
  );
}

async function insertTransaction(connection, userId, reason, amount, refundOfTransactionId = null) {
  const [result] = await connection.execute(
    `
      INSERT INTO credit_transactions (user_id, reason, amount, refund_of_transaction_id)
      VALUES (?, ?, ?, ?) RETURNING id
    `,
    [userId, reason, amount, refundOfTransactionId]
  );

  return Number(result.insertId);
}

function serializeSnapshot(credits, updatedAt) {
  const next = nextRegenAt(credits, updatedAt);

  return {
    credits,
    maxCredits: MAX_CREDITS,
    nextRegenAt: next ? next.toISOString() : null,
  };
}

/// Applies any pending regen ticks and persists the result, returning the
/// up-to-date balance. Used for plain reads (GET /credits), where losing a
/// race with a concurrent mutation just means a stale balance is shown
/// briefly rather than something incorrect being persisted.
async function getSnapshot(connection, userId) {
  const progress = await getUserProgressRow(connection, userId);
  const { credits, updatedAt } = applyRegen(
    Number(progress.credits),
    progress.credits_updated_at,
    new Date()
  );

  if (
    credits !== Number(progress.credits) ||
    String(updatedAt) !== String(progress.credits_updated_at)
  ) {
    await persistCredits(connection, userId, credits, updatedAt);
  }

  return { credits, updatedAt };
}

/// Same as [getSnapshot], but locks the row first (SELECT ... FOR UPDATE)
/// so two concurrent mutations for the same user can't both read the same
/// balance and both think they can afford to deduct from it — the second
/// request blocks until the first's transaction commits, then reads the
/// post-deduction balance. Every mutating function below uses this instead
/// of the plain read.
async function getSnapshotForUpdate(connection, userId) {
  await getUserProgressRow(connection, userId); // ensures the row exists
  const [rows] = await connection.execute(
    'SELECT credits, credits_updated_at FROM user_progress WHERE user_id = ? FOR UPDATE',
    [userId]
  );
  const row = rows[0];
  const { credits, updatedAt } = applyRegen(Number(row.credits), row.credits_updated_at, new Date());

  if (credits !== Number(row.credits) || String(updatedAt) !== String(row.credits_updated_at)) {
    await persistCredits(connection, userId, credits, updatedAt);
  }

  return { credits, updatedAt };
}

async function spendCredits(connection, userId, reason) {
  const cost = SPEND_REASONS[reason];

  if (cost === undefined) {
    throw badRequest(`Unknown spend reason: ${reason}`);
  }

  const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);

  if (credits < cost) {
    return { success: false, ...serializeSnapshot(credits, updatedAt) };
  }

  const remaining = credits - cost;
  await persistCredits(connection, userId, remaining, updatedAt);
  const transactionId = await insertTransaction(connection, userId, reason, -cost);

  return { success: true, transactionId, ...serializeSnapshot(remaining, updatedAt) };
}

/// Refunds exactly the spend transaction named by [transactionId] — never
/// an arbitrary amount the client asks for — and only once: the unique key
/// on credit_transactions.refund_of_transaction_id rejects a second refund
/// of the same spend even if the client replays the request.
async function refundTransaction(connection, userId, transactionId) {
  const [rows] = await connection.execute(
    'SELECT * FROM credit_transactions WHERE id = ? AND user_id = ? LIMIT 1',
    [transactionId, userId]
  );
  const transaction = rows[0];

  if (!transaction) {
    throw notFound('Credit transaction not found');
  }

  if (transaction.amount >= 0 || !(transaction.reason in SPEND_REASONS)) {
    throw badRequest('Only a quiz-entry spend can be refunded');
  }

  if (transaction.refunded) {
    throw conflict('This spend has already been refunded');
  }

  const refundAmount = Math.abs(Number(transaction.amount));

  // The unique key on refund_of_transaction_id is the real guard against a
  // race between two concurrent refund requests for the same spend — the
  // `refunded` flag above is just a fast, non-authoritative pre-check.
  try {
    await insertTransaction(connection, userId, `${transaction.reason}_refund`, refundAmount, transactionId);
  } catch (error) {
    throw conflict('This spend has already been refunded');
  }

  await connection.execute('UPDATE credit_transactions SET refunded = 1 WHERE id = ?', [transactionId]);

  const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);
  const restored = Math.min(credits + refundAmount, MAX_CREDITS);
  await persistCredits(connection, userId, restored, updatedAt);

  return serializeSnapshot(restored, updatedAt);
}

async function penaliseWrongAnswer(connection, userId) {
  const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);
  const deducted = Math.min(credits, WRONG_ANSWER_PENALTY);
  const remaining = credits - deducted;
  await persistCredits(connection, userId, remaining, updatedAt);

  if (deducted > 0) {
    await insertTransaction(connection, userId, 'wrong_answer_penalty', -deducted);
  }

  return serializeSnapshot(remaining, updatedAt);
}

async function rewardAd(connection, userId) {
  const [recentRows] = await connection.execute(
    `
      SELECT created_at FROM credit_transactions
      WHERE user_id = ? AND reason = 'ad_reward'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );
  const last = recentRows[0];

  if (last && Date.now() - new Date(last.created_at).getTime() < AD_REWARD_COOLDOWN_MS) {
    throw conflict('Watch another ad in a moment.');
  }

  const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);
  const rewarded = Math.min(credits + AD_REWARD, MAX_CREDITS);
  await persistCredits(connection, userId, rewarded, updatedAt);
  await insertTransaction(connection, userId, 'ad_reward', rewarded - credits);

  return serializeSnapshot(rewarded, updatedAt);
}

/// Level-journey quizzes carry their level number in their slug
/// (`…-level-7`) or title (`Level 7`) — the same rule the client uses to
/// order them, kept in one place so the server checks chest readiness
/// against the same journey the client renders.
function levelNumberOf(quiz) {
  const bySlug = /-level-(\d+)$/.exec(quiz.slug);
  if (bySlug) {
    return Number(bySlug[1]);
  }
  const byTitle = /^\s*Level\s+(\d+)\b/i.exec(quiz.title);
  return byTitle ? Number(byTitle[1]) : null;
}

async function getCompletedLevelJourneyQuizzes(connection, userId) {
  const [quizRows] = await connection.execute(
    `
      SELECT q.id, q.slug, q.title
      FROM quizzes q
      INNER JOIN categories c ON c.id = q.category_id
      WHERE c.slug = 'legal-awareness-journey' AND q.is_active = 1
    `
  );
  const numbered = quizRows
    .map((row) => ({ id: Number(row.id), number: levelNumberOf(row) }))
    .filter((row) => row.number !== null)
    .sort((a, b) => a.number - b.number);

  if (numbered.length === 0) {
    return [];
  }

  const [attemptRows] = await connection.query(
    `
      SELECT DISTINCT quiz_id
      FROM quiz_attempts
      WHERE user_id = ? AND status = 'submitted' AND quiz_id IN (?)
    `,
    [userId, numbered.map((row) => row.id)]
  );
  const completedIds = new Set(attemptRows.map((row) => Number(row.quiz_id)));

  return numbered.map((row) => completedIds.has(row.id));
}

async function isLevelChestReady(connection, userId, chestIndex) {
  const completedInOrder = await getCompletedLevelJourneyQuizzes(connection, userId);
  const start = chestIndex * LEVELS_PER_CHEST;
  const end = start + LEVELS_PER_CHEST;

  if (completedInOrder.length < end) {
    return false;
  }

  return completedInOrder.slice(start, end).every(Boolean);
}

/// The pool is every active quiz outside the level journey — the same
/// "everything not reserved" rule the client applies to the backend's
/// quiz catalogue, minus the client-only bundled demo content the server
/// never sees anyway.
async function getCompletedPoolQuizzesInOrder(connection, userId) {
  const [quizRows] = await connection.execute(
    `
      SELECT id FROM quizzes
      WHERE is_active = 1 AND level_id IS NULL
      ORDER BY id ASC
    `
  );

  if (quizRows.length === 0) {
    return [];
  }

  const ids = quizRows.map((row) => Number(row.id));
  const [attemptRows] = await connection.query(
    `
      SELECT DISTINCT quiz_id
      FROM quiz_attempts
      WHERE user_id = ? AND status = 'submitted' AND quiz_id IN (?)
    `,
    [userId, ids]
  );
  const completedIds = new Set(attemptRows.map((row) => Number(row.quiz_id)));

  return ids.map((id) => completedIds.has(id));
}

/// Mirrors the client's LeaderboardJourney grouping: quizzes laid out five
/// to a level, ten on every fifth ("boss") level, with a chest after every
/// finished boss level.
async function isPoolChestReady(connection, userId, chestIndex) {
  const completed = await getCompletedPoolQuizzesInOrder(connection, userId);
  let index = 0;
  let levelNumber = 1;

  while (index < completed.length) {
    const isBoss = levelNumber % POOL_CLUSTER_LEVELS === 0;
    const size = isBoss ? POOL_BOSS_SIZE : POOL_NORMAL_SIZE;
    const slice = completed.slice(index, index + size);
    index += size;

    if (isBoss) {
      const thisChestIndex = levelNumber / POOL_CLUSTER_LEVELS - 1;
      if (thisChestIndex === chestIndex) {
        return slice.length === size && slice.every(Boolean);
      }
    }
    levelNumber += 1;
  }

  return false;
}

async function claimChest(connection, userId, chestType, chestIndex) {
  const reward = CHEST_TYPES[chestType];

  if (reward === undefined) {
    throw badRequest(`Unknown chest type: ${chestType}`);
  }

  if (!Number.isInteger(chestIndex) || chestIndex < 0) {
    throw badRequest('chestIndex must be a non-negative integer');
  }

  const ready =
    chestType === 'level'
      ? await isLevelChestReady(connection, userId, chestIndex)
      : await isPoolChestReady(connection, userId, chestIndex);

  if (!ready) {
    const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);
    return { success: false, notReady: true, ...serializeSnapshot(credits, updatedAt) };
  }

  try {
    await connection.execute(
      `
        INSERT INTO credit_chest_claims (user_id, chest_type, chest_index, reward)
        VALUES (?, ?, ?, ?)
      `,
      [userId, chestType, chestIndex, reward]
    );
  } catch (error) {
    // Unique key on (user_id, chest_type, chest_index): a replayed claim
    // lands here instead of paying out twice.
    const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);
    return { success: false, alreadyClaimed: true, ...serializeSnapshot(credits, updatedAt) };
  }

  const { credits, updatedAt } = await getSnapshotForUpdate(connection, userId);
  const rewarded = Math.min(credits + reward, MAX_CREDITS);
  await persistCredits(connection, userId, rewarded, updatedAt);
  await insertTransaction(connection, userId, `${chestType}_chest_reward`, rewarded - credits);

  return { success: true, ...serializeSnapshot(rewarded, updatedAt) };
}

module.exports = {
  MAX_CREDITS,
  getSnapshot,
  spendCredits,
  refundTransaction,
  penaliseWrongAnswer,
  rewardAd,
  claimChest,
  serializeSnapshot,
};
