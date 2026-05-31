import React, { useRef, useEffect, useCallback } from "react";

export function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// SECURITY: escapeHtml MUST run before any markdown replacement.
// If you modify this function, ensure raw HTML cannot be injected.
export function minimalMarkdown(text: string) {
  const escaped = escapeHtml(text || "");
  const codeBlocks: string[] = [];
  const token = `\u0000CODEBLOCK_${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
  let html = escaped.replace(/```([\s\S]*?)```/g, function (_, code) {
    const i = codeBlocks.length;
    // Wrap code block in a container with a copy button
    const encoded = btoa(unescape(encodeURIComponent(code)));
    codeBlocks.push(
      `<div class="code-block-wrapper relative group">` +
      `<button type="button" class="copy-code-btn absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-text-secondary hover:text-text-primary" data-code="${encoded}" aria-label="Copy code" title="Copy">⎘</button>` +
      `<pre><code>${code}</code></pre></div>`
    );
    return `${token}_${i}`;
  });
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
  codeBlocks.forEach((block, i) => {
    html = html.replace(`${token}_${i}`, block);
  });
  return html;
}

export function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback((e: MouseEvent) => {
    const btn = e.target as HTMLElement | null;
    if (!btn || !btn.classList.contains("copy-code-btn")) return;
    const encoded = btn.getAttribute("data-code");
    if (!encoded) return;
    try {
      const code = decodeURIComponent(escape(atob(encoded)));
      navigator.clipboard.writeText(code).catch(() => {});
      const original = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      // ignore decode errors
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("click", handleCopy);
    return () => el.removeEventListener("click", handleCopy);
  }, [handleCopy]);

  return <div ref={ref} className="md" dangerouslySetInnerHTML={{ __html: minimalMarkdown(text) }} />;
}
