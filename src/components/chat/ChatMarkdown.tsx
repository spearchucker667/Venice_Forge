import React, { useState, useRef, useEffect, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { useTranslation } from "react-i18next";
import { copyText } from "../../stores/media-send-to";
import { highlightCode } from "./codeHighlighting";
// Allow http/https/mailto links and image data: URIs only. Strips javascript:,
// vbscript:, file:, and unknown other smuggled protocols.
const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|#)/i;

function safeUrlTransform(url: string, key: string): string {
  if (!url) return "";
  const cleaned = defaultUrlTransform(url);
  if (!cleaned) return "";
  if (key === "src" && cleaned.startsWith("data:image/")) return cleaned;
  if (SAFE_URL_PROTOCOLS.test(cleaned)) return cleaned;
  return "";
}

function extractReactText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(extractReactText).join("");
  }

  if (
    React.isValidElement<{
      children?: React.ReactNode;
    }>(value)
  ) {
    return extractReactText(value.props.children);
  }

  return "";
}

function CodeRenderer({
  children,
  className,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"code"> & { node?: unknown }) {
  const match = /language-([a-zA-Z0-9#\-+]+)/.exec(className || "");
  const hasNewline = String(children).includes("\n");
  // If there's no language and no newline, treat it as inline code
  if (!match && !hasNewline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  // Otherwise, it's part of a block code (handled by PreRenderer)
  // Just pass through the raw code with its class
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function PreRenderer({
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"pre"> & { node?: unknown }) {
  const { t: tRuntime } = useTranslation("common");
  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Find the nested <code> element to extract language, className, and raw text
  let lang = "";
  let codeClassName = "";
  let rawText = "";

  React.Children.forEach(children, (child) => {
    if (
      React.isValidElement<{
        className?: string;
        children?: React.ReactNode;
      }>(child)
    ) {
      const className = child.props.className || "";
      codeClassName = className;
      const match = /language-([a-zA-Z0-9#\-+]+)/.exec(className);
      if (match) lang = match[1];

      rawText = extractReactText(child.props.children).replace(/\n$/, "");
    }
  });

  const copyLabel = tRuntime("runtimeGenerated.components.chat.messageBubble.text.copy");

  return (
    <pre className="relative group/code mb-4 mt-2 overflow-hidden rounded-md border border-code-border bg-code-bg">
      <div className="flex items-center justify-between bg-code-header-bg px-3 py-1.5 border-b border-code-border/50">
        <div className="vf-meta text-code-header-fg font-mono select-none">
          {lang || "text"}
        </div>
        <button
          type="button"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={() => {
            if (rawText) {
              void copyText(rawText);
              setCodeCopied(true);
              if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
              copyTimeoutRef.current = setTimeout(() => setCodeCopied(false), 1500);
            }
          }}
          className="px-2 py-1 vf-tag text-code-header-fg hover:opacity-80 bg-code-bg/50 hover:bg-code-bg rounded transition-colors cursor-pointer"
        >
          {codeCopied
            ? tRuntime("runtimeGenerated.components.chat.messageBubble.text.copied")
            : copyLabel}
        </button>
      </div>
      <div className="p-3 overflow-x-auto vf-meta leading-relaxed" {...(props as ComponentPropsWithoutRef<"div">)}>
        <code className={codeClassName}>
          {highlightCode(rawText, lang)}
        </code>
      </div>
    </pre>
  );
}

interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <div className="prose-venice vf-body leading-relaxed text-text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              attributes: {
                ...defaultSchema.attributes,
                code: [
                  ...(defaultSchema.attributes?.code || []),
                  ["className", /^language-[a-zA-Z0-9#\-+]+$/],
                ],
                span: [
                  ...(defaultSchema.attributes?.span || []),
                  ["className", /^katex.*$/],
                  ["className", /^token(\s+[a-z-]+)*$/],
                ],
                div: [
                  ...(defaultSchema.attributes?.div || []),
                  ["className", /^katex.*$/],
                ],
                math: [...(defaultSchema.attributes?.math || []), "xmlns", "display"],
                annotation: [...(defaultSchema.attributes?.annotation || []), "encoding"],
                semantics: [...(defaultSchema.attributes?.semantics || [])],
                mi: [...(defaultSchema.attributes?.mi || []), "mathvariant"],
                mo: [...(defaultSchema.attributes?.mo || []), "mathvariant", "fence", "stretchy", "separator", "lspace", "rspace", "minsize", "maxsize"],
                mn: [...(defaultSchema.attributes?.mn || [])],
                mspace: [...(defaultSchema.attributes?.mspace || []), "width"],
                mrow: [], mfrac: [], msqrt: [], mroot: [], mstyle: [], merror: [], mpadded: [], mphantom: [],
                mfenced: [], menclose: [], msub: [], msup: [], msubsup: [], munder: [], mover: [],
                munderover: [], mtable: [], mtr: [], mtd: [], maligngroup: [], malignmark: []
              },
              tagNames: [
                ...(defaultSchema.tagNames || []),
                "math", "semantics", "annotation", "mrow", "mi", "mo", "mn", "mspace", "mfrac", "msqrt", "mroot",
                "mstyle", "merror", "mpadded", "mphantom", "mfenced", "menclose", "msub", "msup", "msubsup",
                "munder", "mover", "munderover", "mtable", "mtr", "mtd", "maligngroup", "malignmark"
              ]
            },
          ],
        ]}
        urlTransform={safeUrlTransform}
        components={{
          pre: PreRenderer,
          code: CodeRenderer,
          a: ({ node: _node, ...props }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) => (
            <a {...props} target="_blank" rel="noopener noreferrer ugc" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
