import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OfficialItemArt from './OfficialItemArt';

// Fixed official-CDN fixtures from Exiled Exchange 2, independently checked before mapping them.
// No network or real image downloads are needed for component behavior tests.
const VERIFIED_IMAGES: Record<string, string> = {
  'Ruby Ring': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvUmluZ3MvQmFzZXR5cGVzL1J1YnlSaW5nIiwidyI6MSwiaCI6MSwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/4f0e6f99c1/RubyRing.png',
  'Amber Amulet': 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQW11bGV0cy9CYXNldHlwZXMvQW1iZXJBbXVsZXQiLCJ3IjoxLCJoIjoxLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/b2698b19ad/AmberAmulet.png',
};
const fallback = <svg role="img" aria-label="本地装备占位图"><circle cx="8" cy="8" r="5" /></svg>;

describe('official equipment artwork', () => {
  it('shows the exact mapped official artwork, accessible base name and inspectable source without sending a referrer', () => {
    render(<OfficialItemArt baseName="Ruby Ring" label="红玉戒指" fallback={fallback} />);
    const image = screen.getByRole('img', { name: '红玉戒指 · GGG 官方装备图标' });
    expect(image).toHaveAttribute('src', VERIFIED_IMAGES['Ruby Ring']);
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByRole('img', { name: '本地装备占位图' })).not.toBeInTheDocument();
    const source = screen.getByRole('link', { name: /GGG 官方图片/ });
    expect(source).toHaveAttribute('href', VERIFIED_IMAGES['Ruby Ring']);
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noreferrer');
  });

  it('labels a failed image as a local placeholder and recovers when the selected base has a different image', () => {
    const { rerender } = render(<OfficialItemArt baseName="Ruby Ring" label="红玉戒指" fallback={fallback} />);
    fireEvent.error(screen.getByRole('img', { name: '红玉戒指 · GGG 官方装备图标' }));
    expect(screen.getByRole('img', { name: '本地装备占位图' })).toBeVisible();
    expect(screen.queryByRole('img', { name: /GGG 官方装备图标/ })).not.toBeInTheDocument();
    expect(screen.getByText('图片加载失败 · 显示占位图')).toBeVisible();

    rerender(<OfficialItemArt baseName="Amber Amulet" label="琥珀护身符" fallback={fallback} />);
    expect(screen.getByRole('img', { name: '琥珀护身符 · GGG 官方装备图标' }))
      .toHaveAttribute('src', VERIFIED_IMAGES['Amber Amulet']);
    expect(screen.queryByRole('img', { name: '本地装备占位图' })).not.toBeInTheDocument();
    expect(screen.queryByText(/图片加载失败/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /GGG 官方图片/ }))
      .toHaveAttribute('href', VERIFIED_IMAGES['Amber Amulet']);
  });

  it('explicitly identifies unavailable artwork instead of presenting a local icon as official', () => {
    render(<OfficialItemArt baseName="Unmapped Future Base" label="未收录底座" fallback={fallback} />);
    expect(screen.getByRole('img', { name: '本地装备占位图' })).toBeVisible();
    expect(screen.getByText('暂无对应官方图标 · 显示占位图')).toBeVisible();
    expect(screen.queryByRole('img', { name: /GGG 官方装备图标/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /GGG 官方图片/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/图片加载失败/)).not.toBeInTheDocument();
  });
});
