import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@/app/providers/ConfirmProvider';
import { CategoriesPage } from '@/features/content/CategoriesPage';
import { Category } from '@/lib/types';
import * as contentApi from '@/features/content/api';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/content/api', () => ({
  bulkDeleteCategories: vi.fn(),
  bulkUpdateCategoryStatus: vi.fn(),
  getCategories: vi.fn(),
  saveCategory: vi.fn(),
  deactivateCategory: vi.fn(),
}));

const activeCategory: Category = {
  id: 1,
  name: 'Constitutional Law',
  slug: 'constitutional-law',
  description: 'Foundational rights and duties',
  isActive: true,
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-21T10:00:00.000Z',
};

const inactiveCategory: Category = {
  id: 2,
  name: 'Archived Case Law',
  slug: 'archived-case-law',
  description: 'Legacy precedent references',
  isActive: false,
  createdAt: '2026-04-18T10:00:00.000Z',
  updatedAt: '2026-04-19T10:00:00.000Z',
};

const secondActiveCategory: Category = {
  id: 3,
  name: 'Administrative Law',
  slug: 'administrative-law',
  description: 'Delegated legislation and tribunals',
  isActive: true,
  createdAt: '2026-04-17T10:00:00.000Z',
  updatedAt: '2026-04-22T10:00:00.000Z',
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderCategoriesPage() {
  const queryClient = createQueryClient();
  const user = userEvent.setup();

  return {
    user,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <CategoriesPage />
        </ConfirmProvider>
      </QueryClientProvider>
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('CategoriesPage', () => {
  it('shows a loading state before categories arrive', async () => {
    let resolveRequest: ((value: Category[]) => void) | undefined;
    const pendingRequest = new Promise<Category[]>((resolve) => {
      resolveRequest = resolve;
    });

    vi.mocked(contentApi.getCategories).mockReturnValue(pendingRequest as never);

    renderCategoriesPage();

    expect(screen.getByText('Loading categories...')).toBeInTheDocument();

    resolveRequest?.([activeCategory]);

    await waitFor(() => {
      expect(screen.queryByText('Loading categories...')).not.toBeInTheDocument();
    });
  });

  it('lists categories, searches locally, and toggles inactive visibility', async () => {
    vi.mocked(contentApi.getCategories).mockImplementation(async (showInactive = false) =>
      showInactive ? [activeCategory, inactiveCategory] : [activeCategory]
    );

    const { user } = renderCategoriesPage();

    await screen.findByText('Constitutional Law');
    expect(screen.queryByText('Archived Case Law')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search categories'), 'rights');
    expect(screen.getByText('Constitutional Law')).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Search categories'));
    await user.click(screen.getByRole('checkbox', { name: /show inactive/i }));

    await screen.findByText('Archived Case Law');
    expect(vi.mocked(contentApi.getCategories)).toHaveBeenLastCalledWith(true);

    await user.clear(screen.getByPlaceholderText('Search categories'));
    await user.type(screen.getByPlaceholderText('Search categories'), 'legacy');

    expect(screen.getByText('Archived Case Law')).toBeInTheDocument();
    expect(screen.queryByText('Constitutional Law')).not.toBeInTheDocument();
  });

  it('creates a category, supports slug generation, and loads existing values for editing', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([activeCategory]);
    vi.mocked(contentApi.saveCategory).mockResolvedValue(activeCategory);

    const { user, queryClient } = renderCategoriesPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Constitutional Law');

    await user.click(screen.getByRole('button', { name: 'Create category' }));
    await user.type(screen.getByLabelText('Category name'), 'Public Policy');
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(screen.getByLabelText(/slug/i)).toHaveValue('public-policy');

    await user.type(screen.getByLabelText(/description/i), 'Policy design and public administration');
    await user.click(screen.getAllByRole('button', { name: 'Create category' }).at(-1)!);

    await waitFor(() => {
      expect(contentApi.saveCategory).toHaveBeenCalledWith(null, {
        name: 'Public Policy',
        slug: 'public-policy',
        description: 'Policy design and public administration',
        isActive: true,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories'] });

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByDisplayValue('Constitutional Law')).toBeInTheDocument();
    expect(screen.getByDisplayValue('constitutional-law')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Foundational rights and duties')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/category name/i));
    await user.type(screen.getByLabelText(/category name/i), 'Constitutional Law Updated');
    await user.click(screen.getByRole('button', { name: 'Update category' }));

    await waitFor(() => {
      expect(contentApi.saveCategory).toHaveBeenCalledWith(1, {
        name: 'Constitutional Law Updated',
        slug: 'constitutional-law',
        description: 'Foundational rights and duties',
        isActive: true,
      });
    });
  });

  it('requires confirmation before deactivating and invalidates related queries after approval', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([activeCategory]);
    vi.mocked(contentApi.deactivateCategory).mockResolvedValue(undefined);

    const { user, queryClient } = renderCategoriesPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Constitutional Law');

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByText('Deactivate "Constitutional Law"?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(contentApi.deactivateCategory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(screen.getByRole('button', { name: 'Deactivate category' }));

    await waitFor(() => {
      expect(vi.mocked(contentApi.deactivateCategory).mock.calls[0]?.[0]).toBe(1);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
  });

  it('supports selecting visible categories and bulk deleting them after confirmation', async () => {
    vi.mocked(contentApi.getCategories).mockResolvedValue([activeCategory, secondActiveCategory]);
    vi.mocked(contentApi.bulkDeleteCategories).mockResolvedValue({
      successIds: [1, 3],
      failures: [],
    });

    const { user, queryClient } = renderCategoriesPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Administrative Law');

    await user.click(screen.getByRole('checkbox', { name: 'Select all visible categories' }));

    expect(screen.getByText('2 categories selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(screen.getByText('Delete 2 categories?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(contentApi.bulkDeleteCategories).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete categories' }));

    await waitFor(() => {
      expect(contentApi.bulkDeleteCategories).toHaveBeenCalledWith([1, 3]);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });
  });

  it('updates the status of selected categories in bulk', async () => {
    vi.mocked(contentApi.getCategories).mockImplementation(async (showInactive = false) =>
      showInactive ? [activeCategory, inactiveCategory, secondActiveCategory] : [activeCategory, secondActiveCategory]
    );
    vi.mocked(contentApi.bulkUpdateCategoryStatus).mockResolvedValue({
      successIds: [1, 2],
      failures: [],
    });

    const { user, queryClient } = renderCategoriesPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Constitutional Law');
    await user.click(screen.getByRole('checkbox', { name: /show inactive/i }));
    await screen.findByText('Archived Case Law');

    await user.click(screen.getByRole('checkbox', { name: 'Select Constitutional Law' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Archived Case Law' }));
    await user.click(screen.getByRole('button', { name: 'Mark active' }));

    await waitFor(() => {
      expect(contentApi.bulkUpdateCategoryStatus).toHaveBeenCalledWith([1, 2], true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['categories'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['quizzes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary'] });
  });
});
