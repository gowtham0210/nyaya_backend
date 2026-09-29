import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  QuestionFormPayload,
  getCategories,
  getQuestions,
  getQuizzes,
  saveCategory,
  saveQuestionWithOptions,
  saveQuiz,
} from "@/features/content/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/shared/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Textarea";
import { Quiz } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";

// The category that holds the app's level journey. Levels are ordinary
// quizzes inside it, named "Level 1" … "Level 10".
const LEVELS_CATEGORY_SLUG = "legal-awareness-journey";
const LEVELS_CATEGORY_NAME = "Legal Awareness Journey";

type BankQuestion = {
  level: number;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  difficulty: "easy" | "medium" | "hard";
  topic?: string;
  explanation?: string;
};

/** "legal-awareness-level-7" / "Level 7" -> 7; null when it isn't a level. */
function levelNumberOf(quiz: Pick<Quiz, "slug" | "title">): number | null {
  const fromSlug = /-level-(\d+)$/.exec(quiz.slug);
  const fromTitle = /^\s*Level\s+(\d+)\b/i.exec(quiz.title);
  const match = fromSlug ?? fromTitle;
  return match ? Number(match[1]) : null;
}

function pointsFor(difficulty: BankQuestion["difficulty"]) {
  if (difficulty === "hard") return 20;
  if (difficulty === "medium") return 15;
  return 10;
}

/** The difficulty most of a level's questions carry, as the quiz's label. */
function majorityDifficulty(questions: BankQuestion[]) {
  const tally = new Map<string, number>();
  questions.forEach((question) => {
    tally.set(question.difficulty, (tally.get(question.difficulty) ?? 0) + 1);
  });
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "easy";
}

/** Reads a JSON question bank, throwing a readable message if it is not one. */
function parseBank(raw: string): BankQuestion[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("That is not valid JSON.");
  }

  const questions = Array.isArray(parsed)
    ? parsed
    : (parsed as { questions?: unknown })?.questions;

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Expected a "questions" array with at least one question.');
  }

  return questions as BankQuestion[];
}

/** Header names people actually use, normalised to the fields we need. */
const headerAliases: Record<string, keyof ParsedRow> = {
  question: "question",
  questiontext: "question",
  questions: "question",
  q: "question",
  optiona: "optionA",
  option1: "optionA",
  a: "optionA",
  optionb: "optionB",
  option2: "optionB",
  b: "optionB",
  optionc: "optionC",
  option3: "optionC",
  c: "optionC",
  optiond: "optionD",
  option4: "optionD",
  d: "optionD",
  correctanswer: "correctAnswer",
  correct: "correctAnswer",
  answer: "correctAnswer",
  correctoption: "correctAnswer",
  difficulty: "difficulty",
  level: "level",
  levelnumber: "level",
  topic: "topic",
  subject: "topic",
  explanation: "explanation",
  reason: "explanation",
};

type ParsedRow = {
  question?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswer?: string;
  difficulty?: string;
  level?: string;
  topic?: string;
  explanation?: string;
};

function normaliseHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Maps one spreadsheet row onto the fields we need, whatever it calls them. */
function readRow(raw: Record<string, unknown>): ParsedRow {
  const row: ParsedRow = {};

  Object.entries(raw).forEach(([header, value]) => {
    const field = headerAliases[normaliseHeader(header)];
    if (field && value !== null && value !== undefined) {
      row[field] = String(value).trim();
    }
  });

  return row;
}

/**
 * Turns a row into a question, resolving the answer whether it is given as a
 * letter ("B"), a number ("2"), or the option's own text.
 */
