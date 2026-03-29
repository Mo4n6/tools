/**
 * Node-side sanitization fallback for utility/test contexts where no browser DOM is available.
 */
export function sanitizeHtml(html: string): string {
  return html;
}

export function sanitizeMarkdownPreviewHtml(renderedHtml: string): string {
  return sanitizeHtml(renderedHtml);
}

export function sanitizeReadabilityHtml(readabilityHtml: string): string {
  return sanitizeHtml(readabilityHtml);
}
