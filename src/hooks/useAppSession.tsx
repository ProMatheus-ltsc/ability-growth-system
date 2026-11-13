/**
 * 应用级会话上下文
 * - 学段/学科偏好(个人使用)
 * - 当前工作学生(教师使用)
 * - 首次使用完成标记
 */
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { GradeLevel, Subject } from '../domain/types';
import { getMeta, setActiveDataScope, setMeta } from '../services/localDB';
import { fetchProfile, updateProfile } from '../services/d1Client';
import type { UserProfile, UserRole } from '../domains/shared/scope';
import { SUBJECT_MATRIX } from '../domain/types';

export type Role = UserRole;

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

/** 服务端偏好为准；学段变化时把学科选择裁剪到新学段，避免残留跨域学科 */
function withServerProfile(local: AppPreferences, profile: UserProfile): AppPreferences {
  if (local.role === profile.role && local.gradeLevel === profile.gradeLevel) return local;
  const subjects =
    profile.role === 'student'
      ? (() => {
          const allowed = SUBJECT_MATRIX[profile.gradeLevel];
          const kept = local.subjects.filter((subject) => allowed.includes(subject));
          return kept.length > 0 ? kept : allowed;
        })()
      : local.subjects;
  return { ...local, role: profile.role, gradeLevel: profile.gradeLevel, subjects };
}

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
        let local = stored ? { ...DEFAULT_PREFS, ...stored } : DEFAULT_PREFS;
        if (cancelled) return;
        applyPrefs(local);
        try {
          const profile = await fetchProfile();
          if (cancelled) return;
          if (!profile.profileInitialized) {
            // 老账户首次上线：把本地已完成的引导设置推给服务端，避免角色/学段回退
            if (local.onboardingDone) {
              const saved = await updateProfile({ role: local.role, gradeLevel: local.gradeLevel });
              local = withServerProfile(local, saved);
              applyPrefs(local);
              await setMeta(PREF_KEY, local);
            }
          } else {
            local = withServerProfile(local, profile);
            applyPrefs(local);
            await setMeta(PREF_KEY, local);
          }
        } catch {
          // 会话失效或网络异常时先按本地偏好运行，服务端仍会在请求层做最终过滤
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setActiveDataScope(undefined);
    };
  }, [applyPrefs]);

  const setPrefs = useCallback(
    async (next: Partial<AppPreferences>) => {
      const merged = { ...prefsRef.current, ...next };
      applyPrefs(merged);
      await setMeta(PREF_KEY, merged);
      if (next.role !== undefined || next.gradeLevel !== undefined) {
        try {
          await updateProfile({ role: merged.role, gradeLevel: merged.gradeLevel });
        } catch {
          // 失败已由全局错误提示上报；本地偏好保留，下次保存会重试
        }
      }
    },
    [applyPrefs],
  );

  const finishOnboarding = useCallback(
    async (base: Omit<AppPreferences, 'onboardingDone'>) => {
      const merged: AppPreferences = { ...base, onboardingDone: true };
      applyPrefs(merged);
      await setMeta(PREF_KEY, merged);
      try {
        await updateProfile({ role: merged.role, gradeLevel: merged.gradeLevel });
      } catch {
        // 引导完成不应因为偏好同步失败而中断
      }
    },
    [applyPrefs],
  );

  return (
    <Ctx.Provider value={{ loading, prefs, setPrefs, finishOnboarding }}>{children}</Ctx.Provider>
  );
}

export function useAppSession(): AppSessionContextType {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppSession 必须在 AppSessionProvider 内使用');
  return v;
}
