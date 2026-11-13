/**
 * 产品域 / 学段隔离的共享内核。
 *
 * 公考（adult）与 K12（primary/junior/senior）是两个产品域，学科集合不相交；
 * 但历史数据不一定带 gradeLevel（公考 abilities/gaps/exams 早期都没有），
 * 所以读侧按「显式学段 → 学科所属域 → 无归属按公考兜底」逐级回落：
 * - 公考历史记录按学科归到 adult，切换 K12 时绝不出现在页面上；
 * - K12 三个学段互相隔离，缺 gradeLevel 的 K12 记录无法归属，任何具体学段都不显示；
 * - 连学科都没有的历史记录（如早期阶段规划）只在 adult 可见，避免公考数据漏进 K12。
 */
import type { GradeLevel, Subject } from '../../domain/types';

export type ProductDomain = 'public-exam' | 'k12';

/**
 * 账户角色由服务端持有（users.role），不再只是前端视图：
 * - student：读写严格限制在自己的学段内；
 * - teacher：同一 workspace 内不按学段过滤。
 * workspace 仍按账户隔离，因此角色不是跨账户的提权边界。
 */
export type UserRole = 'student' | 'teacher';

export const USER_ROLES = ['student', 'teacher'] as const satisfies readonly UserRole[];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export interface UserProfile {
  role: UserRole;
  gradeLevel: GradeLevel;
  /** 服务端是否已收到过显式偏好；false 时客户端可用本地设置做一次引导同步 */
  profileInitialized: boolean;
}

export const GRADE_LEVELS = ['primary', 'junior', 'senior', 'adult'] as const satisfies readonly GradeLevel[];
export const K12_GRADE_LEVELS = ['primary', 'junior', 'senior'] as const satisfies readonly GradeLevel[];

export const PUBLIC_EXAM_SUBJECTS = ['xingce', 'shenlun', 'mianshi'] as const satisfies readonly Subject[];
export const K12_SUBJECTS = [
  'math',
  'physics',
  'chinese',
  'english',
  'chemistry',
  'biology',
] as const satisfies readonly Subject[];

const GRADE_LEVEL_SET = new Set<string>(GRADE_LEVELS);
const PUBLIC_EXAM_SUBJECT_SET = new Set<string>(PUBLIC_EXAM_SUBJECTS);
const K12_SUBJECT_SET = new Set<string>(K12_SUBJECTS);

export function isGradeLevel(value: unknown): value is GradeLevel {
  return typeof value === 'string' && GRADE_LEVEL_SET.has(value);
}

export function isK12GradeLevel(value: unknown): value is GradeLevel {
  return typeof value === 'string' && (K12_GRADE_LEVELS as readonly string[]).includes(value);
}

export function domainOfGradeLevel(gradeLevel: GradeLevel): ProductDomain {
  return gradeLevel === 'adult' ? 'public-exam' : 'k12';
}

export function domainOfSubject(subject: unknown): ProductDomain | undefined {
  if (typeof subject !== 'string') return undefined;
  if (PUBLIC_EXAM_SUBJECT_SET.has(subject)) return 'public-exam';
  if (K12_SUBJECT_SET.has(subject)) return 'k12';
  return undefined;
}

export function isPublicExamSubject(subject: unknown): boolean {
  return typeof subject === 'string' && PUBLIC_EXAM_SUBJECT_SET.has(subject);
}

export function isK12Subject(subject: unknown): boolean {
  return typeof subject === 'string' && K12_SUBJECT_SET.has(subject);
}

export interface ScopeAwareRecord {
  gradeLevel?: unknown;
  subject?: unknown;
}

/**
 * 记录的有效学段。
 * 学科与显式学段冲突时以学科所属域为准：公考学科永远回落到 adult，
 * K12 学科返回 undefined（只在 K12 内可见），避免脏学段字段把公考题带进 K12。
 */
export function resolveRecordGradeLevel(record: ScopeAwareRecord): GradeLevel | undefined {
  const explicit = isGradeLevel(record.gradeLevel) ? record.gradeLevel : undefined;
  const subjectDomain = domainOfSubject(record.subject);

  if (subjectDomain === 'public-exam') return 'adult';
  if (subjectDomain === 'k12') {
    return explicit && domainOfGradeLevel(explicit) === 'k12' ? explicit : undefined;
  }
  return explicit;
}

export function recordMatchesGradeLevel(record: ScopeAwareRecord, gradeLevel: GradeLevel): boolean {
  const resolved = resolveRecordGradeLevel(record);
  if (resolved) return resolved === gradeLevel;

  const domain = domainOfSubject(record.subject);
  // K12 学段之间也要隔离：缺 gradeLevel 的记录无法判断是小学/初中/高中，不能猜
  if (domain === 'k12') return false;
  // 公考学科或完全无法判断归属的历史记录（早期无 subject 的阶段规划等）按公考兜底
  return gradeLevel === 'adult';
}

export function filterByGradeLevel<T extends ScopeAwareRecord>(
  records: readonly T[],
  gradeLevel: GradeLevel,
): T[] {
  return records.filter((record) => recordMatchesGradeLevel(record, gradeLevel));
}

/** 有学科 / 有学段语义、需要按学段隔离的数据表 */
export const SUBJECT_SCOPED_STORES = new Set([
  'trainings',
  'gaps',
  'abilities',
  'exams',
  'tasks',
  'corrections',
  'subjectiveAnswers',
  'stagePlans',
  'spacedReviews',
]);

