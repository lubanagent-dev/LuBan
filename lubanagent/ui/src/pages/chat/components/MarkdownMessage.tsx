/**
 * 用户端 markdown 渲染（/chat 共用）：实时气泡与持久化历史消息统一走这里。
 * 不引 rehype-raw，HTML 转义防注入；表格/代码块/标题/列表按用户端轻量样式渲染。
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="chat-markdown text-sm leading-6" data-testid="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-base font-semibold first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h4>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-muted-foreground/40 pl-3 last:mb-0">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) =>
            className?.includes('language-') ? (
              <code className="block overflow-x-auto rounded-lg border border-border/70 bg-muted/60 p-3 font-mono text-xs">
                {children}
              </code>
            ) : (
              <code className="rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-xs">
                {children}
              </code>
            ),
          pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
          table: ({ children }) => (
            <table className="mb-2 w-full border-collapse text-xs last:mb-0">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border px-2 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
