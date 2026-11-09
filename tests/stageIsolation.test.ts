import { describe, expect, it } from 'vitest';
import { buildStudentGroups, buildTeacherGroups } from '../src/App';
import { MODULE_VISIBILITY } from '../src/domain/types';

const collectLinks = (groups: ReturnType<typeof buildStudentGroups>) => {
  const links: string[] = [];
  for (const group of groups) {
    if (group.visible === false) continue;
    if (group.to) links.push(group.to);
    for (const child of group.children ?? []) {
      if (child.visible === false) continue;
      if (child.to) links.push(child.to);
    }
  }
  return links;
};

describe('学段隔离：公考专属板块导航', () => {
  it('非公考学段不渲染学科专项与报考信息', () => {
    for (const level of ['primary', 'junior', 'senior'] as const) {
      const links = collectLinks(buildStudentGroups(MODULE_VISIBILITY[level]));
      expect(links).not.toContain('/subjective');
      expect(links).not.toContain('/interview');
      expect(links).not.toContain('/registrations');
      expect(links).toContain('/trainings');
    }
  });

  it('公考学段保留申论/面试/报考入口', () => {
    const links = collectLinks(buildStudentGroups(MODULE_VISIBILITY.adult));
    expect(links).toContain('/subjective');
    expect(links).toContain('/interview');
    expect(links).toContain('/registrations');
  });

  it('教师端不按自身学段过滤公考板块，并标注公考', () => {
    const juniorView = buildTeacherGroups(MODULE_VISIBILITY.junior);
    const links = collectLinks(juniorView);
    expect(links).toContain('/subjective');
    expect(links).toContain('/interview');
    expect(links).toContain('/registrations');
    const subject = juniorView.find((g) => g.key === 'subject');
    expect(subject?.label).toBe('学科专项（公考）');
  });
});
