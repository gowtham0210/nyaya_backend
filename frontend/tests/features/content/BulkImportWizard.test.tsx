import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { BulkImportWizard } from '@/features/content/BulkImportWizard';

const {
  downloadTextFileMock,
  parseCsvMock,
  readWorkbookMock,
  saveQuestionWithOptionsMock,
  sheetToJsonMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  downloadTextFileMock: vi.fn(),
  parseCsvMock: vi.fn(),
  readWorkbookMock: vi.fn(),
  saveQuestionWithOptionsMock: vi.fn(),
  sheetToJsonMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock('papaparse', () => ({
  default: {
    parse: parseCsvMock,
  },
}));

vi.mock('xlsx', () => ({
  read: readWorkbookMock,
  utils: {
    sheet_to_json: sheetToJsonMock,
  },
}));

vi.mock('@/features/content/api', () => ({
  saveQuestionWithOptions: saveQuestionWithOptionsMock,
}));

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');

  return {
    ...actual,
    downloadTextFile: downloadTextFileMock,
  };
});

function renderWizard(overrides?: Partial<ComponentProps<typeof BulkImportWizard>>) {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const onComplete = vi.fn();

  return {
    user,
    onClose,
    onComplete,
    ...render(
      <BulkImportWizard
        open
        quizId={11}
        onClose={onClose}
        onComplete={onComplete}
        {...overrides}
      />
    ),
  };
}

function createStructuredRow(overrides: Record<string, unknown> = {}) {
  return {
    questionText: 'Which article guarantees equality before law?',
    questionType: 'single_choice',
    explanation: 'Article 14 guarantees equality.',
    difficulty: 'medium',
    pointsReward: 10,
    negativePoints: 0,
    displayOrder: 1,
    isActive: true,
    options: [
      {
        optionText: 'Article 14',
        isCorrect: true,
        displayOrder: 1,
      },
      {
        optionText: 'Article 19',
        isCorrect: false,
        displayOrder: 2,
      },
    ],
    ...overrides,
  };
}

