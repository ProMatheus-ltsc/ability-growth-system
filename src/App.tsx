import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { useAuth, setCurrentAccountId } from '@shared/core';
import { Layout } from '@shared/core/components/Layout';
import { LoadingSpinner } from '@shared/core/components/LoadingSpinner';
import { ProtectedRoute } from '@shared/core/components/ProtectedRoute';
import {
  Home,
  BookOpen,
  Activity,
  AlertOctagon,
  Calendar,
  Users,
  Settings,
  CloudUpload,
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

import { AppSessionProvider, useAppSession } from './hooks/useAppSession';
import { setBusinessAccount } from './services/localDB';
import { loadSyncConfig } from './services/remoteSync';
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
import { SyncPage } from './pages/SyncPage';

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
const STUDENT_NAV = [
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
  { to: '/sync', icon: CloudUpload, label: '云端同步' },
  { to: '/settings', icon: Settings, label: '设置' },
];

/** 教师视图导航
 *  教师拥有全部学生能力,并额外获得班级管理/任务下发/批改/对比/AI 辅助/预警等能力
 */
const TEACHER_NAV = [
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
  { to: '/sync', icon: CloudUpload, label: '云端同步' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export function App() {
  const { state, account } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (state === 'authenticated' && account) {
      setCurrentAccountId(account.id);
      setBusinessAccount(account.id);
      void loadSyncConfig().finally(() => setReady(true));
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
      <AuthenticatedApp />
    </AppSessionProvider>
  );
}

function AuthenticatedApp() {
  const { loading, prefs } = useAppSession();
  const navItems = useMemo(() => (prefs.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV), [prefs.role]);

  if (loading) return <LoadingSpinner />;
  if (!prefs.onboardingDone) return <OnboardingPage />;

  return (
    <Layout navItems={navItems} appConfig={APP_CONFIG}>
      <Toaster />
      <Routes>
        {/* 公共路由 - 学生 / 教师均可访问 */}
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/trainings" element={<ProtectedRoute><TrainingsPage /></ProtectedRoute>} />
        <Route path="/abilities" element={<ProtectedRoute><AbilityCenterPage /></ProtectedRoute>} />
        <Route path="/problems" element={<ProtectedRoute><ProblemCenterPage /></ProtectedRoute>} />
        <Route path="/exams" element={<ProtectedRoute><ExamDiagnosisPage /></ProtectedRoute>} />
        <Route path="/reviews" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
        <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
        <Route path="/insights" element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
        <Route path="/registrations" element={<ProtectedRoute><ExamRegistrationPage /></ProtectedRoute>} />
        <Route path="/sync" element={<ProtectedRoute><SyncPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* 教师专属路由 - 学生尝试访问将重定向到工作台 */}
        <Route
          path="/class"
          element={<ProtectedRoute><TeacherOnly><ClassOverviewPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/students"
          element={<ProtectedRoute><TeacherOnly><StudentsPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/students/detail"
          element={<ProtectedRoute><TeacherOnly><StudentDetailPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/assignments"
          element={<ProtectedRoute><TeacherOnly><AssignmentsPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/corrections"
          element={<ProtectedRoute><TeacherOnly><CorrectionPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/compare"
          element={<ProtectedRoute><TeacherOnly><StudentComparePage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/effect"
          element={<ProtectedRoute><TeacherOnly><TeachingEffectPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/ai-assist"
          element={<ProtectedRoute><TeacherOnly><AIAssistPage /></TeacherOnly></ProtectedRoute>}
        />
        <Route
          path="/warnings"
          element={<ProtectedRoute><TeacherOnly><WarningPage /></TeacherOnly></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
