import axios from 'axios';
import { API_BASE_URL } from '@/lib/config';
import { getAuthBridge } from '@/lib/auth-bridge';

export const rawClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

httpClient.interceptors.request.use((config) => {
  const token = getAuthBridge().getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.headers['X-Request-Id'] = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const responseStatus = error.response?.status;
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || '');

    if (
      responseStatus !== 401 ||
      originalRequest._retry ||
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/logout')
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const accessToken = await getAuthBridge().refreshSession();

    if (!accessToken) {
      getAuthBridge().handleSessionExpired();
      return Promise.reject(error);
    }

    originalRequest.headers = {
      ...(originalRequest.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    };

    return httpClient(originalRequest);
  }
);