function toBankQuestion(
  row: ParsedRow,
  index: number,
  fallbackLevel: number,
  fallbackDifficulty: BankQuestion["difficulty"],
): BankQuestion {
  const where = `Row ${index + 1}`;
  const options = {
    A: row.optionA ?? "",
    B: row.optionB ?? "",
    C: row.optionC ?? "",
    D: row.optionD ?? "",
  };

  if (!row.question) {
    throw new Error(`${where}: no question text found.`);
  }
  for (const letter of ["A", "B", "C", "D"] as const) {
    if (!options[letter]) {
      throw new Error(`${where}: option ${letter} is empty.`);
    }
  }

  const given = (row.correctAnswer ?? "").trim();
  let correct = given.toUpperCase();

  if (!["A", "B", "C", "D"].includes(correct)) {
    // A number (1-4), or the answer written out in full.
    const byNumber = { "1": "A", "2": "B", "3": "C", "4": "D" }[given];
    const byText = (["A", "B", "C", "D"] as const).find(
      (letter) => options[letter].toLowerCase() === given.toLowerCase(),
    );
    correct = byNumber ?? byText ?? "";
  }

  if (!["A", "B", "C", "D"].includes(correct)) {
    throw new Error(
      `${where}: correct answer "${given}" is not A, B, C, D or one of the options.`,
    );
  }

  const level = Number(row.level);
  const difficulty = (row.difficulty ?? "").toLowerCase();

  return {
    level: Number.isInteger(level) && level > 0 ? level : fallbackLevel,
    question: row.question,
    optionA: options.A,
    optionB: options.B,
    optionC: options.C,
    optionD: options.D,
    correctAnswer: correct as BankQuestion["correctAnswer"],
    difficulty: ["easy", "medium", "hard"].includes(difficulty)
      ? (difficulty as BankQuestion["difficulty"])
      : fallbackDifficulty,
    topic: row.topic,
    explanation: row.explanation,
  };
}

/** Blob.text() where it exists, FileReader where it doesn't. */
function readText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsText(file);
  });
}

/** Reads a CSV / XLSX / JSON file into rows, whichever it is. */
async function readFileRows(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
  }

  const text = await readText(file);

  if (name.endsWith(".json")) {
    return parseBank(text) as unknown as Record<string, unknown>[];
  }

  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

const emptyQuestion = {
  level: "",
  questionText: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctAnswer: "A" as "A" | "B" | "C" | "D",
  difficulty: "easy" as BankQuestion["difficulty"],
  topic: "",
  explanation: "",
};

type QuickAddProps = {
  levels: Array<{ quiz: Quiz; number: number }>;
  onAdded: () => Promise<void> | void;
};

/**
 * Types one question straight into a level. It goes in through the same
 * admin endpoints the import uses, so the app shows it the next time that
 * level's list is opened — no import file needed.
 */