function attachFileText(file: File, text: string) {
  Object.defineProperty(file, 'text', {
    value: vi.fn().mockResolvedValue(text),
  });

  return file;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('BulkImportWizard', () => {
  it('downloads CSV and JSON templates from step 1', async () => {
    const { user } = renderWizard();

    await user.click(screen.getByRole('button', { name: 'Download CSV template' }));
    await user.click(screen.getByRole('button', { name: 'Download JSON template' }));

    expect(downloadTextFileMock).toHaveBeenNthCalledWith(
      1,
      'nyaya-questions-template.csv',
      expect.stringContaining('questionText'),
      'text/csv;charset=utf-8'
    );
    expect(downloadTextFileMock).toHaveBeenNthCalledWith(
      2,
      'nyaya-questions-template.json',
      expect.stringContaining('"questionText"'),
      'application/json'
    );
  });

  it('accepts CSV input, supports manual mapping, and validates rows before import', async () => {
    parseCsvMock.mockReturnValue({
      data: [
        {
          prompt: 'Which article guarantees equality before law?',
          kind: 'single_choice',
          choiceA: 'Article 14',
          choiceACorrect: 'yes',
          choiceB: 'Article 19',
          choiceBCorrect: 'no',
        },
        {
          prompt: 'Broken quiz row',
          kind: 'single_choice',
          choiceA: 'Article 14',
          choiceACorrect: 'no',
          choiceB: 'Article 19',
          choiceBCorrect: 'no',
        },
      ],
    });

    const { user } = renderWizard();
    const csvFile = attachFileText(new File(['prompt,kind\n'], 'questions.csv', { type: 'text/csv' }), 'prompt,kind\n');

    fireEvent.change(screen.getByLabelText('Upload question file'), {
      target: {
        files: [csvFile],
      },
    });

    expect(await screen.findByText(/questions\.csv/i)).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent?.includes('2 rows detected') ?? false).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Question text'), 'prompt');
    await user.selectOptions(screen.getByLabelText('Question type'), 'kind');
    await user.selectOptions(screen.getByLabelText('Option 1 text'), 'choiceA');
    await user.selectOptions(screen.getByLabelText('Option 1 correct'), 'choiceACorrect');
    await user.selectOptions(screen.getByLabelText('Option 2 text'), 'choiceB');
    await user.selectOptions(screen.getByLabelText('Option 2 correct'), 'choiceBCorrect');

    await user.click(screen.getByRole('button', { name: 'Validate rows' }));

    expect(await screen.findByText('1 valid rows · 1 invalid rows')).toBeInTheDocument();
    expect(screen.getAllByText('valid').length).toBeGreaterThan(0);
    expect(screen.getAllByText('invalid').length).toBeGreaterThan(0);
    expect(screen.getByText(/Mark at least one option as correct/i)).toBeInTheDocument();
  });

  it('accepts XLSX input and detects rows for mapping', async () => {
    readWorkbookMock.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {},
      },
    });
    sheetToJsonMock.mockReturnValue([
      {
        questionText: 'Which article guarantees equality before law?',
        questionType: 'single_choice',
      },
    ]);

    const { user } = renderWizard();
    const xlsxFile = new File(['fake-xlsx'], 'questions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    Object.defineProperty(xlsxFile, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    fireEvent.change(screen.getByLabelText('Upload question file'), {
      target: {
        files: [xlsxFile],
      },
    });

    expect(await screen.findByText(/questions\.xlsx/i)).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent?.includes('1 rows detected') ?? false).length).toBeGreaterThan(0);
  });

  it('auto-detects structured JSON files and skips manual mapping', async () => {
    const { user } = renderWizard();
    const jsonFile = attachFileText(
      new File([JSON.stringify([createStructuredRow()])], 'questions.json', {
        type: 'application/json',
      }),
      JSON.stringify([createStructuredRow()])
    );

    fireEvent.change(screen.getByLabelText('Upload question file'), {
      target: {
        files: [jsonFile],
      },
    });

    expect(await screen.findByText(/Structured question mode detected/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Validate rows' }));

    expect(await screen.findByText('1 valid rows · 0 invalid rows')).toBeInTheDocument();
  });

  it('accepts pasted JSON, imports only valid rows with row-level progress, and downloads a CSV error report', async () => {
    const firstImport = createDeferred<void>();
    const secondImport = createDeferred<void>();

    saveQuestionWithOptionsMock
      .mockImplementationOnce(() => firstImport.promise)
      .mockImplementationOnce(() => secondImport.promise);

    const { user, onComplete } = renderWizard();
    const pastedRows = [
      createStructuredRow({
        questionText: 'Which article guarantees equality before law?',
        displayOrder: 1,
      }),
      createStructuredRow({
        questionText: 'Which writ protects liberty?',
        explanation: 'Habeas corpus protects liberty.',
        displayOrder: 2,
      }),
      createStructuredRow({
        questionText: 'Invalid row with no correct answer',
        displayOrder: 3,
        options: [
          { optionText: 'Article 14', isCorrect: false, displayOrder: 1 },
          { optionText: 'Article 19', isCorrect: false, displayOrder: 2 },
        ],
      }),
    ];

    fireEvent.change(screen.getByLabelText('Paste question JSON'), {
      target: {
        value: JSON.stringify(pastedRows, null, 2),
      },
    });

    await user.click(screen.getByRole('button', { name: 'Load pasted JSON' }));
    expect(await screen.findByText(/Structured question mode detected/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Validate rows' }));

    expect(await screen.findByText('2 valid rows · 1 invalid rows')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /only import valid rows/i })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Start import' }));

    await waitFor(() => {
      expect(screen.getAllByText('running').length).toBe(2);
    });

    firstImport.resolve();
    secondImport.reject(new Error('Row import failed'));

    expect(await screen.findByText('1 imported · 1 failed')).toBeInTheDocument();
    expect(saveQuestionWithOptionsMock).toHaveBeenCalledTimes(2);
    expect(saveQuestionWithOptionsMock).toHaveBeenNthCalledWith(
      1,
      null,
      expect.objectContaining({
        quizId: 11,
        questionText: 'Which article guarantees equality before law?',
      })
    );
    expect(saveQuestionWithOptionsMock).toHaveBeenNthCalledWith(
      2,
      null,
      expect.objectContaining({
        quizId: 11,
        questionText: 'Which writ protects liberty?',
      })
    );
    expect(onComplete).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Download error report' }));

    expect(downloadTextFileMock).toHaveBeenCalledWith(
      'nyaya-import-errors.csv',
      expect.stringContaining('Row import failed'),
      'text/csv;charset=utf-8'
    );
  });
});
