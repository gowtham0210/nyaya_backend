// One-off import script: creates the "Legal Awareness Journey" category,
// 10 quizzes (Level 1 - Level 10), and all 60 questions + options from
// nyaya-quiz-bank-60.json, via the real admin API.
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api/v1';
const bank = require('./nyaya-quiz-bank-60.json').questions;

// Majority difficulty per level, used only as the quiz's own display label.
const quizDifficultyByLevel = {
  1: 'easy', 2: 'easy', 3: 'easy', 4: 'easy',
  5: 'medium',
  6: 'easy', 7: 'easy',
  8: 'medium', 9: 'medium',
  10: 'hard',
};

async function call(method, path, token, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (res.status >= 400) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function main() {
  const login = await call('POST', '/auth/login', null, {
    email: 'admin@nyaya.local',
    password: 'NyayaAdmin@2026',
  });
  const token = login.accessToken;

  const category = await call('POST', '/admin/categories', token, {
    name: 'Legal Awareness Journey',
    slug: 'legal-awareness-journey',
    description: 'A 10-level progressive legal awareness challenge covering the Constitution, courts, criminal law, civil law, and cyber law.',
  });
  console.log('Created category', category.id, category.slug);

  const questionsByLevel = {};
  for (const q of bank) {
    (questionsByLevel[q.level] ??= []).push(q);
  }

  for (let level = 1; level <= 10; level++) {
    const levelQuestions = questionsByLevel[level];
    const quiz = await call('POST', '/admin/quizzes', token, {
      categoryId: category.id,
      title: `Level ${level}`,
      slug: `legal-awareness-level-${level}`,
      description: `Level ${level} of the Legal Awareness Journey — ${levelQuestions.length} questions.`,
      difficulty: quizDifficultyByLevel[level],
      totalQuestions: levelQuestions.length,
      passingScore: 0,
    });
    console.log(`Created quiz Level ${level} (id ${quiz.id})`);

    for (const [index, q] of levelQuestions.entries()) {
      const question = await call('POST', '/admin/questions', token, {
        quizId: quiz.id,
        questionText: q.question,
        questionType: 'single_choice',
        explanation: JSON.stringify({ core: q.explanation, reference: q.topic }),
        difficulty: q.difficulty,
        pointsReward: q.difficulty === 'hard' ? 20 : q.difficulty === 'medium' ? 15 : 10,
        negativePoints: 0,
        displayOrder: index + 1,
      });

      const options = [
        { text: q.optionA, letter: 'A' },
        { text: q.optionB, letter: 'B' },
        { text: q.optionC, letter: 'C' },
        { text: q.optionD, letter: 'D' },
      ];
      for (const [optIndex, opt] of options.entries()) {
        await call('POST', `/admin/questions/${question.id}/options`, token, {
          optionText: opt.text,
          isCorrect: opt.letter === q.correctAnswer,
          displayOrder: optIndex + 1,
        });
      }
    }
    console.log(`  -> imported ${levelQuestions.length} questions for Level ${level}`);
  }

  console.log('Done. 10 quizzes, 60 questions, 240 options created.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
