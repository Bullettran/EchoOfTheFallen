/**
 * Кастомный курсор (cursor.png / cursor-hover.png из assets/images/ui).
 * Исходные PNG бывают крупными (до 128px) — уменьшаем до 24px через canvas,
 * иначе браузер покажет огромный курсор. Два состояния: обычное и «интерактивное».
 */
import { uiUrl } from '@/core/assets';

const INTERACTIVE_SELECTOR = 'button, a, .card, .tile, .enemy-card, .node.next, .clickable';
const CURSOR_SIZE = 24;

/** Пропорционально ужать PNG до size×size и отдать dataURL (если уже мал — как есть). */
async function shrink(url: string, size: number): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`cursor load failed: ${url}`));
    img.src = url;
  });
  if (img.naturalWidth <= size) return url;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

export async function initCustomCursor(): Promise<void> {
  const normalUrl = uiUrl('cursor');
  const hoverUrl = uiUrl('cursor-hover');
  if (!normalUrl || !hoverUrl) return; // ассетов нет — системный курсор

  let normal: string;
  let hover: string;
  try {
    [normal, hover] = await Promise.all([
      shrink(normalUrl, CURSOR_SIZE),
      shrink(hoverUrl, CURSOR_SIZE),
    ]);
  } catch (e) {
    console.error('[cursor] init failed', e);
    return;
  }

  const setCursor = (url: string): void => {
    document.body.style.cursor = `url(${url}) 6 4, default`;
  };
  setCursor(normal);

  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement | null;
    const interactive = target?.closest(INTERACTIVE_SELECTOR) ?? null;
    setCursor(interactive ? hover : normal);
  });
}
