import type { ReactNode, ButtonHTMLAttributes } from 'react';
const paths: Record<string, ReactNode> = {
  route: <><path d="M5 5h5v5H5zM14 14h5v5h-5zM7.5 10v6.5H14M10 7.5h6.5V14" /></>,
  hammer: <path d="m13 3 8 8-3 3-8-8zM12 10 3 19l2 2 9-9M9 5l3-3" />,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  sliders: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  external: <path d="M14 3h7v7M21 3 11 13M10 5H4v16h16v-6" />,
  ring: <><ellipse cx="12" cy="15" rx="7" ry="6" /><path d="m8 5 4-3 4 3-4 5zM8 5h8M9 10l-2-2M15 10l2-2" /></>,
  equipment: <path d="m8 3 4 2 4-2 5 5-3 4-2-1v10H8V11l-2 1-3-4zM9 4v4h6V4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  paste: <path d="M9 5H5v16h14V5h-4M9 3h6v5H9zM8 12h8M8 16h6" />,
  check: <path d="m5 12 4 4L19 6" />,
  undo: <path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" />,
  refresh: <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  ledger: <path d="M6 3h13v18H6zM3 7h6M3 12h6M3 17h6M12 8h4M12 13h4" />,
  chart: <path d="M4 3v18h17M8 17v-5M13 17V8M18 17V4" />,
};
export default function WorkbenchIcon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.ring}</svg>;
}
export function IconButton({ icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return <button type="button" className={`wb-icon-button ${className}`} title={label} aria-label={label} {...props}><WorkbenchIcon name={icon} /></button>;
}
