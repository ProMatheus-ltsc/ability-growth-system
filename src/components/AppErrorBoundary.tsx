/**
 * 全局渲染错误边界。
 *
 * 为什么必须有：React 18/19 里只要**渲染期**抛一次异常，整棵树就会被卸载，
 * 用户看到的就是纯白页面 —— 没有任何提示、没有任何线索，连「是哪个页面坏了」
 * 都看不出来（PDCA 详情页读历史数据缺字段就是这样白屏的）。
 *
 * 这一层把「白屏」变成「可读的错误卡片」：
 * - 展示错误消息 + 当前路由 + 组件栈前几行，用户能直接截图报障；
 * - 提供「重新加载 / 回首页」两个自救出口；
 * - 把最近一次错误写进 localStorage（`ag:last-render-error`），
 *   刷新后仍能取到现场，便于事后排查。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';

export const LAST_RENDER_ERROR_KEY = 'ag:last-render-error';

/**
 * 边界自身绝不能抛异常：`componentDidCatch` 里再抛一次，React 会直接卸载整棵树，
 * 那就又变回白屏了（这个坑实测踩过：记录现场时用了 `new Date().toISOString()`，
 * 当故障本身就出在日期处理上时，错误边界当场殉职）。
 */
function safeIsoNow(): string {
  try {
    return new Date().toISOString();
  } catch {
    try {
      return String(Date.now());
    } catch {
      return '';
    }
  }
}

function safeString(value: unknown): string {
  try {
    return typeof value === 'string' ? value : String(value ?? '');
  } catch {
    return '';
  }
}

interface Props {
  children: ReactNode;
  /** 变化时自动清除错误（例如路由切换），避免一次崩溃后整个应用永久卡在错误页 */
  resetKey?: string;
}

interface State {
  error: Error | null;
  info: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 整段都要兜住：这里抛任何异常都会让 React 卸载整棵树（白屏），
    // 而错误边界存在的意义就是「不要再白屏」。
    try {
      const detail = {
        message: safeString(error?.message),
        stack: safeString(error?.stack),
        componentStack: safeString(info?.componentStack),
        path: typeof window === 'undefined' ? '' : window.location.pathname + window.location.search,
        at: safeIsoNow(),
      };
      this.setState({ info: detail.componentStack });
      try {
        window.localStorage.setItem(LAST_RENDER_ERROR_KEY, JSON.stringify(detail));
      } catch {
        // 隐私模式 / 配额满：写不进去不影响展示
      }
      console.error('[AppErrorBoundary] 渲染期异常：', error?.message, error?.stack, detail.componentStack);
    } catch {
      // 兜底：连记录现场都失败时，只保留最基础的错误状态
    }
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: '' });
    }
  }

  private copy = (): void => {
    try {
      const { error, info } = this.state;
      const text = [
        `路径: ${typeof window === 'undefined' ? '' : window.location.pathname + window.location.search}`,
        `时间: ${safeIsoNow()}`,
        `错误: ${safeString(error?.message)}`,
        `栈: ${safeString(error?.stack)}`,
        `组件栈: ${safeString(info)}`,
      ].join('\n');
      void navigator.clipboard?.writeText(text);
    } catch {
      // 复制失败不是致命问题
    }
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="max-w-2xl mx-auto card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <AlertOctagon size={20} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">页面出错了</h1>
              <p className="text-xs text-slate-500 mt-1">
                已拦截异常，数据没有丢失。可以重试，或返回首页从别的入口进入。
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto">
            {`${window.location.pathname}${window.location.search}\n${error.message}${
              error.stack ? '\n\n' + error.stack.split('\n').slice(0, 6).join('\n') : ''
            }`}
          </div>

          {info && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer select-none">组件栈</summary>
              <pre className="mt-2 whitespace-pre-wrap break-all">{info.trim().split('\n').slice(0, 8).join('\n')}</pre>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={16} /> 重新加载
            </button>
            <button className="btn-ghost" onClick={() => window.location.assign('/')}>
              <Home size={16} /> 返回首页
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                this.copy();
              }}
            >
              复制错误详情
            </button>
          </div>
        </div>
      </div>
    );
  }
}
