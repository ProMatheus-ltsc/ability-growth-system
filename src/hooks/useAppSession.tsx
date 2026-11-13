/**
 * 应用级会话上下文
 * - 学段/学科偏好(个人使用)
 * - 当前工作学生(教师使用)
 * - 首次使用完成标记
 */
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { GradeLevel, Subject } from '../domain/types';
import { getMeta, setActiveDataScope, setMeta } from '../services/localDB';
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
  const prefsRef = useRef(prefs);

  // scope 必须在子页面发起查询之前落到 localDB，否则首屏会按默认 adult 取一次数据
  const applyPrefs = useCallback((next: AppPreferences) => {
    prefsRef.current = next;
    setActiveDataScope({ role: next.role, gradeLevel: next.gradeLevel });
    setPrefsState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getMeta<AppPreferences | null>(PREF_KEY, null);
        if (cancelled) return;
        applyPrefs(stored ? { ...DEFAULT_PREFS, ...stored } : DEFAULT_PREFS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setActiveDataScope(undefined);
    };
  }, [applyPrefs]);

  const setPrefs = useCallback(async (next: Partial<AppPreferences>) => {
    const merged = { ...prefsRef.current, ...next };
    applyPrefs(merged);
    await setMeta(PREF_KEY, merged);
  }, [applyPrefs]);

  const finishOnboarding = useCallback(async (base: Omit<AppPreferences, 'onboardingDone'>) => {
    const merged: AppPreferences = { ...base, onboardingDone: true };
    applyPrefs(merged);
    await setMeta(PREF_KEY, merged);
  }, [applyPrefs]);

  return (
    <Ctx.Provider value={{ loading, prefs, setPrefs, finishOnboarding }}>{children}</Ctx.Provider>
  );
}

export function useAppSession(): AppSessionContextType {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppSession 必须在 AppSessionProvider 内使用');
  return v;
}
