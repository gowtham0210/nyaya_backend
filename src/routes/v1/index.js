const express = require('express');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const systemRoutes = require('./system');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const categoryRoutes = require('./categories');
const quizRoutes = require('./quizzes');
const quizAttemptRoutes = require('./quiz-attempts');
const levelRoutes = require('./levels');
const leaderboardRoutes = require('./leaderboards');
const adminRoutes = require('./admin');

const router = express.Router();

router.use(systemRoutes);
router.use('/auth', authRoutes);

router.use(authenticate);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/quizzes', quizRoutes);
router.use('/quiz-attempts', quizAttemptRoutes);
router.use('/levels', levelRoutes);
router.use('/leaderboards', leaderboardRoutes);

router.use('/admin', requireAdmin, adminRoutes);

module.exports = router;
