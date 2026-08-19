import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { useAuth, setCurrentAccountId } from '@shared/core';
import { LoadingSpinner } from '@shared/core/components/LoadingSpinner';
import { ProtectedRoute } from '@shared/core/components/ProtectedRoute';
import {
  Home,
  BookOpen,
  Activity,
  AlertOctagon,
  Users,
  Settings,
  CloudUpload,
  Sparkles,
  Timer,
  FlaskConical,
  BarChart3,
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  GitCompareArrows,
  Beaker,
  Bot,
  Compass,
  GraduationCap,
  Navigation2,
  CalendarRange,
} from 'lucide-react';

import { AppSessionProvider, useAppSession } from './hooks/useAppSession';
import { setBusinessAccount } from './services/localDB';
import { loadSyncConfig } from './services/remoteSync';
import { Toaster } from './components/Toaster';
import { TeacherOnly, RoleGuard } from './components/RoleGuard';
import { NestedLayout, type NestedNavGroup } from './components/NestedLayout';
import { MODULE_VISIBILITY } from './domain/types';

import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { TrainingsPage } from './pages/TrainingsPage';
import { AbilityCenterPage } from './pages/AbilityCenterPage';
import { ProblemCenterPage } from './pages/ProblemCenterPage';
import { StudentsPage } from './pages/StudentsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SyncPage } from './pages/SyncPage';

import { TimelinePage } from './pages/TimelinePage';
import { ExamDiagnosisPage } from './pages/ExamDiagnosisPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { InsightsPage } from './pages/InsightsPage';

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
import { AiJobParsePage } from './pages/AiJobParsePage';
import { PoliticsHotspotsPage } from './pages/PoliticsHotspotsPage';

import { ClassOverviewPage } from './pages/teacher/ClassOverviewPage';
import { AssignmentsPage } from './pages/teacher/AssignmentsPage';
import { CorrectionPage } from './pages/teacher/CorrectionPage';
import { StudentComparePage } from './pages/teacher/StudentComparePage';
import { AIAssistPage } from './pages/teacher/AIAssistPage';
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
function buildStudentGroups(v: Visibility): NestedNavGroup[] {
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
        { to: '/timeline', icon: Timer, label: '学习时间线' },
      ],
    },
    {
      key: 'analytics',
      label: '数据分析',
      icon: BarChart3,
      children: [
        { to: '/analytics', icon: BarChart3, label: '训练收益' },
        { to: '/insights', icon: Compass, label: '深度洞察' },
      ],
    },
    {
      key: 'ai',
      label: 'AI 辅助 (A 类)',
      icon: Bot,
      visible: v.examRegistration,
      children: [
        { to: '/ai-job-parse', icon: Bot, label: 'AI 岗位解析' },
        { to: '/politics-hotspots', icon: Bot, label: '时政素材' },
      ],
    },
    {
      key: 'system',
      label: '系统',
      icon: Settings,
      children: [
        { to: '/sync', icon: CloudUpload, label: '云端同步' },
        { to: '/settings', icon: Settings, label: '设置' },
      ],
    },
  ];
}

