import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ConfirmProvider } from '@/app/providers/ConfirmProvider';
import { LegalUpdatesPage } from '@/features/content/LegalUpdatesPage';
import { LegalUpdate } from '@/lib/types';
import * as contentApi from '@/features/content/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/content/api', () => ({
  getLegalUpdates: vi.fn(),
  saveLegalUpdate: vi.fn(),
  uploadLegalUpdateImage: vi.fn(),
  deleteLegalUpdate: vi.fn(),
}));

const judgement: LegalUpdate = {
  id: 4,
  category: 'Judgements',
  title: 'Supreme Court clarifies Zero FIR rules',
  summary: 'Police must register and transfer.',
  updateDate: '2026-10-01',
  source: 'Supreme Court of India',
  imageUrl: '/uploads/legal-updates/abc.png',
  createdAt: '2026-10-01T10:00:00.000Z',
};

const notice: LegalUpdate = {
  id: 5,
  category: 'Notices',
  title: 'Court holiday list published',
  summary: null,
  updateDate: '2026-09-20',
  source: null,
  imageUrl: null,
  createdAt: '2026-09-20T10:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const user = userEvent.setup();

  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <LegalUpdatesPage />
      </ConfirmProvider>
    </QueryClientProvider>
  );

  return { user };
}

describe('LegalUpdatesPage', () => {
  beforeAll(() => {
    // jsdom has no object URLs; the image preview only needs a string back.
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists updates and filters them by category', async () => {
    vi.mocked(contentApi.getLegalUpdates).mockResolvedValue([judgement, notice]);
    const { user } = renderPage();

    expect(await screen.findByText(judgement.title)).toBeInTheDocument();
    expect(screen.getByText(notice.title)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by category'), 'Notices');
    expect(screen.queryByText(judgement.title)).not.toBeInTheDocument();
    expect(screen.getByText(notice.title)).toBeInTheDocument();
  });

  it('publishes a new update, then uploads the chosen image to it', async () => {
    vi.mocked(contentApi.getLegalUpdates).mockResolvedValue([]);
    vi.mocked(contentApi.saveLegalUpdate).mockResolvedValue({ ...notice, id: 9 });
    vi.mocked(contentApi.uploadLegalUpdateImage).mockResolvedValue({ ...notice, id: 9 });
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add legal update' }));
    await user.selectOptions(screen.getByDisplayValue('Judgements'), 'Legislation');
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    await user.clear(dateInput);
    await user.type(dateInput, '2026-10-05');
    await user.type(screen.getByPlaceholderText(/Supreme Court upholds/), 'New data protection rules notified');
    await user.type(screen.getByPlaceholderText('Supreme Court of India'), 'Gazette of India');

    const file = new File(['png'], 'cover.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload image'), file);

    const submit = screen.getByRole('button', { name: 'Publish update' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(contentApi.uploadLegalUpdateImage).toHaveBeenCalledWith(9, file));
    expect(contentApi.saveLegalUpdate).toHaveBeenCalledWith(null, {
      category: 'Legislation',
      title: 'New data protection rules notified',
      summary: null,
      updateDate: '2026-10-05',
      source: 'Gazette of India',
    });
    expect(toast.success).toHaveBeenCalledWith('Legal update published.');
  });

  it('clears the image when editing and choosing "Remove image"', async () => {
    vi.mocked(contentApi.getLegalUpdates).mockResolvedValue([judgement]);
    vi.mocked(contentApi.saveLegalUpdate).mockResolvedValue({ ...judgement, imageUrl: null });
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Remove image' }));

    const submit = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(contentApi.saveLegalUpdate).toHaveBeenCalled());
    const [id, payload] = vi.mocked(contentApi.saveLegalUpdate).mock.calls[0];
    expect(id).toBe(4);
    expect(payload).toMatchObject({ title: judgement.title, imageUrl: null });
    expect(contentApi.uploadLegalUpdateImage).not.toHaveBeenCalled();
  });

  it('keeps the saved update and says so when only the image upload fails', async () => {
    vi.mocked(contentApi.getLegalUpdates).mockResolvedValue([notice]);
    vi.mocked(contentApi.saveLegalUpdate).mockResolvedValue(notice);
    vi.mocked(contentApi.uploadLegalUpdateImage).mockRejectedValue(new Error('File too large'));
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.upload(screen.getByLabelText('Upload image'), new File(['x'], 'big.png', { type: 'image/png' }));
    const submit = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/Update saved, but the image failed to upload/);
  });
});
