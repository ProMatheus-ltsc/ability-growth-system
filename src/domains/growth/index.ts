/**
 * 成长域（学习素养 / 职业选择 / PDCA）
 *
 * 这三个模块服务不同学段的成长诉求，可见性在这里集中声明，
 * 导航门控与路由门控都从 MODULE_VISIBILITY 派生，避免两处各写一份。
 */
import type { GradeLevel } from '../../domain/types';

export const LITERACY_GRADE_LEVELS = ['primary', 'junior', 'senior'] as const satisfies readonly GradeLevel[];
export const CAREER_GRADE_LEVELS = ['junior', 'senior', 'adult'] as const satisfies readonly GradeLevel[];
export const PDCA_GRADE_LEVELS = ['adult'] as const satisfies readonly GradeLevel[];

export function isGrowthModuleVisible(
  module: 'literacy' | 'career' | 'pdca',
  gradeLevel: GradeLevel,
): boolean {
  const levels =
    module === 'literacy' ? LITERACY_GRADE_LEVELS : module === 'career' ? CAREER_GRADE_LEVELS : PDCA_GRADE_LEVELS;
  return (levels as readonly GradeLevel[]).includes(gradeLevel);
}
