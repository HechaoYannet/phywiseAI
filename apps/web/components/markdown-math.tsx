import ReactMarkdown, { type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

interface MarkdownMathProps {
  content: string;
  className?: string;
}

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkMath];
const rehypePlugins: Options["rehypePlugins"] = [[rehypeKatex, { strict: false, throwOnError: false }]];
const inlineCodePattern = /`([^`\n]+)`/g;
const latexCommandPattern = /\\{1,2}[A-Za-z]+/;

export function MarkdownMath({ content, className }: MarkdownMathProps) {
  const isEmpty = content.trim().length === 0;
  const classNames = ["markdown-math", className, isEmpty ? "is-empty" : null].filter(Boolean).join(" ");

  if (isEmpty) {
    return <div className={classNames} aria-hidden="true" />;
  }

  return (
    <div className={classNames}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml>
        {normalizeMarkdownMath(content)}
      </ReactMarkdown>
    </div>
  );
}

export function normalizeMarkdownMath(content: string) {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$\n${normalizeLatexCommands(math.trim())}\n$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${normalizeLatexCommands(math.trim())}$`)
    .replace(inlineCodePattern, (match, code: string) =>
      isLikelyLatex(code) ? `$${normalizeLatexCommands(code.trim())}$` : match
    );
}

function isLikelyLatex(value: string) {
  const text = value.trim();
  return latexCommandPattern.test(text) || (/[{}_^]/.test(text) && /[=+\-*/<>]/.test(text));
}

function normalizeLatexCommands(value: string) {
  return value.replace(/\\\\(?=[A-Za-z])/g, "\\");
}
