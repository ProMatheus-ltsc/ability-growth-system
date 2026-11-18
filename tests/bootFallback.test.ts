/**
 * 首屏兜底提示（index.html 内联脚本）
 *
 * 场景：部署换了一版，浏览器还拿着旧 `index.html`，它引用的 `/assets/index-<旧哈希>.js`
 * 已经不存在 → 请求被 SPA 重写兜成 HTML → 模块脚本因 MIME 被拒而不执行 →
 * `#root` 永远空着。这就是「登录页白屏、连登录请求都没发出」的现场。
 *
 * 兜底脚本必须在模块脚本**之前**执行，并且能在脚本加载失败 / 静默不执行两种情况下
 * 给出可见提示。这里把 index.html 里的真实脚本抽出来跑（不是复制一份逻辑），
 * 保证测的就是上线那份代码。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

interface FakeElement {
  id: string;
  textContent: string;
  style: Record<string, string>;
  parentNode: FakeElement | null;
  listeners: Record<string, (() => void)[]>;
  addEventListener: (type: string, handler: () => void) => void;
}

function element(id: string, parent: FakeElement | null = null): FakeElement {
  const el: FakeElement = {
    id,
    textContent: '',
    style: {},
    parentNode: parent,
    listeners: {},
    addEventListener(type, handler) {
      (el.listeners[type] ??= []).push(handler);
    },
  };
  return el;
}

function mount(options: { reactTookOver?: boolean } = {}) {
  const root = element('root');
  const hint = element('boot-hint', root);
  const title = element('boot-hint-title', hint);
  const detail = element('boot-hint-detail', hint);
  const retry = element('boot-hint-retry', hint);
  // 与 index.html 里的初始文案一致
  title.textContent = '正在加载…';
  detail.style.display = 'none';
  retry.style.display = 'none';

  const byId = new Map<string, FakeElement>([
    ['root', root],
    ['boot-hint', hint],
    ['boot-hint-title', title],
    ['boot-hint-detail', detail],
    ['boot-hint-retry', retry],
  ]);

  // React 挂载会清空 #root 的内容（占位节点被摘掉）
  if (options.reactTookOver) hint.parentNode = null;

  const windowListeners: { type: string; handler: (event: unknown) => void; capture?: boolean }[] = [];
  const timers: (() => void)[] = [];
  const fakeWindow = {
    addEventListener(type: string, handler: (event: unknown) => void, capture?: boolean) {
      windowListeners.push({ type, handler, capture });
    },
  };
  const fakeDocument = { getElementById: (id: string) => byId.get(id) ?? null };
  let reloaded = 0;
  const fakeLocation = {
    reload() {
      reloaded += 1;
    },
  };

  new Function('document', 'window', 'setTimeout', 'location', inlineScript)(
    fakeDocument,
    fakeWindow,
    (handler: () => void) => timers.push(handler),
    fakeLocation,
  );

  return {
    title,
    detail,
    retry,
    timers,
    windowListeners,
    reloaded: () => reloaded,
    dispatchResourceError() {
      const listener = windowListeners.find((item) => item.type === 'error');
      listener?.handler({ target: { tagName: 'SCRIPT' } });
    },
    clickRetry() {
      for (const handler of retry.listeners.click ?? []) handler();
    },
  };
}

describe('首屏兜底提示', () => {
  it('兜底脚本在模块脚本之前执行（否则脚本挂掉时它也跑不到）', () => {
    expect(inlineScript.length).toBeGreaterThan(0);
    expect(html.indexOf('boot-hint')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });

  it('脚本加载失败：给出可见提示与刷新按钮，而不是停在「正在加载…」', () => {
    const page = mount();
    expect(page.title.textContent).toBe('正在加载…');

    page.dispatchResourceError();

    expect(page.title.textContent).toBe('页面没能加载');
    expect(page.detail.style.display).toBe('block');
    expect(page.detail.textContent).toContain('版本已更新');
    expect(page.retry.style.display).toBe('inline-block');
  });

  it('非脚本资源的报错不触发（图片挂了不该提示版本更新）', () => {
    const page = mount();
    const listener = page.windowListeners.find((item) => item.type === 'error');
    listener?.handler({ target: { tagName: 'IMG' } });
    expect(page.retry.style.display).toBe('none');
  });

  it('React 已接管页面时不再打扰用户', () => {
    const page = mount({ reactTookOver: true });
    page.dispatchResourceError();
    expect(page.retry.style.display).toBe('none');
    expect(page.title.textContent).toBe('正在加载…');
  });

  it('脚本静默不执行时超时也会提示', () => {
    const page = mount();
    expect(page.timers).toHaveLength(1);
    page.timers[0]();
    expect(page.title.textContent).toBe('页面没能加载');
    expect(page.detail.textContent).toContain('加载超时');
  });

  it('刷新按钮真的会 reload', () => {
    const page = mount();
    page.clickRetry();
    expect(page.reloaded()).toBe(1);
  });
});
