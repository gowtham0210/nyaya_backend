import { rawClient } from '@/lib/http-client';
import { User } from '@/lib/types';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt?: string;
  user: User;
};

type RefreshResponse = {
  accessToken: string | null;
  refreshToken: string | null;
  refreshTokenExpiresAt?: string | null;
};

export async function loginRequest(payload: { email: string; password: string }) {
  const response = await rawClient.post<LoginResponse>('/auth/login', payload);
  return response.data;
}

export async function refreshRequest() {
  const response = await rawClient.post<RefreshResponse>('/auth/refresh', {});
  return response.data;
}

export async function meRequest(accessToken: string) {
  const response = await rawClient.get<User>('/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response.data;
}

export async function logoutRequest(accessToken: string | null) {
  await rawClient.post(
    '/auth/logout',
    {},
    accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined
  );
}
