import createDOMPurify from 'dompurify';

const FORBID_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'];
const FORBID_ATTR = ['style'];
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

let purifier: ReturnType<typeof createDOMPurify> | null = null;
let hooksRegistered = false;

function isElementNode(node: unknown): node is Element {
  if (!node || typeof node !== 'object') {
    return false;
  }

  if (typeof globalThis.Element !== 'undefined') {
    return node instanceof globalThis.Element;
  }

  return (
    'nodeType' in node &&
    'namespaceURI' in node &&
    'attributes' in node &&
    typeof (node as { nodeType?: unknown }).nodeType === 'number'
  );
}

function scrubSvgXLinkHref(node: Element): void {
  if (node.namespaceURI !== 'http://www.w3.org/2000/svg') {
    return;
  }

  const href = node.getAttribute('xlink:href') ?? node.getAttribute('href');
  if (!href) {
    return;
  }

  if (/^\s*javascript:/i.test(href)) {
    node.removeAttribute('xlink:href');
    node.removeAttribute('href');
  }
}

function getPurifier(): ReturnType<typeof createDOMPurify> | null {
  if (typeof globalThis.window === 'undefined') {
    return null;
  }

  if (!purifier) {
    purifier = createDOMPurify(globalThis.window);
  }

  if (!hooksRegistered) {
    purifier.addHook('afterSanitizeAttributes', (node: unknown) => {
      if (!isElementNode(node)) {
        return;
      }

      for (const attr of Array.from(node.attributes)) {
        if (/^on/i.test(attr.name)) {
          node.removeAttribute(attr.name);
        }
      }

      scrubSvgXLinkHref(node);
    });
    hooksRegistered = true;
  }

  return purifier;
}

export function sanitizeHtml(html: string): string {
  const activePurifier = getPurifier();
  if (!activePurifier) {
    return html;
  }

  return activePurifier.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOWED_URI_REGEXP,
    USE_PROFILES: { html: true, svg: true, svgFilters: false },
  });
}

export function sanitizeMarkdownPreviewHtml(renderedHtml: string): string {
  return sanitizeHtml(renderedHtml);
}

export function sanitizeReadabilityHtml(readabilityHtml: string): string {
  return sanitizeHtml(readabilityHtml);
}
