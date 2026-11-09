import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { Layout, ToastContainer, useToast, type NavGroup } from '@shared/core';
import { LoadingSpinner } from '@shared/core/components/LoadingSpinner';
import {
  Home,
  BookOpen,
  Activity,
  AlertOctagon,
  Users,
  Settings,
  Database,
  Sparkles,
  Timer,
  FlaskConical,
  FileText,
  BarChart3,
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  GitCompareArrows,
  Beaker,
  Compass,
  GraduationCap,
  Navigation2,
  CalendarRange,
  Tags,
  Briefcase,
} from 'lucide-react';

import { useAuth } from './hooks/useAuth';
import { AppSessionProvider, useAppSession } from './hooks/useAppSession';
import { setBusinessAccount } from './services/localDB';
import { consumePendingError, DATA_ERROR_EVENT } from './services/d1Client';
import { TeacherOnly } from './components/RoleGuard';
import { MODULE_VISIBILITY } from './domain/types';

import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { AbilityCenterPage } from './pages/AbilityCenterPage';
import { ProblemCenterPage } from './pages/ProblemCenterPage';
import { StudentsPage } from './pages/StudentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoragePage } from './pages/StoragePage';

import { TimelinePage } from './pages/TimelinePage';
import { ExamDiagnosisPage } from './pages/ExamDiagnosisPage';
import { SubjectiveAnswersPage } from './pages/SubjectiveAnswersPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { LabelRankingPage } from './pages/LabelRankingPage';
import { ExamRegistrationPage } from './pages/ExamRegistrationPage';

// V5.8 新增模块
import { PdcaPage } from './pages/PdcaPage';
import { PdcaDetailPage } from './pages/PdcaDetailPage';
import { PdcaCalendarPage } from './pages/PdcaCalendarPage';
import { PdcaWeeklyChecklistPage } from './pages/PdcaWeeklyChecklistPage';
import { PdcaToolsPage } from './pages/PdcaToolsPage';
import { PdcaEfficiencyPage } from './pages/PdcaEfficiencyPage';
import { CareerPage } from './pages/CareerPage';
import { LiteracyPage } from './pages/LiteracyPage';
import { LiteracyCollaborationPage } from './pages/LiteracyCollaborationPage';
import { StudentsBatchImportPage } from './pages/StudentsBatchImportPage';

import { ClassOverviewPage } from './pages/teacher/ClassOverviewPage';
import { AssignmentsPage } from './pages/teacher/AssignmentsPage';
import { CorrectionPage } from './pages/teacher/CorrectionPage';
import { StudentComparePage } from './pages/teacher/StudentComparePage';
import { WarningPage } from './pages/teacher/WarningPage';
import { StudentDetailPage } from './pages/teacher/StudentDetailPage';
import { TeachingEffectPage } from './pages/teacher/TeachingEffectPage';
import { CareerClassPage } from './pages/teacher/CareerClassPage';
import { useGlobalShortcuts } from './hooks/useKeyboardShortcuts';

const APP_CONFIG = {
  name: '能力增长系统',
  icon: Sparkles,
};

type Visibility = (typeof MODULE_VISIBILITY)[keyof typeof MODULE_VISIBILITY];

