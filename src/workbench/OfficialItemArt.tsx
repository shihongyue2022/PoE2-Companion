import { useState, type ReactNode } from 'react';
import { getOfficialItemImage } from './itemImages';

/** Remote GGG artwork with a visible provenance link and a local, labelled fallback. */
export default function OfficialItemArt({ baseName, label, fallback }: { baseName: string; label: string; fallback: ReactNode }) {
  const image = getOfficialItemImage(baseName);
  const [failedUrl, setFailedUrl] = useState('');
  const showImage = image && image.url !== failedUrl;
  return <figure className="wb-item-visual">
    <div className={`wb-item-art${showImage ? ' has-official-image' : ''}`}>
      {showImage ? <img src={image.url} alt={`${label} · GGG 官方装备图标`} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(image.url)} /> : fallback}
      <span className="wb-orbit" />
    </div>
    <figcaption className="wb-image-credit">
      {image ? <><a href={image.sourceUrl} target="_blank" rel="noreferrer" title="查看 GGG 官方 CDN 图片来源">GGG 官方图片 ↗</a>{!showImage && <span>图片加载失败 · 显示占位图</span>}</> : <span>暂无对应官方图标 · 显示占位图</span>}
    </figcaption>
  </figure>;
}
