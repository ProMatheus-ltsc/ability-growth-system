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
import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';

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
  // V5.11 Bug #037 修复:移动端(<lg 断点)侧边栏改为 Drawer 抽屉,默认关闭
  const [mobileOpen, setMobileOpen] = useState(false);
  // V5.11 Bug #037 修复:全局搜索面板(Ctrl+K / Cmd+K)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });

  // Ctrl+K / Cmd+K 打开全局搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 路由切换时关闭 Drawer
  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

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
  // V5.11 Bug #037 修复:移动端不预留侧栏空间,主内容 100% 宽度
  const mainPadding = collapsed ? 'lg:pl-16' : 'lg:pl-60';

  const visibleGroups = groups.filter((g) => g.visible !== false);

  // 全局搜索候选(基于导航菜单)
  const searchCandidates = useMemo(() => {
    const list: Array<{ to: string; label: string; group: string }> = [];
    for (const g of visibleGroups) {
      if (g.to && !g.children?.length) list.push({ to: g.to, label: g.label, group: g.label });
      g.children?.forEach((c) => {
        if (c.visible !== false) list.push({ to: c.to, label: c.label, group: g.label });
      });
    }
    return list;
  }, [visibleGroups]);
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchCandidates.slice(0, 8);
    return searchCandidates.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [searchQuery, searchCandidates]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* 移动端顶部条(<lg 断点显示) */}
      <div className="lg:hidden flex items-center justify-between bg-white border-b border-slate-200 px-3 h-14 sticky top-0 z-30">
        <button
          className="p-2 rounded hover:bg-slate-100"
          onClick={() => setMobileOpen(true)}
          aria-label="打开菜单"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
            <AppIcon size={16} className="text-white" />
          </div>
          <span className="font-bold text-slate-800 text-sm">{appConfig.name}</span>
        </div>
        <button
          className="p-2 rounded hover:bg-slate-100"
          onClick={() => setSearchOpen(true)}
          aria-label="搜索"
        >
          <Search size={20} />
        </button>
      </div>

      {/* 移动端 Drawer 遮罩 */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 bottom-0 flex flex-col bg-white border-r border-slate-200 z-50 transition-transform duration-300
          ${sidebarWidth}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
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
        <div className="p-3 lg:p-6 max-w-7xl mx-auto">{children}</div>
      </main>

      {/* V5.11 Bug #037 修复:Ctrl+K 全局搜索面板 */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Search size={18} className="text-slate-400" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索菜单/功能(Ctrl+K)"
                className="flex-1 outline-none text-sm"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {searchResults.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">未找到匹配项</div>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={r.to}
                    onClick={() => {
                      navigate(r.to);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50 text-left"
                  >
                    <span className="text-slate-800">{r.label}</span>
                    <span className="text-xs text-slate-400">{r.group}</span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100">↑↓</kbd> 选择
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100">Enter</kbd> 打开
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100">Esc</kbd> 关闭
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
