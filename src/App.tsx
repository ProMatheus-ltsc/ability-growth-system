import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { useToast } from '@shared/core';
import { LoadingSpinner } from '@shared/core/components/LoadingSpinner';
import {
  Home,
  BookOpen,
  Activity,
  AlertOctagon,
  Calendar,
  Users,
  Settings,
  Database,
  Sparkles,
  Timer,
  FlaskConical,
  BarChart3,
  Briefcase,
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  GitCompareArrows,
  Beaker,
  Bot,
  Compass,
} from 'lucide-react';

import { useAuth } from './hooks/useAuth';
import { AppSessionProvider, useAppSession } from './hooks/useAppSession';
import { setBusinessAccount } from './services/localDB';
import { consumePendingError, DATA_ERROR_EVENT } from './services/d1Client';
import { AppLayout, type NavItem } from './components/AppLayout';
import { Toaster } from './components/Toaster';
import { TeacherOnly } from './components/RoleGuard';

import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { AbilityCenterPage } from './pages/AbilityCenterPage';
import { ProblemCenterPage } from './pages/ProblemCenterPage';
import { ReviewPage } from './pages/ReviewPage';
import { StudentsPage } from './pages/StudentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoragePage } from './pages/StoragePage';

import { TimelinePage } from './pages/TimelinePage';
import { ExamDiagnosisPage } from './pages/ExamDiagnosisPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ExamRegistrationPage } from './pages/ExamRegistrationPage';
import { InsightsPage } from './pages/InsightsPage';

import { ClassOverviewPage } from './pages/teacher/ClassOverviewPage';
import { AssignmentsPage } from './pages/teacher/AssignmentsPage';
import { CorrectionPage } from './pages/teacher/CorrectionPage';
import { StudentComparePage } from './pages/teacher/StudentComparePage';
import { AIAssistPage } from './pages/teacher/AIAssistPage';
import { WarningPage } from './pages/teacher/WarningPage';
import { StudentDetailPage } from './pages/teacher/StudentDetailPage';
import { TeachingEffectPage } from './pages/teacher/TeachingEffectPage';

const APP_CONFIG = {
  name: '能力增长系统',
  icon: Sparkles,
};

/** 学生视图导航
 *  学生只能看到自己的训练/能力/复盘/时间线/收益分析等自用能力
 */
const STUDENT_NAV: NavItem[] = [
  { to: '/', icon: Home, label: '今日工作台', end: true },
  { to: '/trainings', icon: BookOpen, label: '训练记录' },
  { to: '/abilities', icon: Activity, label: '能力中心' },
  { to: '/problems', icon: AlertOctagon, label: '问题中心' },
  { to: '/exams', icon: FlaskConical, label: '测验诊断' },
  { to: '/reviews', icon: Calendar, label: '复盘中心' },
  { to: '/timeline', icon: Timer, label: '学习时间线' },
  { to: '/analytics', icon: BarChart3, label: '训练收益' },
  { to: '/insights', icon: Compass, label: '深度洞察' },
  { to: '/registrations', icon: Briefcase, label: '公考报考' },
  { to: '/storage', icon: Database, label: '数据存储' },
  { to: '/settings', icon: Settings, label: '设置' },
];

/** 教师视图导航
 *  教师拥有全部学生能力,并额外获得班级管理/任务下发/批改/对比/AI 辅助/预警等能力
 */
const TEACHER_NAV: NavItem[] = [
  { to: '/', icon: Home, label: '今日工作台', end: true },
  { to: '/class', icon: LayoutDashboard, label: '班级总览' },
  { to: '/students', icon: Users, label: '学生管理' },
  { to: '/assignments', icon: ClipboardList, label: '任务下发' },
  { to: '/corrections', icon: CheckSquare, label: '批改评价' },
  { to: '/compare', icon: GitCompareArrows, label: '学生对比' },
  { to: '/effect', icon: Beaker, label: '教学效果' },
  { to: '/ai-assist', icon: Bot, label: 'AI 辅助评估' },
  { to: '/warnings', icon: AlertOctagon, label: '预警中心' },
  { to: '/insights', icon: Compass, label: '深度洞察' },
  { to: '/trainings', icon: BookOpen, label: '训练记录' },
  { to: '/abilities', icon: Activity, label: '能力中心' },
  { to: '/problems', icon: AlertOctagon, label: '问题中心' },
  { to: '/exams', icon: FlaskConical, label: '测验诊断' },
  { to: '/reviews', icon: Calendar, label: '复盘中心' },
  { to: '/timeline', icon: Timer, label: '学习时间线' },
  { to: '/analytics', icon: BarChart3, label: '训练收益' },
  { to: '/storage', icon: Database, label: '数据存储' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export function App() {
  const { state, account } = useAuth();
  // 等待账户上下文写入后再挂载 AppSessionProvider（其内部会读取本机 meta）
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (state === 'authenticated' && account) {
      setBusinessAccount(account.id);
      setReady(true);
    } else {
      setBusinessAccount(undefined);
      setReady(false);
    }
  }, [state, account]);

  if (state === 'loading') return <LoadingSpinner />;

  if (state !== 'authenticated') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!ready) return <LoadingSpinner />;

  return (
    <AppSessionProvider>
      <DataErrorToast />
      <AuthenticatedApp />
    </AppSessionProvider>
  );
}

function DataErrorToast() {
  const { showToast } = useToast();

  useEffect(() => {
    const pending = consumePendingError();
    if (pending) showToast(pending, 'error');
    const handler = (event: Event) => showToast((event as CustomEvent<string>).detail, 'error');
    window.addEventListener(DATA_ERROR_EVENT, handler);
    return () => window.removeEventListener(DATA_ERROR_EVENT, handler);
  }, [showToast]);

  return null;
}

function AuthenticatedApp() {
  const { loading, prefs } = useAppSession();
  const navItems = useMemo(() => (prefs.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV), [prefs.role]);

  if (loading) return <LoadingSpinner />;
  if (!prefs.onboardingDone) return <OnboardingPage />;

  return (
    <AppLayout navItems={navItems} appConfig={APP_CONFIG}>
      <Toaster />
      <Routes>
        {/* 公共路由 - 学生 / 教师均可访问 */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/trainings" element={<TrainingsPage />} />
        <Route path="/abilities" element={<AbilityCenterPage />} />
        <Route path="/problems" element={<ProblemCenterPage />} />
        <Route path="/exams" element={<ExamDiagnosisPage />} />
        <Route path="/reviews" element={<ReviewPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/registrations" element={<ExamRegistrationPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* 教师专属路由 - 学生尝试访问将重定向到工作台 */}
        <Route path="/class" element={<TeacherOnly><ClassOverviewPage /></TeacherOnly>} />
        <Route path="/students" element={<TeacherOnly><StudentsPage /></TeacherOnly>} />
        <Route path="/students/detail" element={<TeacherOnly><StudentDetailPage /></TeacherOnly>} />
        <Route path="/assignments" element={<TeacherOnly><AssignmentsPage /></TeacherOnly>} />
        <Route path="/corrections" element={<TeacherOnly><CorrectionPage /></TeacherOnly>} />
        <Route path="/compare" element={<TeacherOnly><StudentComparePage /></TeacherOnly>} />
        <Route path="/effect" element={<TeacherOnly><TeachingEffectPage /></TeacherOnly>} />
        <Route path="/ai-assist" element={<TeacherOnly><AIAssistPage /></TeacherOnly>} />
        <Route path="/warnings" element={<TeacherOnly><WarningPage /></TeacherOnly>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
