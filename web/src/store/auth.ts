import { create } from 'zustand';

const TOKEN_KEY = 'harvester:auth-token';

interface AuthStore {
  token: string | null;
  loginOpen: boolean;
  setToken(token: string | null): void;
  openLogin(): void;
  closeLogin(): void;
}

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: loadToken(),
  loginOpen: false,
  setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    set({ token });
  },
  openLogin() {
    set({ loginOpen: true });
  },
  closeLogin() {
    set({ loginOpen: false });
  },
}));