/** 构建学生视图分层导航 */
function buildStudentGroups(v: Visibility): NavGroup[] {
  // 阶段三（验收缺陷 #1/#13）：训练闭环内补齐「数据分析 / 学习时间线」，
  // 原「今日复盘」模块已下线（用户有独立复盘站点，2026-11-09 要求移除）
  // 原来的「数据分析」独立分组与「深度洞察」入口取消（Analytics 与 Insights 已合并为分析中心）。
  return [
    { key: 'home', label: '今日工作台', icon: Home, to: '/', end: true },
    {
      key: 'training',
      label: '训练闭环',
      icon: BookOpen,
      children: [
        { to: '/trainings', icon: BookOpen, label: '训练记录' },
        { to: '/abilities', icon: Activity, label: '能力中心' },
        { to: '/problems', icon: AlertOctagon, label: '问题中心' },
        { to: '/exams', icon: FlaskConical, label: '测验诊断' },
        { to: '/subjective', icon: FileText, label: '申论作答' },
        { to: '/timeline', icon: Timer, label: '学习时间线' },
        { to: '/analytics', icon: BarChart3, label: '数据分析' },
        { to: '/label-ranking', icon: Tags, label: '题型排名' },
      ],
    },
    {
      key: 'pdca',
      label: '问题跟进 (PDCA)',
      icon: Navigation2,
      visible: v.pdca,
      children: [
        { to: '/pdca', icon: Navigation2, label: '问题清单' },
        { to: '/pdca-calendar', icon: CalendarRange, label: '问题日历' },
        { to: '/pdca-weekly', icon: CalendarRange, label: '周检查清单' },
        { to: '/pdca-tools', icon: Settings, label: 'PDCA 工具箱' },
        { to: '/pdca-efficiency', icon: BarChart3, label: '循环效率分析' },
      ],
    },
    {
      key: 'planning',
      label: '生涯与规划',
      icon: Compass,
      children: [
        { to: '/career', icon: Compass, label: '职业选择', visible: v.career },
        { to: '/literacy', icon: GraduationCap, label: '学习素养', visible: v.literacy },
        { to: '/literacy-collab', icon: Users, label: '协作行为', visible: v.literacy },
        { to: '/registrations', icon: Briefcase, label: '报考信息' },
      ],
    },
    {
      key: 'system',
      label: '系统',
      icon: Settings,
      children: [
        { to: '/storage', icon: Database, label: '数据存储' },
        { to: '/settings', icon: Settings, label: '设置' },
      ],
    },
  ];
}

/** 构建教师视图分层导航 */
function buildTeacherGroups(v: Visibility): NavGroup[] {
  return [
    { key: 'home', label: '今日工作台', icon: Home, to: '/', end: true },
    {
      key: 'class',
      label: '班级管理',
      icon: Users,
      children: [
        { to: '/class', icon: LayoutDashboard, label: '班级总览' },
        { to: '/students', icon: Users, label: '学生管理' },
        { to: '/compare', icon: GitCompareArrows, label: '学生对比' },
        { to: '/warnings', icon: AlertOctagon, label: '预警中心' },
        { to: '/career-class', icon: Users, label: '班级生涯汇总' },
      ],
    },
    {
      key: 'teaching',
      label: '教学工作',
      icon: ClipboardList,
      children: [
        { to: '/assignments', icon: ClipboardList, label: '任务下发' },
        { to: '/corrections', icon: CheckSquare, label: '批改评价' },
        { to: '/effect', icon: Beaker, label: '教学效果' },
      ],
    },
    {
      key: 'training',
      label: '训练闭环',
      icon: BookOpen,
      children: [
        { to: '/trainings', icon: BookOpen, label: '训练记录' },
        { to: '/abilities', icon: Activity, label: '能力中心' },
        { to: '/problems', icon: AlertOctagon, label: '问题中心' },
        { to: '/exams', icon: FlaskConical, label: '测验诊断' },
        { to: '/subjective', icon: FileText, label: '申论作答' },
        { to: '/timeline', icon: Timer, label: '学习时间线' },
        { to: '/analytics', icon: BarChart3, label: '数据分析' },
        { to: '/label-ranking', icon: Tags, label: '题型排名' },
      ],
    },
    {
      key: 'pdca',
      label: '问题跟进 (PDCA)',
      icon: Navigation2,
      visible: v.pdca,
      children: [
        { to: '/pdca', icon: Navigation2, label: '问题清单' },
        { to: '/pdca-calendar', icon: CalendarRange, label: '问题日历' },
        { to: '/pdca-weekly', icon: CalendarRange, label: '周检查清单' },
        { to: '/pdca-tools', icon: Settings, label: 'PDCA 工具箱' },
        { to: '/pdca-efficiency', icon: BarChart3, label: '循环效率分析' },
      ],
    },
    {
      key: 'planning',
      label: '生涯与规划',
      icon: Compass,
      children: [
        { to: '/career', icon: Compass, label: '职业选择', visible: v.career },
        { to: '/literacy', icon: GraduationCap, label: '学习素养', visible: v.literacy },
        { to: '/literacy-collab', icon: Users, label: '协作行为', visible: v.literacy },
        { to: '/registrations', icon: Briefcase, label: '报考信息' },
      ],
    },
    {
      key: 'system',
      label: '系统',
      icon: Settings,
      children: [
        { to: '/storage', icon: Database, label: '数据存储' },
        { to: '/settings', icon: Settings, label: '设置' },
      ],
    },
  ];
}

