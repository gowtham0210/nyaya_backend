import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { bulkQuestionSchema, bulkTemplateQuestions } from '@/features/content/schemas';
import { saveQuestionWithOptions } from '@/features/content/api';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { createCsv, downloadTextFile, getErrorMessage } from '@/lib/utils';

const mappingFields = [
  ['questionText', 'Question text'],
  ['questionType', 'Question type'],
  ['explanation', 'Explanation'],
  ['difficulty', 'Difficulty'],
  ['pointsReward', 'Points reward'],
  ['negativePoints', 'Negative points'],
  ['displayOrder', 'Display order'],
  ['isActive', 'Is active'],
  ['option1Text', 'Option 1 text'],
  ['option1Correct', 'Option 1 correct'],
  ['option2Text', 'Option 2 text'],
  ['option2Correct', 'Option 2 correct'],
  ['option3Text', 'Option 3 text'],
  ['option3Correct', 'Option 3 correct'],
  ['option4Text', 'Option 4 text'],
  ['option4Correct', 'Option 4 correct'],
] as const;

type MappingKey = (typeof mappingFields)[number][0];
type ValidationRow = {
  index: number;
  rawRow: Record<string, unknown>;
  normalizedQuestion?: any;
  status: 'valid' | 'invalid';
  errors: string[];
};

type ImportStatus = {
  index: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  message: string;
};

type BulkImportWizardProps = {
  open: boolean;
  quizId: number;
  onClose: () => void;
  onComplete: () => Promise<void> | void;
};

const defaultMapping = {
  questionText: 'questionText',
  questionType: 'questionType',
  explanation: 'explanation',
  difficulty: 'difficulty',
  pointsReward: 'pointsReward',
  negativePoints: 'negativePoints',
  displayOrder: 'displayOrder',
  isActive: 'isActive',
  option1Text: 'option1Text',
  option1Correct: 'option1Correct',
  option2Text: 'option2Text',
  option2Correct: 'option2Correct',
  option3Text: 'option3Text',
  option3Correct: 'option3Correct',
  option4Text: 'option4Text',
  option4Correct: 'option4Correct',
} as Record<MappingKey, string>;

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(normalized);
}

function flattenTemplateForCsv() {
  return bulkTemplateQuestions.map((question) => ({
    questionText: question.questionText,
    questionType: question.questionType,
    explanation: question.explanation,
    difficulty: question.difficulty,
    pointsReward: question.pointsReward,
    negativePoints: question.negativePoints,
    displayOrder: question.displayOrder,
    isActive: question.isActive,
    option1Text: question.options[0]?.optionText || '',
    option1Correct: question.options[0]?.isCorrect || false,
    option2Text: question.options[1]?.optionText || '',
    option2Correct: question.options[1]?.isCorrect || false,
    option3Text: question.options[2]?.optionText || '',
    option3Correct: question.options[2]?.isCorrect || false,
    option4Text: question.options[3]?.optionText || '',
    option4Correct: question.options[3]?.isCorrect || false,
  }));
}

