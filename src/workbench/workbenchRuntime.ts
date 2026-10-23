/** Hosted builds keep browser calculations and explicit uploads, without probing a visitor's computer. */
export const HOSTED_WORKBENCH = import.meta.env?.VITE_WORKBENCH_HOSTED === '1';
export const LOCAL_SERVICE_MESSAGE = '浏览器版未连接本机服务。自动读取 PoB2、日志及后台查价请使用本地版；此处可上传 XML、比较装备并打开官网检索。';
export const WORKBENCH_SOURCE = 'https://github.com/shihongyue2022/PoE2-Companion';
export function requireLocalService() {
  if (HOSTED_WORKBENCH) throw new Error(LOCAL_SERVICE_MESSAGE);
}
export function publicAssetUrl(path: string): string {
  if (!path.startsWith('/')) return path;
  return `${(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')}${path}`;
}
