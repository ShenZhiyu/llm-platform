import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { backendApi } from './services/backendApi';
import { readStore, writeStore } from './stores/localStore';
import type { Model, Role, User } from './types/domain';

interface AppContextType {
  isAuthenticated: boolean;
  authLoading: boolean;
  user: User | null;
  userRole: Role;
  setUserRole: (role: Role) => void;
  currentModel: Model;
  setCurrentModel: (model: Model) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const USER_KEY = 'llm-platform:user';
const MODEL_KEY = 'llm-platform:model';

export const roles: Role[] = ['科研人员', '知识库管理员', '授权管理员', '运维账号'];
export const models: Model[] = ['Qwen3-30B-A3B-w8a8', 'Qwen3-VL-8B-Instruct'];

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStore<User | null>(USER_KEY, null));
  const [authLoading, setAuthLoading] = useState(true);
  const [currentModel, setCurrentModelState] = useState<Model>(() => readStore<Model>(MODEL_KEY, 'Qwen3-30B-A3B-w8a8'));

  useEffect(() => {
    let active = true;
    backendApi
      .me()
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        writeStore(USER_KEY, nextUser);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        writeStore(USER_KEY, null);
        backendApi.setToken(null);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const userRole = user?.role ?? '科研人员';

  const setCurrentModel = (model: Model) => {
    setCurrentModelState(model);
    writeStore(MODEL_KEY, model);
  };

  const setUserRole = (role: Role) => {
    if (!user) return;
    const nextUser = { ...user, role };
    setUser(nextUser);
    writeStore(USER_KEY, nextUser);
  };

  const login = async (username: string, password: string) => {
    const nextUser = await backendApi.login(username, password);
    setUser(nextUser);
    writeStore(USER_KEY, nextUser);
  };

  const logout = async () => {
    await backendApi.logout();
    setUser(null);
    writeStore(USER_KEY, null);
  };

  const value = useMemo<AppContextType>(
    () => ({
      isAuthenticated: Boolean(user),
      authLoading,
      user,
      userRole,
      setUserRole,
      currentModel,
      setCurrentModel,
      login,
      logout,
    }),
    [authLoading, user, userRole, currentModel],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
}