export function BulkImportWizard({ open, quizId, onClose, onComplete }: BulkImportWizardProps) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [sourceRows, setSourceRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<MappingKey, string>>(defaultMapping);
  const [structuredMode, setStructuredMode] = useState(false);
  const [manualJson, setManualJson] = useState('');
  const [validationRows, setValidationRows] = useState<ValidationRow[]>([]);
  const [onlyImportValidRows, setOnlyImportValidRows] = useState(true);
  const [importStatuses, setImportStatuses] = useState<ImportStatus[]>([]);
  const [importing, setImporting] = useState(false);

  const validRows = useMemo(
    () => validationRows.filter((row) => row.status === 'valid' && row.normalizedQuestion),
    [validationRows]
  );

  async function parseInputFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    setFileName(file.name);

    if (extension === 'csv') {
      const Papa = (await import('papaparse')).default;
      const text = await file.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      setStructuredMode(false);
      setSourceRows(parsed.data);
      setColumns(Object.keys(parsed.data[0] || {}));
      setStep(2);
      return;
    }

    if (extension === 'xlsx' || extension === 'xls') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      setStructuredMode(false);
      setSourceRows(rows);
      setColumns(Object.keys(rows[0] || {}));
      setStep(2);
      return;
    }

    if (extension === 'json') {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        throw new Error('JSON files must contain an array of questions or row objects.');
      }

      const isStructured = Boolean(parsed[0]?.options);
      setStructuredMode(isStructured);
      setSourceRows(parsed);
      setColumns(Object.keys(parsed[0] || {}));
      setStep(2);
      return;
    }

    throw new Error('Use CSV, XLSX, or JSON files for bulk import.');
  }

  function normalizeStructuredRow(row: Record<string, unknown>, index: number) {
    return {
      questionText: String(row.questionText || '').trim(),
      questionType: String(row.questionType || 'single_choice'),
      explanation: String(row.explanation || ''),
      difficulty: String(row.difficulty || 'medium'),
      pointsReward: Number(row.pointsReward ?? 10),
      negativePoints: Number(row.negativePoints ?? 0),
      displayOrder: Number(row.displayOrder ?? index + 1),
      isActive: row.isActive === undefined ? true : normalizeBoolean(row.isActive),
      options: Array.isArray(row.options)
        ? row.options.map((option: any, optionIndex: number) => ({
            optionText: String(option.optionText || '').trim(),
            isCorrect: normalizeBoolean(option.isCorrect),
            displayOrder: Number(option.displayOrder ?? optionIndex + 1),
          }))
        : [],
    };
  }

  function normalizeMappedRow(row: Record<string, unknown>, index: number) {
    const getField = (key: MappingKey) => {
      const mappedColumn = mapping[key];
      return mappedColumn ? row[mappedColumn] : undefined;
    };

    const options = [1, 2, 3, 4]
      .map((optionNumber) => {
        const optionText = getField(`option${optionNumber}Text` as MappingKey);
        const isCorrect = getField(`option${optionNumber}Correct` as MappingKey);

        if (!String(optionText || '').trim()) {
          return null;
        }

        return {
          optionText: String(optionText || '').trim(),
          isCorrect: normalizeBoolean(isCorrect),
          displayOrder: optionNumber,
        };
      })
      .filter(Boolean);

    return {
      questionText: String(getField('questionText') || '').trim(),
      questionType: String(getField('questionType') || 'single_choice'),
      explanation: String(getField('explanation') || ''),
      difficulty: String(getField('difficulty') || 'medium'),
      pointsReward: Number(getField('pointsReward') ?? 10),
      negativePoints: Number(getField('negativePoints') ?? 0),
      displayOrder: Number(getField('displayOrder') ?? index + 1),
      isActive: getField('isActive') === undefined ? true : normalizeBoolean(getField('isActive')),
      options,
    };
  }

  function validateRows() {
    const nextValidationRows = sourceRows.map((row, index) => {
      const normalizedQuestion = structuredMode
        ? normalizeStructuredRow(row, index)
        : normalizeMappedRow(row, index);
      const result = bulkQuestionSchema.safeParse(normalizedQuestion);

      if (result.success) {
        return {
          index: index + 1,
          rawRow: row,
          normalizedQuestion: result.data,
          status: 'valid' as const,
          errors: [],
        };
      }

      return {
        index: index + 1,
        rawRow: row,
        status: 'invalid' as const,
        errors: result.error.issues.map((issue) => issue.message),
      };
    });

    setValidationRows(nextValidationRows);
    setStep(3);
  }

  async function importRows() {
    const targetRows = onlyImportValidRows ? validRows : validationRows.filter((row) => row.normalizedQuestion);

    if (!targetRows.length) {
      toast.error('There are no valid rows ready for import.');
      return;
    }

    setImporting(true);
    setStep(4);
    setImportStatuses(targetRows.map((row) => ({ index: row.index, status: 'pending', message: 'Queued' })));

    const queue = [...targetRows];
    const workers = Array.from({ length: Math.min(4, queue.length) }, () => worker());

    async function worker() {
      while (queue.length) {
        const row = queue.shift();

        if (!row?.normalizedQuestion) {
          continue;
        }

        setImportStatuses((current) =>
          current.map((status) =>
            status.index === row.index ? { ...status, status: 'running', message: 'Importing' } : status
          )
        );

        try {
          await saveQuestionWithOptions(null, {
            quizId,
            ...row.normalizedQuestion,
          });

          setImportStatuses((current) =>
            current.map((status) =>
              status.index === row.index ? { ...status, status: 'success', message: 'Imported' } : status
            )
          );
        } catch (error) {
          setImportStatuses((current) =>
            current.map((status) =>
              status.index === row.index
                ? { ...status, status: 'failed', message: getErrorMessage(error) }
                : status
            )
          );
        }
      }
    }

    await Promise.all(workers);
    setImporting(false);
    await onComplete();
  }

  function resetWizard() {
    setStep(1);
    setFileName('');
    setSourceRows([]);
    setColumns([]);
    setMapping(defaultMapping);
    setStructuredMode(false);
    setManualJson('');
    setValidationRows([]);
    setOnlyImportValidRows(true);
    setImportStatuses([]);
    setImporting(false);
  }

  function closeWizard() {
    resetWizard();
    onClose();
  }

  function loadManualJson() {
    try {
      const parsed = JSON.parse(manualJson);

      if (!Array.isArray(parsed)) {
        throw new Error('The JSON must contain an array of rows.');
      }

      setStructuredMode(Boolean(parsed[0]?.options));
      setSourceRows(parsed);
      setColumns(Object.keys(parsed[0] || {}));
      setFileName('pasted-json');
      setStep(2);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  function downloadJsonTemplate() {
    downloadTextFile('nyaya-questions-template.json', JSON.stringify(bulkTemplateQuestions, null, 2), 'application/json');
  }

  function downloadCsvTemplate() {
    downloadTextFile('nyaya-questions-template.csv', createCsv(flattenTemplateForCsv()), 'text/csv;charset=utf-8');
  }

  function downloadErrorReport() {
    const failedRows = importStatuses
      .filter((status) => status.status === 'failed')
      .map((status) => ({
        row: status.index,
        message: status.message,
      }));
    downloadTextFile('nyaya-import-errors.csv', createCsv(failedRows), 'text/csv;charset=utf-8');
  }

  return (
    <Modal
      open={open}
      title="Bulk import wizard"
      description="Upload JSON, CSV, or XLSX files, validate every row, and import only the good records."
      onClose={closeWizard}
      widthClassName="max-w-6xl"
    >
      <div className="mt-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                step === item ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              Step {item}
            </div>
          ))}
        </div>

        {step === 1 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">1. Upload a file</p>
                <p className="mt-1 text-sm text-slate-500">
                  Use CSV, XLSX, or JSON. Structured JSON with `options[]` is auto-detected and skips most mapping work.
                </p>
              </div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];

                  if (!file) {
                    return;
                  }

                  try {
                    await parseInputFile(file);
                  } catch (error) {
                    toast.error(getErrorMessage(error));
                  }
                }}
              />
              <div className="flex gap-3">
                <Button variant="secondary" onClick={downloadCsvTemplate}>
                  Download CSV template
                </Button>
                <Button variant="secondary" onClick={downloadJsonTemplate}>
                  Download JSON template
                </Button>
              </div>
            </div>

            <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Paste JSON instead</p>
                <p className="mt-1 text-sm text-slate-500">
                  Useful when content editors already have question objects prepared in a script or spreadsheet export.
                </p>
              </div>
              <Textarea
                rows={12}
                value={manualJson}
                onChange={(event) => setManualJson(event.target.value)}
                placeholder={JSON.stringify(bulkTemplateQuestions, null, 2)}
              />
              <Button onClick={loadManualJson}>Load pasted JSON</Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">2. Map columns</p>
              <p className="mt-1 text-sm text-slate-500">
                File: <strong>{fileName}</strong> · {sourceRows.length} rows detected
              </p>
            </div>

            {structuredMode ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">
                Structured question mode detected. Your JSON already matches the question object shape, so no extra
                mapping is required. Move to validation when ready.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {mappingFields.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Select
                      value={mapping[key]}
                      onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))}
                    >
                      <option value="">Not mapped</option>
                      {columns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
            )}

            <div className="flex justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={validateRows}>Validate rows</Button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">3. Dry-run validation</p>
                <p className="mt-1 text-sm text-slate-500">
                  {validRows.length} valid rows · {validationRows.length - validRows.length} invalid rows
                </p>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-700">
                <Checkbox checked={onlyImportValidRows} onChange={(event) => setOnlyImportValidRows(event.target.checked)} />
                Only import valid rows
              </label>
            </div>

            {validationRows.length ? (
              <div className="max-h-[420px] overflow-auto rounded-3xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Row</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Question</th>
                      <th className="px-4 py-3 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {validationRows.map((row) => (
                      <tr key={row.index}>
                        <td className="px-4 py-3">{row.index}</td>
                        <td className="px-4 py-3">
                          <Badge tone={row.status === 'valid' ? 'success' : 'danger'}>{row.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {row.normalizedQuestion?.questionText || String(row.rawRow.questionText || '—')}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {row.errors.length ? row.errors.join(' • ') : 'Ready to import'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No rows validated yet"
                description="Upload a file, map the fields, and run validation to see row-by-row results."
              />
            )}

            <div className="flex justify-between gap-3">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={importRows}>Start import</Button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">4. Import execution</p>
                <p className="mt-1 text-sm text-slate-500">
                  {importStatuses.filter((status) => status.status === 'success').length} imported ·{' '}
                  {importStatuses.filter((status) => status.status === 'failed').length} failed
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={downloadErrorReport}
                  disabled={!importStatuses.some((status) => status.status === 'failed')}
                >
                  Download error report
                </Button>
                <Button variant="secondary" onClick={closeWizard} disabled={importing}>
                  Close
                </Button>
              </div>
            </div>

            {importStatuses.length ? (
              <div className="max-h-[420px] overflow-auto rounded-3xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Row</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importStatuses.map((status) => (
                      <tr key={status.index}>
                        <td className="px-4 py-3">{status.index}</td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              status.status === 'success'
                                ? 'success'
                                : status.status === 'failed'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {status.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{status.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Import not started yet"
                description="Move through validation first, then run the import to see live row statuses."
              />
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
