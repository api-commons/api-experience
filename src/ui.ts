// Small DOM/string helpers shared by every renderer.

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escAttr(s: unknown): string {
  return esc(s).replace(/'/g, '&#39;');
}

/** Render trusted-shape text with paragraphs and bare-URL links, everything escaped. */
export function rich(text: unknown): string {
  const t = String(text ?? '').trim();
  if (!t) return '';
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</p>`)
    .join('');
}

export function chip(label: string, value: unknown, cls = ''): string {
  if (value === undefined || value === null || value === '') return '';
  return `<span class="chip ${cls}"><span class="chip-k">${esc(label)}</span>${esc(value)}</span>`;
}

export function tagChips(tags: unknown): string {
  const list = Array.isArray(tags) ? tags : [];
  const names = list.map((t) => (typeof t === 'string' ? t : (t as any)?.name)).filter(Boolean);
  if (!names.length) return '';
  return `<div class="tags">${names.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div>`;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

let uid = 0;
export function nextId(prefix: string): string {
  return `${prefix}-${++uid}`;
}

export function extLink(url: unknown, label?: string): string {
  if (!url) return '';
  return `<a href="${escAttr(url)}" target="_blank" rel="noopener">${esc(label ?? url)}</a>`;
}

export function downloadBlob(name: string, mime: string, content: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