/** 只属于公考域的数据表（记录没有 subject/gradeLevel 也要按域隔离） */
export const PUBLIC_EXAM_ONLY_STORES = new Set([
  'registrations',
  'interviewRecords',
  'pdcaProblems',
  'pdcaArtifacts',
  'customTools',
  'weeklyChecklists',
]);

/** 只属于 K12 域的数据表 */
export const K12_ONLY_STORES = new Set(['collaborationEvents']);

/** 记录自带 gradeLevel 的数据表 */
export const GRADE_SCOPED_STORES = new Set(['careerAssessments', 'students']);

export function isScopeManagedStore(store: string): boolean {
  return (
    SUBJECT_SCOPED_STORES.has(store) ||
    PUBLIC_EXAM_ONLY_STORES.has(store) ||
    K12_ONLY_STORES.has(store) ||
    GRADE_SCOPED_STORES.has(store)
  );
}

export function filterStoreRecordsForGrade<T>(
  store: string,
  records: readonly T[],
  gradeLevel: GradeLevel,
): T[] {
  const domain = domainOfGradeLevel(gradeLevel);
  if (PUBLIC_EXAM_ONLY_STORES.has(store)) return domain === 'public-exam' ? [...records] : [];
  if (K12_ONLY_STORES.has(store)) {
    if (domain === 'public-exam') return [];
    // K12 专属表（如家校协同事件）同样按显式学段隔离，缺学段的历史记录不猜归属
    return filterByGradeLevel(records as readonly ScopeAwareRecord[], gradeLevel) as T[];
  }
  if (SUBJECT_SCOPED_STORES.has(store) || GRADE_SCOPED_STORES.has(store)) {
    return filterByGradeLevel(records as readonly ScopeAwareRecord[], gradeLevel) as T[];
  }
  return [...records];
}

/** 写入时补齐学段：已有显式学段不覆盖，学科域与目标学段冲突时保持原样 */
export function stampRecordScope<T extends ScopeAwareRecord>(record: T, gradeLevel: GradeLevel): T {
  if (isGradeLevel(record.gradeLevel)) return record;
  const subjectDomain = domainOfSubject(record.subject);
  if (subjectDomain && subjectDomain !== domainOfGradeLevel(gradeLevel)) return record;
  return { ...record, gradeLevel };
}

/** 历史公考记录缺 gradeLevel 时由学科补成 adult；K12 学科无法推断具体学段，保持原样 */
export function normalizeRecordScope<T extends ScopeAwareRecord>(record: T): T {
  if (isGradeLevel(record.gradeLevel)) return record;
  if (domainOfSubject(record.subject) === 'public-exam') {
    return { ...record, gradeLevel: 'adult' };
  }
  return record;
}

export interface ScopeValidationResult {
  ok: boolean;
  message?: string;
}

const SUBJECT_LABEL_FOR_ERROR: Record<string, string> = {
  xingce: '行测',
  shenlun: '申论',
  mianshi: '面试',
  math: '数学',
  physics: '物理',
  chinese: '语文',
  english: '英语',
  chemistry: '化学',
  biology: '生物',
};

const GRADE_LABEL_FOR_ERROR: Record<GradeLevel, string> = {
  primary: '小学',
  junior: '初中',
  senior: '高中',
  adult: '成年人/公考',
};

export function validateRecordScope(record: ScopeAwareRecord): ScopeValidationResult {
  if (record.gradeLevel !== undefined && !isGradeLevel(record.gradeLevel)) {
    return { ok: false, message: `未知学段：${String(record.gradeLevel)}` };
  }

  const subjectDomain = domainOfSubject(record.subject);
  // K12 学科必须显式带学段，否则无法在小学/初中/高中之间隔离
  if (subjectDomain === 'k12' && !isGradeLevel(record.gradeLevel)) {
    return { ok: false, message: 'K12 记录必须指定学段（primary / junior / senior），否则会跨学段串数据' };
  }
  if (!isGradeLevel(record.gradeLevel) || record.subject === undefined) return { ok: true };
  if (!subjectDomain) return { ok: true };
  if (subjectDomain === domainOfGradeLevel(record.gradeLevel)) return { ok: true };

  const subject = typeof record.subject === 'string'
    ? SUBJECT_LABEL_FOR_ERROR[record.subject] ?? record.subject
    : String(record.subject);
  return {
    ok: false,
    message: `学段与学科不匹配：${GRADE_LABEL_FOR_ERROR[record.gradeLevel]}不能使用「${subject}」，请切换对应学段后再录入`,
  };
}

/** 按表校验写入边界：K12 专属表即使没有学科，也必须显式落在 K12 学段 */
export function validateStoreRecordScope(
  store: string,
  record: ScopeAwareRecord,
): ScopeValidationResult {
  if (K12_ONLY_STORES.has(store)) {
    if (!isGradeLevel(record.gradeLevel)) {
      return { ok: false, message: 'K12 记录必须指定学段（primary / junior / senior），否则会跨学段串数据' };
    }
    if (domainOfGradeLevel(record.gradeLevel) !== 'k12') {
      return { ok: false, message: 'K12 专属数据只能写入小学 / 初中 / 高中学段' };
    }
  }
  return validateRecordScope(record);
}