function QuickAddQuestion({ levels, onAdded }: QuickAddProps) {
  const [form, setForm] = useState(emptyQuestion);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof emptyQuestion>(
    key: K,
    value: (typeof emptyQuestion)[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const addQuestion = useMutation({
    mutationFn: async () => {
      const target = levels.find(
        (entry) => String(entry.number) === form.level,
      );

      if (!target) {
        throw new Error("Pick the level this question belongs to.");
      }
      if (!form.questionText.trim()) {
        throw new Error("Write the question first.");
      }
      for (const letter of ["A", "B", "C", "D"] as const) {
        if (!form[`option${letter}` as const].trim()) {
          throw new Error(`Option ${letter} is empty.`);
        }
      }

      // Existing questions decide the new one's place in the level.
      const current = await getQuestions(target.quiz.id, true);
      const payload: QuestionFormPayload = {
        quizId: target.quiz.id,
        questionText: form.questionText.trim(),
        questionType: "single_choice",
        explanation: JSON.stringify({
          core: form.explanation.trim(),
          reference: form.topic.trim(),
        }),
        difficulty: form.difficulty,
        pointsReward: pointsFor(form.difficulty),
        negativePoints: 0,
        displayOrder: current.items.length + 1,
        isActive: true,
        options: (["A", "B", "C", "D"] as const).map((letter, index) => ({
          optionText: form[`option${letter}` as const].trim(),
          isCorrect: form.correctAnswer === letter,
          displayOrder: index + 1,
        })),
      };

      await saveQuestionWithOptions(null, payload);

      // Keep the level's advertised count in step with what it now holds.
      await saveQuiz(target.quiz.id, {
        categoryId: target.quiz.categoryId,
        title: target.quiz.title,
        slug: target.quiz.slug,
        description: target.quiz.description,
        difficulty: target.quiz.difficulty,
        totalQuestions: current.items.length + 1,
        timeLimitSeconds: target.quiz.timeLimitSeconds,
        passingScore: target.quiz.passingScore,
        isActive: true,
      });

      return target.number;
    },
    onSuccess: async (level) => {
      setError(null);
      setForm({ ...emptyQuestion, level: String(level) });
      await onAdded();
      toast.success(`Added to Level ${level}. It is live in the app now.`);
    },
    onError: (mutationError) => {
      const message = getErrorMessage(mutationError);
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Add a question</h3>
        <p className="text-sm text-slate-600">
          Write one question and it goes straight into that level. The app picks
          it up the next time the level is opened.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Level">
          <Select
            value={form.level}
            onChange={(event) => set("level", event.target.value)}
          >
            <option value="">Choose a level</option>
            {levels.map((entry) => (
              <option key={entry.quiz.id} value={String(entry.number)}>
                Level {entry.number} ({entry.quiz.totalQuestions} questions)
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty" hint={`${pointsFor(form.difficulty)} points`}>
          <Select
            value={form.difficulty}
            onChange={(event) =>
              set(
                "difficulty",
                event.target.value as BankQuestion["difficulty"],
              )
            }
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </Field>
        <Field label="Topic" hint="optional">
          <Input
            value={form.topic}
            onChange={(event) => set("topic", event.target.value)}
            placeholder="Courts and Judiciary"
          />
        </Field>
      </div>

      <Field label="Question">
        <Textarea
          rows={2}
          value={form.questionText}
          onChange={(event) => set("questionText", event.target.value)}
          placeholder="Which is the highest court in India?"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["A", "B", "C", "D"] as const).map((letter) => (
          <Field
            key={letter}
            label={`Option ${letter}`}
            hint={form.correctAnswer === letter ? "correct answer" : undefined}
          >
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="correctAnswer"
                aria-label={`Option ${letter} is correct`}
                checked={form.correctAnswer === letter}
                onChange={() => set("correctAnswer", letter)}
                className="h-4 w-4 accent-teal-600"
              />
              <Input
                value={form[`option${letter}` as const]}
                onChange={(event) =>
                  set(`option${letter}` as const, event.target.value)
                }
                placeholder={`Answer ${letter}`}
              />
            </div>
          </Field>
        ))}
      </div>

      <Field label="Explanation" hint="optional, shown after answering">
        <Textarea
          rows={2}
          value={form.explanation}
          onChange={(event) => set("explanation", event.target.value)}
          placeholder="The Supreme Court is the apex court of India."
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => addQuestion.mutate()}
          disabled={addQuestion.isPending}
        >
          {addQuestion.isPending ? "Adding..." : "Add question"}
        </Button>
        <Button variant="secondary" onClick={() => setForm(emptyQuestion)}>
          Clear
        </Button>
        {error ? (
          <span className="text-sm font-medium text-red-600">{error}</span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * The level journey's quizzes, with per-level and whole-bank question
 * imports. Importing creates any missing levels, so a fresh database can be
 * seeded from this page alone.
 */
export function LevelsPanel() {
  const queryClient = useQueryClient();
  const [pendingRows, setPendingRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importLevel, setImportLevel] = useState("");
  const [newLevelDifficulty, setNewLevelDifficulty] =
    useState<BankQuestion["difficulty"]>("easy");
  const [importDifficulty, setImportDifficulty] =
    useState<BankQuestion["difficulty"]>("easy");
  const [skipFilled, setSkipFilled] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importCard = useRef<HTMLDivElement>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => getCategories(true),
  });
  const levelsCategory = categoriesQuery.data?.find(
    (category) => category.slug === LEVELS_CATEGORY_SLUG,
  );

  const quizzesQuery = useQuery({
    queryKey: ["quizzes", "levels", levelsCategory?.id],
    queryFn: () =>
      getQuizzes({ categoryId: levelsCategory!.id, showInactive: true }),
    enabled: Boolean(levelsCategory),
  });

  // Level order, not the API's newest-first order.
  const levels = useMemo(() => {
    const items = quizzesQuery.data ?? [];
    return items
      .map((quiz) => ({ quiz, number: levelNumberOf(quiz) }))
      .filter(
        (entry): entry is { quiz: Quiz; number: number } =>
          entry.number !== null,
      )
      .sort((a, b) => a.number - b.number);
  }, [quizzesQuery.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    await queryClient.invalidateQueries({ queryKey: ["quizzes"] });
  };

  const nextLevelNumber = levels.length
    ? Math.max(...levels.map((entry) => entry.number)) + 1
    : 1;

  const addLevel = useMutation({
    mutationFn: async () => {
      let category = levelsCategory;

      if (!category) {
        category = await saveCategory(null, {
          name: LEVELS_CATEGORY_NAME,
          slug: LEVELS_CATEGORY_SLUG,
          description: "The app\u2019s level-wise journey.",
          isActive: true,
        });
      }

      // Levels are numbered in sequence, so the new one goes on the end.
      await saveQuiz(null, {
        categoryId: category.id,
        title: `Level ${nextLevelNumber}`,
        slug: `legal-awareness-level-${nextLevelNumber}`,
        description: `Level ${nextLevelNumber} of the ${LEVELS_CATEGORY_NAME}.`,
        difficulty: newLevelDifficulty,
        totalQuestions: 0,
        timeLimitSeconds: null,
        passingScore: 0,
        isActive: true,
      });

      return nextLevelNumber;
    },
    onSuccess: async (number) => {
      await refresh();
      setImportLevel(String(number));
      toast.success(`Added Level ${number}. Give it some questions below.`);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const importRows = useMutation({
    mutationFn: async () => {
      const fallbackLevel = Number(importLevel);
      const rowsNeedLevel = pendingRows.some(
        (row) => !readRow(row as Record<string, unknown>).level,
      );

      if (
        rowsNeedLevel &&
        !(Number.isInteger(fallbackLevel) && fallbackLevel > 0)
      ) {
        throw new Error("Choose which level these questions belong to.");
      }

      const bank = pendingRows.map((row, index) =>
        toBankQuestion(
          readRow(row as Record<string, unknown>),
          index,
          fallbackLevel,
          importDifficulty,
        ),
      );

      const byLevel = new Map<number, BankQuestion[]>();
      bank.forEach((question) => {
        const list = byLevel.get(question.level) ?? [];
        list.push(question);
        byLevel.set(question.level, list);
      });

      let category = levelsCategory;
      if (!category) {
        setProgress("Creating the journey category...");
        category = await saveCategory(null, {
          name: LEVELS_CATEGORY_NAME,
          slug: LEVELS_CATEGORY_SLUG,
          description: "The app’s level-wise journey.",
          isActive: true,
        });
      }

      const existing = await getQuizzes({
        categoryId: category.id,
        showInactive: true,
      });
      let created = 0;
      let imported = 0;
      let skipped = 0;

      for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
        const questions = byLevel.get(level)!;
        const slug = `legal-awareness-level-${level}`;
        let quiz = existing.find((item) => item.slug === slug);

        if (!quiz) {
          setProgress(`Creating Level ${level}...`);
          quiz = await saveQuiz(null, {
            categoryId: category.id,
            title: `Level ${level}`,
            slug,
            description: `Level ${level} of the ${LEVELS_CATEGORY_NAME} — ${questions.length} questions.`,
            difficulty: majorityDifficulty(questions),
            totalQuestions: questions.length,
            timeLimitSeconds: null,
            passingScore: 0,
            isActive: true,
          });
          created += 1;
        }

        const current = await getQuestions(quiz.id, true);

        if (skipFilled && current.items.length > 0) {
          skipped += questions.length;
          continue;
        }

        // Keep numbering after whatever the level already holds.
        const offset = current.items.length;

        for (const [index, question] of questions.entries()) {
          setProgress(
            `Level ${level}: question ${index + 1} of ${questions.length}...`,
          );
          const payload: QuestionFormPayload = {
            quizId: quiz.id,
            questionText: question.question,
            questionType: "single_choice",
            explanation: JSON.stringify({
              core: question.explanation ?? "",
              reference: question.topic ?? "",
            }),
            difficulty: question.difficulty,
            pointsReward: pointsFor(question.difficulty),
            negativePoints: 0,
            displayOrder: offset + index + 1,
            isActive: true,
            options: (["A", "B", "C", "D"] as const).map(
              (letter, optionIndex) => ({
                optionText: question[`option${letter}` as const],
                isCorrect: question.correctAnswer === letter,
                displayOrder: optionIndex + 1,
              }),
            ),
          };
          await saveQuestionWithOptions(null, payload);
          imported += 1;
        }

        // Keep the quiz's advertised count honest.
        await saveQuiz(quiz.id, {
          categoryId: quiz.categoryId,
          title: quiz.title,
          slug: quiz.slug,
          description: quiz.description,
          difficulty: quiz.difficulty,
          totalQuestions: offset + questions.length,
          timeLimitSeconds: quiz.timeLimitSeconds,
          passingScore: quiz.passingScore,
          isActive: true,
        });
      }

      return { created, imported, skipped, levels: byLevel.size };
    },
    onSuccess: async (result) => {
      setProgress(null);
      setPendingRows([]);
      setFileName(null);
      await refresh();
      toast.success(
        `Imported ${result.imported} questions across ${result.levels} levels` +
          (result.created ? `, creating ${result.created} new level(s)` : "") +
          (result.skipped
            ? `. Skipped ${result.skipped} for levels that already had questions`
            : ""),
      );
    },
    onError: (error) => {
      setProgress(null);
      setFileError(getErrorMessage(error));
      toast.error(getErrorMessage(error));
    },
  });

  const isLoading =
    categoriesQuery.isPending ||
    (Boolean(levelsCategory) && quizzesQuery.isPending);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Level journey
            </h3>
            <p className="text-sm text-slate-600">
              The levels the app shows under Quizzes, in order. Import questions
              into one level, or load a whole question bank below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {levelsCategory ? <Badge>{levels.length} levels</Badge> : null}
            <Select
              aria-label="New level difficulty"
              className="w-36"
              value={newLevelDifficulty}
              onChange={(event) =>
                setNewLevelDifficulty(
                  event.target.value as BankQuestion["difficulty"],
                )
              }
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <Button
              onClick={() => addLevel.mutate()}
              disabled={addLevel.isPending}
            >
              {addLevel.isPending
                ? "Adding..."
                : `Add Level ${nextLevelNumber}`}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <EmptyState
            title="Loading levels..."
            description="Fetching the journey category."
          />
        ) : levels.length === 0 ? (
          <EmptyState
            title="No levels yet"
            description="Add one above, or import a question bank below and the levels will be created for you."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Questions</th>
                  <th className="px-3 py-2">Difficulty</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {levels.map(({ quiz, number }) => (
                  <tr key={quiz.id} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-medium text-slate-900">
                      Level {number}
                      <div className="text-xs text-slate-500">{quiz.slug}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {quiz.totalQuestions}
                    </td>
                    <td className="px-3 py-3 text-slate-700 capitalize">
                      {quiz.difficulty}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={quiz.isActive ? "success" : "muted"}>
                        {quiz.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setImportLevel(String(number));
                          importCard.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                        }}
                      >
                        Add questions
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <QuickAddQuestion levels={levels} onAdded={refresh} />

      <div ref={importCard}>
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Import questions from a file
            </h3>
            <p className="text-sm text-slate-600">
              Pick a CSV, Excel or JSON file and it is read straight in — no
              column mapping. Columns can be named Question, Option A-D, Correct
              Answer, and optionally Difficulty, Level, Topic and Explanation.
              The correct answer can be a letter, a number, or the answer
              written out.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Add to level"
              hint="used when the file has no Level column"
            >
              <Select
                value={importLevel}
                onChange={(event) => setImportLevel(event.target.value)}
              >
                <option value="">Choose a level</option>
                {levels.map((entry) => (
                  <option key={entry.quiz.id} value={String(entry.number)}>
                    Level {entry.number} ({entry.quiz.totalQuestions} questions)
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Default difficulty"
              hint="used when the file has no Difficulty column"
            >
              <Select
                value={importDifficulty}
                onChange={(event) =>
                  setImportDifficulty(
                    event.target.value as BankQuestion["difficulty"],
                  )
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls,.json,application/json,text/csv"
              aria-label="Questions file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setFileError(null);
                try {
                  setPendingRows(await readFileRows(file));
                  setFileName(file.name);
                } catch (readError) {
                  setPendingRows([]);
                  setFileName(null);
                  setFileError(getErrorMessage(readError));
                }
              }}
              className="text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
            {fileName ? (
              <Badge>
                {fileName} · {pendingRows.length} row
                {pendingRows.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox
                checked={skipFilled}
                onChange={(event) => setSkipFilled(event.target.checked)}
              />
              Skip levels that already have questions
            </label>
            <Button
              onClick={() => importRows.mutate()}
              disabled={pendingRows.length === 0 || importRows.isPending}
            >
              {importRows.isPending
                ? "Importing..."
                : `Import ${pendingRows.length || ""} question${pendingRows.length === 1 ? "" : "s"}`}
            </Button>
            {progress ? (
              <span className="text-sm text-slate-500">{progress}</span>
            ) : null}
            {fileError ? (
              <span className="text-sm font-medium text-red-600">
                {fileError}
              </span>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
