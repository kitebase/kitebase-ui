/**
 * The name in a Content-Disposition header: the UTF-8 one (`filename*`) when
 * there is one, the ASCII fallback (`filename`) otherwise. null when neither.
 */
export function filenameOf(header: string): string | null {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try { return decodeURIComponent(utf8[1].trim()); } catch { /* the ASCII one, then */ }
  }
  const plain = /filename="([^"]*)"/i.exec(header);
  return plain ? plain[1] : null;
}
