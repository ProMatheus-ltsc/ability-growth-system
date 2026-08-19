/**
 * PRD V5.8 §29.5 桌面端快捷键接入
 *
 * Ctrl/Cmd + N  新建训练记录 → 跳转 /trainings
 * Ctrl/Cmd + M  快速标记错误 → 跳转 /problems
 * Ctrl/Cmd + Enter  保存并继续(由页面自行绑定)
 * Tab  下一字段(浏览器默认)
 * Esc  关闭弹窗(由页面自行绑定 window keydown)
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!mod) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        navigate('/trainings');
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        navigate('/problems');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
}
