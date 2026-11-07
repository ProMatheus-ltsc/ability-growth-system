/**
 * 应用级会话上下文
 * - 学段/学科偏好(个人使用)
 * - 当前工作学生(教师使用)
 * - 首次使用完成标记
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { GradeLevel, Subject } from '../domain/types';
import { getMeta, setMeta } from '../services/localDB';
import { SUBJECT_MATRIX } from '../domain/types';

export type Role = 'student' | 'teacher';

export interface AppPreferences {
  role: Role;
  gradeLevel: GradeLevel;
  subjects: Subject[];
  currentStudentId?: string;
  onboardingDone?: boolean;
  /** §25 能力基线是否已建立(至少完成第一次训练) */
  baselineEstablished?: boolean;
  baselineEstablishedAt?: string;
}

const DEFAULT_PREFS: AppPreferences = {
  role: 'student',
  gradeLevel: 'adult',
  subjects: SUBJECT_MATRIX.adult,
  onboardingDone: false,
};

const PREF_KEY = 'app-preferences';

interface AppSessionContextType {
  loading: boolean;
  prefs: AppPreferences;
  setPrefs: (next: Partial<AppPreferences>) => Promise<void>;
  finishOnboarding: (base: Omit<AppPreferences, 'onboardingDone'>) => Promise<void>;
}

const Ctx = createContext<AppSessionContextType | null>(null);

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefsState] = useState<AppPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getMeta<AppPreferences | null>(PREF_KEY, null);
        if (!cancelled && stored) setPrefsState({ ...DEFAULT_PREFS, ...stored });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback(async (next: Partial<AppPreferences>) => {
    setPrefsState((prev) => {
      const merged = { ...prev, ...next };
      void setMeta(PREF_KEY, merged);
      return merged;
    });
  }, []);

  const finishOnboarding = useCallback(async (base: Omit<AppPreferences, 'onboardingDone'>) => {
    const merged: AppPreferences = { ...base, onboardingDone: true };
    setPrefsState(merged);
    await setMeta(PREF_KEY, merged);
  }, []);

  return (
    <Ctx.Provider value={{ loading, prefs, setPrefs, finishOnboarding }}>{children}</Ctx.Provider>
  );
}

export function useAppSession(): AppSessionContextType {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppSession 必须在 AppSessionProvider 内使用');
  return v;
}
