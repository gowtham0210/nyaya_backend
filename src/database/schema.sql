CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL,
  phone VARCHAR(25) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(150) NOT NULL,
  description TEXT DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS levels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  min_points INT NOT NULL,
  max_points INT NOT NULL,
  badge_icon VARCHAR(255) DEFAULT NULL,
  reward_description TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_levels_code (code),
  KEY idx_levels_points (min_points, max_points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quizzes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT DEFAULT NULL,
  difficulty_level VARCHAR(30) NOT NULL DEFAULT 'medium',
  total_questions INT NOT NULL DEFAULT 0,
  time_limit_seconds INT DEFAULT NULL,
  passing_score DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quizzes_slug (slug),
  KEY idx_quizzes_category_id (category_id),
  KEY idx_quizzes_active (is_active),
  CONSTRAINT fk_quizzes_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id BIGINT UNSIGNED NOT NULL,
  question_text TEXT NOT NULL,
  question_type VARCHAR(30) NOT NULL DEFAULT 'single_choice',
  explanation TEXT DEFAULT NULL,
  difficulty_level VARCHAR(30) NOT NULL DEFAULT 'medium',
  points_reward INT NOT NULL DEFAULT 0,
  negative_points INT NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_questions_quiz_id (quiz_id),
  KEY idx_questions_display_order (quiz_id, display_order),
  KEY idx_questions_active (is_active),
  CONSTRAINT fk_questions_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id BIGINT UNSIGNED NOT NULL,
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_question_options_question_id (question_id),
  KEY idx_question_options_order (question_id, display_order),
  CONSTRAINT fk_question_options_question
    FOREIGN KEY (question_id) REFERENCES questions (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  quiz_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  submitted_at DATETIME DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
  total_questions INT NOT NULL DEFAULT 0,
  answered_questions INT NOT NULL DEFAULT 0,
  correct_answers INT NOT NULL DEFAULT 0,
  wrong_answers INT NOT NULL DEFAULT 0,
  skipped_answers INT NOT NULL DEFAULT 0,
  total_score DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_points_earned INT NOT NULL DEFAULT 0,
  completed_in_seconds INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quiz_attempts_user_id (user_id),
  KEY idx_quiz_attempts_quiz_id (quiz_id),
  KEY idx_quiz_attempts_status (status),
  KEY idx_quiz_attempts_started_at (started_at),
  CONSTRAINT fk_quiz_attempts_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_quiz_attempts_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_attempt_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  selected_option_id BIGINT UNSIGNED DEFAULT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  points_earned INT NOT NULL DEFAULT 0,
  answered_at DATETIME NOT NULL,
  response_time_ms INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_question_attempts_quiz_attempt_id (quiz_attempt_id),
  KEY idx_question_attempts_user_id (user_id),
  KEY idx_question_attempts_question_id (question_id),
  KEY idx_question_attempts_selected_option_id (selected_option_id),
  CONSTRAINT fk_question_attempts_quiz_attempt
    FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_question_attempts_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_question_attempts_question
    FOREIGN KEY (question_id) REFERENCES questions (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_question_attempts_selected_option
    FOREIGN KEY (selected_option_id) REFERENCES question_options (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id BIGINT UNSIGNED DEFAULT NULL,
  points_delta INT NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_point_transactions_user_id (user_id),
  KEY idx_point_transactions_source (source_type, source_id),
  KEY idx_point_transactions_created_at (created_at),
  CONSTRAINT fk_point_transactions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_progress (
  user_id BIGINT UNSIGNED NOT NULL,
  total_points INT NOT NULL DEFAULT 0,
  current_level_id BIGINT UNSIGNED DEFAULT NULL,
  total_quizzes_attempted INT NOT NULL DEFAULT 0,
  total_quizzes_completed INT NOT NULL DEFAULT 0,
  total_questions_answered INT NOT NULL DEFAULT 0,
  total_correct_answers INT NOT NULL DEFAULT 0,
  total_wrong_answers INT NOT NULL DEFAULT 0,
  accuracy_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY idx_user_progress_level_id (current_level_id),
  CONSTRAINT fk_user_progress_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_user_progress_level
    FOREIGN KEY (current_level_id) REFERENCES levels (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id BIGINT UNSIGNED NOT NULL,
  current_streak INT NOT NULL DEFAULT 0,
  max_streak INT NOT NULL DEFAULT 0,
  last_activity_date DATE DEFAULT NULL,
  streak_start_date DATE DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_streaks_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS achievements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT DEFAULT NULL,
  achievement_type VARCHAR(50) NOT NULL,
  target_value INT NOT NULL,
  reward_points INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_achievements_code (code),
  KEY idx_achievements_type (achievement_type),
  KEY idx_achievements_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  achievement_id BIGINT UNSIGNED NOT NULL,
  unlocked_at DATETIME NOT NULL,
  reward_points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_achievements_user_achievement (user_id, achievement_id),
  KEY idx_user_achievements_achievement_id (achievement_id),
  CONSTRAINT fk_user_achievements_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_user_achievements_achievement
    FOREIGN KEY (achievement_id) REFERENCES achievements (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
