/**
 * 基于身份的路由守卫
 * 学生尝试访问教师专属页面时,重定向到工作台并给出提示
 * PRD §9/§10 明确教师视图为教师端专用能力
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAppSession, type Role } from '../hooks/useAppSession';
import { PageHeader } from './PageHeader';

interface Props {
  allow: Role[];
  children: ReactNode;
  redirectTo?: string;
}

export function RoleGuard({ allow, children, redirectTo = '/' }: Props) {
  const { prefs } = useAppSession();
  if (allow.includes(prefs.role)) return <>{children}</>;
  return <Navigate to={redirectTo} replace />;
}

export function TeacherOnly({ children }: { children: ReactNode }) {
  return <RoleGuard allow={['teacher']}>{children}</RoleGuard>;
}

export function StudentOnly({ children }: { children: ReactNode }) {
  return <RoleGuard allow={['student']}>{children}</RoleGuard>;
}

export function AccessDeniedNotice({ requiredRole }: { requiredRole: Role }) {
  const label = requiredRole === 'teacher' ? '教师 / 教练' : '学生 / 学习者';
  return (
    <div className="space-y-4">
      <PageHeader title="无权访问" description="当前身份无法访问该页面" />
      <div className="card p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3 text-red-500">
          <ShieldAlert size={24} />
        </div>
        <div className="text-slate-700">该功能仅对 <b>{label}</b> 身份开放</div>
        <div className="text-xs text-slate-500 mt-2">
          可在「设置」中切换身份, 或返回首页查看当前身份可用功能
        </div>
      </div>
    </div>
  );
}
