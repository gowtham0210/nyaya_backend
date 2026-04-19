import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { loginRequest, logoutRequest, meRequest, refreshRequest } from '@/features/auth/api';
import { registerAuthBridge } from '@/lib/auth-bridge';
import { queryClient } from '@/lib/query-client';
import { decodeJwtPayload, getTokenExpiryMs } from '@/lib/jwt';
import { User } from '@/lib/types';

type AuthStatus = 'booting' | 'authenticated' | 'anonymous';

type SessionState = {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
  role: string | null;
};

type LoginPayload = {
  email: string;
  password: string;
};

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  role: string | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  loginWithManualToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<SessionState>({
    status: 'booting',
    accessToken: null,
    user: null,
    role: null,
  });
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const clearSession = useCallback(
    (reason?: 'session_expired') => {
      accessTokenRef.current = null;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      setSession({
        status: 'anonymous',
        accessToken: null,
        user: null,
        role: null,
      });
      queryClient.clear();

      if (reason === 'session_expired') {
        toast.error('Your admin session expired. Please sign in again.');
        navigate('/login?reason=session_expired', {
          replace: true,
          state: { from: location.pathname + location.search },
        });
        return;
      }

      navigate('/login', { replace: true });
    },
    [location.pathname, location.search, navigate]
  );

  const applySession = useCallback((accessToken: string, user: User) => {
    const role = decodeJwtPayload(accessToken)?.role || 'user';
    accessTokenRef.current = accessToken;
    setSession({
      status: 'authenticated',
      accessToken,
      user,
      role,
    });
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const response = await refreshRequest();
        if (!response.accessToken) {
          return null;
        }

        accessTokenRef.current = response.accessToken;
        setSession((currentValue) => ({
          ...currentValue,
          status: 'authenticated',
          accessToken: response.accessToken,
          role: decodeJwtPayload(response.accessToken)?.role || currentValue.role,
        }));
        return response.accessToken;
      } catch (error) {
        clearSession('session_expired');
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [clearSession]);

  useEffect(() => {
    registerAuthBridge({
      getAccessToken: () => accessTokenRef.current,
      refreshSession,
      handleSessionExpired: () => clearSession('session_expired'),
    });
  }, [clearSession, refreshSession]);

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const refreshResponse = await refreshRequest();
        if (ignore) {
          return;
        }

        if (!refreshResponse.accessToken) {
          setSession({
            status: 'anonymous',
            accessToken: null,
            user: null,
            role: null,
          });
          return;
        }

        accessTokenRef.current = refreshResponse.accessToken;
        const user = await meRequest(refreshResponse.accessToken);

        if (!ignore) {
          applySession(refreshResponse.accessToken, user);
        }
      } catch (error) {
        if (!ignore) {
          setSession({
            status: 'anonymous',
            accessToken: null,
            user: null,
            role: null,
          });
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [applySession]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!session.accessToken) {
      return;
    }

    const refreshDelay = getTokenExpiryMs(session.accessToken) - Date.now() - 60_000;

    if (refreshDelay <= 0) {
      refreshSession();
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshSession();
    }, refreshDelay);

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refreshSession, session.accessToken]);

  const login = useCallback(
    async ({ email, password }: LoginPayload) => {
      const response = await loginRequest({ email, password });
      applySession(response.accessToken, response.user);
      toast.success(`Welcome back, ${response.user.fullName}.`);
    },
    [applySession]
  );

  const loginWithManualToken = useCallback(
    async (token: string) => {
      const user = await meRequest(token);
      applySession(token, user);
      toast.success('Manual admin token accepted.');
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest(accessTokenRef.current);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      status: session.status,
      user: session.user,
      role: session.role,
      accessToken: session.accessToken,
      isAuthenticated: session.status === 'authenticated',
      login,
      loginWithManualToken,
      logout,
      refreshSession,
    }),
    [login, logout, refreshSession, session]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}

export function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation();
  const auth = useAuth();

  if (auth.status === 'booting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-3xl border border-slate-200 bg-white px-8 py-6 shadow-panel">
          <p className="text-sm font-medium text-slate-500">Restoring your admin session...</p>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}

export function RequireAdmin({ children }: PropsWithChildren) {
  const auth = useAuth();

  if (auth.status === 'booting') {
    return null;
  }

  if (auth.role !== 'admin') {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
}
