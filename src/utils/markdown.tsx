import React, { useRef, useEffect, useCallback } from "react";

export function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function minimalMarkdown(text: string) {
  const codeBlocks: string[] = [];
  const token = `__CODEBLOCK_${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}__`;
  
  // 1. Extract raw code blocks before HTML escaping
  const processed = (text || "").replace(/```([\s\S]*?)```/g, function (_, code) {
    const i = codeBlocks.length;
    
    // Replace unpaired surrogates before URI encoding to prevent URIError
    // BUG-005: Unpaired surrogates crash encodeURIComponent
    const safeCode = code.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1\uFFFD");
    
    // BUG-004: Encode raw code for the copy button using standards-compliant UTF-8 → binary conversion
    const bytes = new TextEncoder().encode(safeCode);
    const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
    const encoded = btoa(binary);
    
    codeBlocks.push(
      `<div class="code-block-wrapper relative group">` +
      `<button type="button" class="copy-code-btn absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[12px] px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-text-secondary hover:text-text-primary" data-code="${encoded}" aria-label="Copy code" title="Copy">⎘</button>` +
      `<pre><code>${escapeHtml(code)}</code></pre></div>`
    );
    return `${token}_${i}`;
  });

  // 2. Escape the remaining text
  let html = escapeHtml(processed);

  // 3. Apply inline markdown replacements
  html = html
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^###(?!#) (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br />");
  
  html = `<p>${html}</p>`;
  
  // 4. Re-insert the processed code blocks (they contain safe, pre-escaped HTML)
  codeBlocks.forEach((block, i) => {
    // Avoid regex replacement to prevent issues with $ characters in code blocks
    html = html.split(`${token}_${i}`).join(block);
  });
  
  return html;
}

/**
 * Defense-in-depth sanitizer for minimalMarkdown output (AUDIT-003).
 * Strips dangerous tags, event handlers, and javascript: URLs even though
 * minimalMarkdown already escapes raw input. This acts as a safety net
 * against future bugs or edge cases in the markdown pipeline.
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their contents completely
  let cleaned = html.replace(/<script[\s\S]*?>\s*[\s\S]*?<\/script>/gi, "");
  // Remove dangerous tags that can execute code or load external resources
  cleaned = cleaned.replace(
    /<(iframe|object|embed|form|input|textarea|select|option|applet|meta|link|style|base)[\s\S]*?>/gi,
    ""
  );
  // Remove event handler attributes (onclick, onerror, onload, etc.)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // Remove javascript: and data:text/html URLs
  cleaned = cleaned.replace(/(href|src|action|background)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi, '$1=""');
  cleaned = cleaned.replace(/(href|src|action|background)\s*=\s*(?:"data:text\/html[^"]*"|'data:text\/html[^']*'|data:text\/html[^\s>]*)/gi, '$1=""');
  return cleaned;
}

export function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(async (e: MouseEvent) => {
    const btn = e.target as HTMLElement | null;
    if (!btn || !btn.classList.contains("copy-code-btn")) return;
    const encoded = btn.getAttribute("data-code");
    if (!encoded) return;
    try {
      const code = decodeURIComponent(escape(atob(encoded)));
      const original = btn.textContent;
      await navigator.clipboard.writeText(code);
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      const original = btn.textContent;
      btn.textContent = "Copy failed";
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("click", handleCopy);
    return () => el.removeEventListener("click", handleCopy);
  }, [handleCopy]);

  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: sanitizeHtml(minimalMarkdown(text)) }} />;
}
