/**
 * 分层侧边栏 Layout(基于 shared-core Layout 风格重实现,支持一级组 + 二级菜单)
 *
 * - 一级组:图标 + 名称 + 展开/收起箭头, 点击切换展开态; 组内子项激活时自动展开
 * - 二级项:缩进对齐, 保留 NavLink active 高亮
 * - 单页(无子项)的一级项作为普通链接直接跳转(如"今日工作台")
 * - 折叠态: 一级组以图标 + tooltip 展示子项;悬停浮出二级菜单(简化: 直接不显示子项,只保留图标)
 * - 用户展开态记忆到 localStorage
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/core';
import { ChevronDown, ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export interface NestedNavLeaf {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  visible?: boolean;
}

export interface NestedNavGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  /** 一级组是否可见(整组过滤) */
  visible?: boolean;
  /** 单页组 - 有 to 无 children, 点击直接跳转 */
  to?: string;
  end?: boolean;
  children?: NestedNavLeaf[];
}

export interface AppConfig {
  name: string;
  icon: React.ElementType;
  iconClassName?: string;
}

interface Props {
  children: React.ReactNode;
  groups: NestedNavGroup[];
  appConfig: AppConfig;
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = 'nested-nav-expanded';

export function NestedLayout({ children, groups, appConfig, storageKey = DEFAULT_STORAGE_KEY }: Props) {
  const { logout, account } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });

  // 当前路由属于哪个组 → 自动展开
  const activeGroupKey = useMemo(() => {
    const path = location.pathname;
    for (const g of groups) {
      if (g.to && (g.to === path || (path.startsWith(g.to) && g.to !== '/'))) return g.key;
      if (g.children?.some((c) => c.to === path)) return g.key;
    }
    return null;
  }, [location.pathname, groups]);

  useEffect(() => {
    if (activeGroupKey && !expanded.has(activeGroupKey)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(activeGroupKey);
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
  }, [activeGroupKey, expanded, storageKey]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const AppIcon = appConfig.icon;
  const sidebarWidth = collapsed ? 'w-16' : 'w-60';
  const mainPadding = collapsed ? 'pl-16' : 'pl-60';

  const visibleGroups = groups.filter((g) => g.visible !== false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside
        className={`fixed left-0 top-0 bottom-0 ${sidebarWidth} flex flex-col bg-white border-r border-slate-200 z-40 transition-all duration-300`}
      >
        {/* 品牌区 */}
        <div className="flex items-center h-14 px-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`flex-shrink-0 w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md ${appConfig.iconClassName ?? ''}`}
            >
              <AppIcon size={18} className="text-white" />
            </div>
            {!collapsed && <span className="font-bold text-slate-800 text-sm truncate">{appConfig.name}</span>}
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const isSingle = !!group.to && !group.children?.length;
            const activeChildren = group.children?.filter((c) => c.visible !== false) ?? [];
            const isExpanded = expanded.has(group.key);
            const isActive = activeGroupKey === group.key;

            if (isSingle) {
              return (
                <NavLink
                  key={group.key}
                  to={group.to!}
                  end={group.end ?? group.to === '/'}
                  title={collapsed ? group.label : undefined}
                  className={({ isActive: navActive }) =>
                    `flex items-center gap-3 rounded-lg text-sm font-medium transition-all mb-0.5 group relative ${
                      collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5'
                    } ${
                      navActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                    }`
                  }
                >
                  <GroupIcon size={18} className="flex-shrink-0" />
                  {!collapsed && <span className="truncate">{group.label}</span>}
                  {collapsed && (
                    <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                      {group.label}
                    </span>
                  )}
                </NavLink>
              );
            }

            if (activeChildren.length === 0) return null;

            return (
              <div key={group.key} className="mb-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  title={collapsed ? group.label : undefined}
                  className={`w-full flex items-center gap-3 rounded-lg text-sm font-semibold transition-all group relative ${
                    collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2'
                  } ${isActive ? 'text-blue-700' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  <GroupIcon size={18} className="flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{group.label}</span>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </>
                  )}
                  {collapsed && (
                    <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                      {group.label} · {activeChildren.length} 项
                    </span>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div className="mt-0.5 ml-2 pl-3 border-l border-slate-100 space-y-0.5">
                    {activeChildren.map((leaf) => {
                      const LeafIcon = leaf.icon;
                      return (
                        <NavLink
                          key={leaf.to}
                          to={leaf.to}
                          end={leaf.end}
                          className={({ isActive: navActive }) =>
                            `flex items-center gap-2 rounded-md text-xs transition-all px-2 py-2 ${
                              navActive
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                            }`
                          }
                        >
                          <LeafIcon size={14} className="flex-shrink-0" />
                          <span className="truncate">{leaf.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* 底部 */}
        <div className="flex-shrink-0 border-t border-slate-100 p-2 space-y-1">
          {!collapsed && account?.username && (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-7 h-7 bg-gradient-to-br from-slate-600 to-slate-700 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {account.username.charAt(0)}
              </div>
              <span className="text-xs text-slate-600 truncate">{account.username}</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex items-center gap-2 w-full rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all ${collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'}`}
            title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!collapsed && <span className="text-xs">折叠</span>}
          </button>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 w-full rounded-lg text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all ${collapsed ? 'px-0 py-2 justify-center' : 'px-3 py-2'}`}
            title="退出登录"
          >
            <LogOut size={18} />
            {!collapsed && <span className="text-xs">退出</span>}
          </button>
        </div>
      </aside>

      <main className={`flex-1 ${mainPadding} transition-all duration-300 min-h-screen`}>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