/** 构建教师视图分层导航 */
function buildTeacherGroups(v: Visibility): NestedNavGroup[] {
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
        { to: '/ai-assist', icon: Bot, label: 'AI 辅助能力评估' },
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
        { to: '/timeline', icon: Timer, label: '学习时间线' },
      ],
    },
    {
      key: 'analytics',
      label: '数据分析',
      icon: BarChart3,
      children: [
        { to: '/analytics', icon: BarChart3, label: '训练收益' },
        { to: '/insights', icon: Compass, label: '深度洞察' },
      ],
    },
    {
      key: 'ai',
      label: 'AI 辅助 (A 类)',
      icon: Bot,
      visible: v.examRegistration,
      children: [
        { to: '/ai-job-parse', icon: Bot, label: 'AI 岗位解析' },
        { to: '/politics-hotspots', icon: Bot, label: '时政素材' },
      ],
    },
    {
      key: 'system',
      label: '系统',
      icon: Settings,
      children: [
        { to: '/sync', icon: CloudUpload, label: '云端同步' },
        { to: '/settings', icon: Settings, label: '设置' },
      ],
    },
  ];
}

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
  useGlobalShortcuts();
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
  const ModuleGuardExamReg = ({ children }: { children: React.ReactNode }) =>
    visibility.examRegistration ? <>{children}</> : <Navigate to="/" replace />;

  return (
    <NestedLayout groups={navGroups} appConfig={APP_CONFIG}>
      <Toaster />
      <Routes>
        {/* 公共路由 */}
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/trainings" element={<ProtectedRoute><TrainingsPage /></ProtectedRoute>} />
        <Route path="/abilities" element={<ProtectedRoute><AbilityCenterPage /></ProtectedRoute>} />
        <Route path="/problems" element={<ProtectedRoute><ProblemCenterPage /></ProtectedRoute>} />
        <Route path="/exams" element={<ProtectedRoute><ExamDiagnosisPage /></ProtectedRoute>} />
        <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
        <Route path="/insights" element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
        <Route path="/sync" element={<ProtectedRoute><SyncPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* 学段门控路由 */}
        <Route path="/pdca" element={<ProtectedRoute><ModuleGuardPdca><PdcaPage /></ModuleGuardPdca></ProtectedRoute>} />
        <Route path="/pdca/detail" element={<ProtectedRoute><ModuleGuardPdca><PdcaDetailPage /></ModuleGuardPdca></ProtectedRoute>} />
        <Route path="/pdca-calendar" element={<ProtectedRoute><ModuleGuardPdca><PdcaCalendarPage /></ModuleGuardPdca></ProtectedRoute>} />
        <Route path="/pdca-weekly" element={<ProtectedRoute><ModuleGuardPdca><PdcaWeeklyChecklistPage /></ModuleGuardPdca></ProtectedRoute>} />
        <Route path="/pdca-tools" element={<ProtectedRoute><ModuleGuardPdca><PdcaToolsPage /></ModuleGuardPdca></ProtectedRoute>} />
        <Route path="/pdca-efficiency" element={<ProtectedRoute><ModuleGuardPdca><PdcaEfficiencyPage /></ModuleGuardPdca></ProtectedRoute>} />
        <Route path="/career" element={<ProtectedRoute><ModuleGuardCareer><CareerPage /></ModuleGuardCareer></ProtectedRoute>} />
        <Route path="/literacy" element={<ProtectedRoute><ModuleGuardLiteracy><LiteracyPage /></ModuleGuardLiteracy></ProtectedRoute>} />
        <Route path="/literacy-collab" element={<ProtectedRoute><ModuleGuardLiteracy><LiteracyCollaborationPage /></ModuleGuardLiteracy></ProtectedRoute>} />
        <Route path="/ai-job-parse" element={<ProtectedRoute><ModuleGuardExamReg><AiJobParsePage /></ModuleGuardExamReg></ProtectedRoute>} />
        <Route path="/politics-hotspots" element={<ProtectedRoute><ModuleGuardExamReg><PoliticsHotspotsPage /></ModuleGuardExamReg></ProtectedRoute>} />

        {/* 教师专属路由 */}
        <Route path="/class" element={<ProtectedRoute><TeacherOnly><ClassOverviewPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><TeacherOnly><StudentsPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/students/detail" element={<ProtectedRoute><TeacherOnly><StudentDetailPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/students/import" element={<ProtectedRoute><TeacherOnly><StudentsBatchImportPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/career-class" element={<ProtectedRoute><TeacherOnly><CareerClassPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/assignments" element={<ProtectedRoute><TeacherOnly><AssignmentsPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/corrections" element={<ProtectedRoute><TeacherOnly><CorrectionPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/compare" element={<ProtectedRoute><TeacherOnly><StudentComparePage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/effect" element={<ProtectedRoute><TeacherOnly><TeachingEffectPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/ai-assist" element={<ProtectedRoute><TeacherOnly><AIAssistPage /></TeacherOnly></ProtectedRoute>} />
        <Route path="/warnings" element={<ProtectedRoute><TeacherOnly><WarningPage /></TeacherOnly></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </NestedLayout>
  );
}

// 保留 RoleGuard 引用避免 tree-shake 警告
export const _RoleGuard = RoleGuard;
