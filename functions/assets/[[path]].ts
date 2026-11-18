/**
 * `/assets/*` 静态资源兜底：不存在就老老实实 404。
 *
 * ## 为什么需要这个函数
 *
 * 前端是 SPA，`public/_redirects` 里有一条 `/* /index.html 200` 把未知路径都交给前端路由。
 * 这条规则**不区分资源与页面**：版本更新后浏览器仍持有旧 `index.html`，它引用的
 * `/assets/index-<旧哈希>.js` 已经不在部署里，于是也被重写成 200 + `text/html`。
 * 浏览器对 `type="module"` 的脚本做严格 MIME 校验，拿到 HTML 会直接拒绝执行，
 * `#root` 永远空着 —— 表现为「登录页白屏，连登录请求都没发出」（`auth_attempts` 无记录）。
 *
 * ## 为什么不能用 `_redirects` 直接给 404
 *
 * Cloudflare Pages 官方明确：`_redirects` 只支持 200(proxying) 与 301/302/303/307/308，
 * 「Rewrites (other status codes) ❌」。写 `/assets/* /index.html 404` 会被整行忽略，
 * 只会让人误以为修好了。所以这里用 Pages Function 接管这一段。
 *
 * ⚠️ 本函数生效的前提是 `public/_routes.json` 里 include 了 `/assets/*`：
 * 没有它，静态资源路径根本不会进函数（部署时自动生成的 `_routes.json` 未必包含这一条）。
 * 该文件目前只列了 `/api/*` 与 `/assets/*`——**新增其他 functions 目录时要一起加进去**，
 * 否则那个函数不会被调用。
 *
 * ## 判定方式
 *
 * 直接把请求转给 `env.ASSETS`：真资源原样返回（含缓存头）；资源不存在时，
 * ASSETS 会先被 SPA 重写兜住而返回 `text/html`。`/assets/` 下的真实文件只可能是
 * js/css/map/图片/字体，**返回 HTML 就一定不是资源**，据此改判 404。
 */
import type { Fetcher, PagesFunction } from '@cloudflare/workers-types';

interface Env {
  ASSETS: Fetcher;
}

const notFound = (): Response =>
  new Response('静态资源不存在（通常发生在版本更新后，请刷新页面重新加载）', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // 404 不该被长缓存：刷新后新版本资源必须能立刻取到
      'cache-control': 'no-store',
      // 明确禁止 MIME 嗅探：即使上游误配成 HTML，也不该被当成脚本执行
      'x-content-type-options': 'nosniff',
    },
  });

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.env.ASSETS.fetch(context.request);
  if (response.status === 404) return notFound();
  const contentType = response.headers.get('content-type') ?? '';
  // 命中了 SPA 重写（拿到 index.html）说明这不是一个真实资源
  if (contentType.includes('text/html')) return notFound();
  return response;
};
