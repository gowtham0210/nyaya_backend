import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { useAuth } from '@/app/providers/AuthProvider';
import { API_BASE_URL } from '@/lib/config';
import { formatDateTime } from '@/lib/utils';

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  cleanup();
});

describe('SettingsPage', () => {
  it('renders the current session snapshot and environment notes', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'authenticated',
      user: {
        id: 10,
        fullName: 'Asha Menon',
        email: 'asha@example.com',
        phone: null,
        status: 'active',
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-21T10:00:00.000Z',
      },
      role: 'admin',
    } as any);

    render(<SettingsPage />);

    expect(screen.getByText('Portal configuration')).toBeInTheDocument();
    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(screen.getByText('Asha Menon')).toBeInTheDocument();
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime('2026-04-01T10:00:00.000Z'))).toBeInTheDocument();
    expect(screen.getByText(API_BASE_URL)).toBeInTheDocument();
    expect(
      screen.getByText('Cookie-based refresh token rotation with in-memory access tokens')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Dashboard, Categories, Quizzes, Questions, Bulk Import, Levels, Leaderboards')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Users and Attempts remain behind backend admin endpoint dependencies.')
    ).toBeInTheDocument();
  });

  it('falls back safely when session fields are missing', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'authenticated',
      user: null,
      role: null,
    } as any);

    render(<SettingsPage />);

    expect(screen.getByText('authenticated')).toBeInTheDocument();
    expect(screen.getAllByText('Not available')).toHaveLength(3);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
