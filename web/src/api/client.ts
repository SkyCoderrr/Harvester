import type { ApiResponse } from '@shared/types';
import { useAuthStore } from '../store/auth';

export class HarvesterClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly user_message: string,
    public readonly details?: unknown,
  ) {
    super(user_message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) ?? {}) };
  if (init?.body != null) headers['Content-Type'] = 'application/json';
  const token = useAuthStore.getState().token;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });

  if (res.status === 401) {
    useAuthStore.getState().openLogin();
    throw new HarvesterClientError(
      'AUTH_UNAUTHENTICATED',
      'This Harvester instance requires a password.',
    );
  }
  if (res.status === 429) {
    const retry = res.headers.get('Retry-After');
    throw new HarvesterClientError(
      'AUTH_RATE_LIMITED',
      `Too many failed sign-in attempts. Try again in ${retry ?? '300'}s.`,
    );
  }

  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new HarvesterClientError('INTERNAL', `HTTP ${res.status} without JSON body`);
  }
  if (!body.ok) {
    throw new HarvesterClientError(body.error.code, body.error.user_message, body.error.details);
  }
  return body.data;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { method: 'GET' });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
  del<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { method: 'DELETE' });
  },
};
