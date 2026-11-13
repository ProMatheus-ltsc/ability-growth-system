import { describe, expect, it } from 'vitest';
import { MODULE_VISIBILITY, SUBJECT_MATRIX, type GradeLevel } from '../src/domain/types';
import { getAbilityTags, getModules, getRadarDimensions } from '../src/domain/abilityTags';
import { K12_SUBJECT_MATRIX } from '../src/domains/k12';
import { PUBLIC_EXAM_SUBJECTS } from '../src/domains/public-exam';

const K12_LEVELS: GradeLevel[] = ['primary', 'junior', 'senior'];

describe('领域拆分：学科矩阵由产品域派生', () => {
  it('公考学段只包含公考学科', () => {
    expect(SUBJECT_MATRIX.adult).toEqual([...PUBLIC_EXAM_SUBJECTS]);
    for (const subject of SUBJECT_MATRIX.adult) {
      expect(['xingce', 'shenlun', 'mianshi']).toContain(subject);
    }
  });

  it('K12 学段不包含公考学科', () => {
    for (const level of K12_LEVELS) {
      expect(SUBJECT_MATRIX[level]).toEqual([...K12_SUBJECT_MATRIX[level as 'primary' | 'junior' | 'senior']]);
      for (const subject of ['xingce', 'shenlun', 'mianshi']) {
        expect(SUBJECT_MATRIX[level]).not.toContain(subject);
      }
    }
  });

  it('模块可见性与产品定位一致', () => {
    expect(MODULE_VISIBILITY.primary).toMatchObject({
      pdca: false,
      career: false,
      literacy: true,
      publicExam: false,
      examRegistration: false,
    });
    expect(MODULE_VISIBILITY.junior).toMatchObject({ career: true, literacy: true, publicExam: false });
    expect(MODULE_VISIBILITY.senior).toMatchObject({ career: true, literacy: true, publicExam: false });
    expect(MODULE_VISIBILITY.adult).toMatchObject({
      pdca: true,
      career: true,
      literacy: false,
      publicExam: true,
      examRegistration: true,
    });
  });
});

describe('K12 内容兼容：每个可见学科都有模块与雷达维度', () => {
  for (const level of K12_LEVELS) {
    for (const subject of SUBJECT_MATRIX[level]) {
      it(`${level}-${subject} 可录入、可归因、可出雷达图`, () => {
        expect(getModules(level, subject).length).toBeGreaterThan(0);
        const dims = getRadarDimensions(level, subject);
        expect(dims.length).toBeGreaterThan(0);
        expect(dims.reduce((sum, dim) => sum + dim.weight, 0)).toBe(100);
      });
    }
  }

  it('公考三大科目保持完整能力体系', () => {
    for (const subject of PUBLIC_EXAM_SUBJECTS) {
      expect(getModules('adult', subject).length).toBeGreaterThan(0);
      expect(getRadarDimensions('adult', subject).length).toBeGreaterThan(0);
    }
  });

  it('K12 脚手架的标签带正确学段，不会串到公考', () => {
    for (const level of K12_LEVELS) {
      const tags = getAbilityTags(level, 'chinese');
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.every((tag) => tag.gradeLevel === level)).toBe(true);
    }
    expect(getAbilityTags('adult', 'chinese')).toEqual([]);
  });
});
