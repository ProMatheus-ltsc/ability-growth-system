/**
 * K12 域（primary / junior / senior）
 *
 * 边界：
 * - 学科：数学、物理、语文、英语、化学、生物；
 * - 学段间共享部分学科，但数据按各自 gradeLevel 隔离；
 * - 语文 / 英语 / 化学 / 生物使用通用能力脚手架，不冒充完整考纲。
 */
import type { Subject } from '../../domain/types';
import { K12_GRADE_LEVELS } from '../shared/scope';

export { isK12GradeLevel, K12_GRADE_LEVELS, K12_SUBJECTS } from '../shared/scope';
export { K12_SUBJECT_SCAFFOLDS, type K12ScaffoldPoint } from './subjectScaffold';

type K12GradeLevel = (typeof K12_GRADE_LEVELS)[number];

export const K12_SUBJECT_MATRIX: Record<K12GradeLevel, readonly Subject[]> = {
  primary: ['math', 'chinese', 'english'],
  junior: ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology'],
  senior: ['math', 'physics', 'chinese', 'english', 'chemistry', 'biology'],
};
