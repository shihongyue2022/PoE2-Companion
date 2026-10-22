import { useState, type ReactNode } from 'react';
import { getOfficialCurrencyImage } from './currencyImages';

/** Use exact, verified GGG artwork; a failed request never turns into another currency's image. */
export default function OfficialCurrencyIcon({ currencyId, label, size = 'inline', fallback }: {
  currencyId?: string;
  label: string;
  size?: 'card' | 'inline';
  fallback?: ReactNode;
}) {
  const image = currencyId ? getOfficialCurrencyImage(currencyId) : undefined;
  const [failedUrl, setFailedUrl] = useState('');
  if (!image && size === 'inline') return fallback ?? null;
  const visible = image && image.url !== failedUrl;
  return <span className={`wb-currency-art ${size}${visible ? '' : ' unavailable'}`}
    title={image ? `${label} · GGG 官方图片${visible ? '' : '（加载失败）'}` : `${label} · 暂无可靠图标`}>
    {visible ? <img src={image.url} alt={`${label} · GGG 官方通货图标`} decoding="async"
      referrerPolicy="no-referrer" onError={() => setFailedUrl(image.url)} />
      : <span className="wb-currency-art-fallback" role="img" aria-label={`${label} · ${image ? '官方图标加载失败' : '暂无官方图标'}`}>
        {size === 'card' ? image ? '图标未加载' : '暂无图标' : '?'}</span>}
  </span>;
}