export function App() {
  const { state, account, logout } = useAuth();
  const navigate = useNavigate();
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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
      <AuthenticatedApp onLogout={handleLogout} />
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

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  useGlobalShortcuts();
  const { account } = useAuth();
  const { loading, prefs } = useAppSession();
  const visibility = MODULE_VISIBILITY[prefs.gradeLevel];

  const navGroups = useMemo(
    () => (prefs.role === 'teacher' ? buildTeacherGroups(visibility) : buildStudentGroups(visibility)),
    [prefs.role, visibility],
  );

  if (loading) return <LoadingSpinner />;
  if (!prefs.onboardingDone) return <OnboardingPage />;

  const ModuleGuardPdca = ({ children }: { children: React.ReactNode }) =>
    visibility.pdca ? <>{children}</> : <Navigate to="/" replace />;
  const ModuleGuardCareer = ({ children }: { children: React.ReactNode }) =>
    visibility.career ? <>{children}</> : <Navigate to="/" replace />;
  const ModuleGuardLiteracy = ({ children }: { children: React.ReactNode }) =>
    visibility.literacy ? <>{children}</> : <Navigate to="/" replace />;

  return (
    <Layout
      groups={navGroups}
      appConfig={APP_CONFIG}
      storageKey="nested-nav-expanded"
      user={account}
      onLogout={onLogout}
    >
      <ToastContainer />
      <Routes>
        {/* 公共路由 */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/trainings" element={<TrainingsPage />} />
        <Route path="/abilities" element={<AbilityCenterPage />} />
        <Route path="/problems" element={<ProblemCenterPage />} />
        <Route path="/exams" element={<ExamDiagnosisPage />} />
        <Route path="/subjective" element={<SubjectiveAnswersPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/label-ranking" element={<LabelRankingPage />} />
        <Route path="/registrations" element={<ExamRegistrationPage />} />
        {/* /insights 已并入分析中心；保留重定向避免旧书签 404（验收缺陷 #1 的同类死页面问题） */}
        <Route path="/insights" element={<Navigate to="/analytics" replace />} />
        {/* 原「今日复盘」路由已下线（用户另有独立复盘站点）；旧书签由末尾 * 兜底重定向到首页，不留 404 */}
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* 学段门控路由 */}
        <Route path="/pdca" element={<ModuleGuardPdca><PdcaPage /></ModuleGuardPdca>} />
        <Route path="/pdca/detail" element={<ModuleGuardPdca><PdcaDetailPage /></ModuleGuardPdca>} />
        <Route path="/pdca-calendar" element={<ModuleGuardPdca><PdcaCalendarPage /></ModuleGuardPdca>} />
        <Route path="/pdca-weekly" element={<ModuleGuardPdca><PdcaWeeklyChecklistPage /></ModuleGuardPdca>} />
        <Route path="/pdca-tools" element={<ModuleGuardPdca><PdcaToolsPage /></ModuleGuardPdca>} />
        <Route path="/pdca-efficiency" element={<ModuleGuardPdca><PdcaEfficiencyPage /></ModuleGuardPdca>} />
        <Route path="/career" element={<ModuleGuardCareer><CareerPage /></ModuleGuardCareer>} />
        <Route path="/literacy" element={<ModuleGuardLiteracy><LiteracyPage /></ModuleGuardLiteracy>} />
        <Route path="/literacy-collab" element={<ModuleGuardLiteracy><LiteracyCollaborationPage /></ModuleGuardLiteracy>} />

        {/* 教师专属路由 */}
        <Route path="/class" element={<TeacherOnly><ClassOverviewPage /></TeacherOnly>} />
        <Route path="/students" element={<TeacherOnly><StudentsPage /></TeacherOnly>} />
        <Route path="/students/detail" element={<TeacherOnly><StudentDetailPage /></TeacherOnly>} />
        <Route path="/students/import" element={<TeacherOnly><StudentsBatchImportPage /></TeacherOnly>} />
        <Route path="/career-class" element={<TeacherOnly><CareerClassPage /></TeacherOnly>} />
        <Route path="/assignments" element={<TeacherOnly><AssignmentsPage /></TeacherOnly>} />
        <Route path="/corrections" element={<TeacherOnly><CorrectionPage /></TeacherOnly>} />
        <Route path="/compare" element={<TeacherOnly><StudentComparePage /></TeacherOnly>} />
        <Route path="/effect" element={<TeacherOnly><TeachingEffectPage /></TeacherOnly>} />
        <Route path="/warnings" element={<TeacherOnly><WarningPage /></TeacherOnly>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
