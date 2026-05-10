"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Sanitized HTML from articles.html_clean. */
  html: string;
  className?: string;
};

/**
 * Renders the article body. Engine event listeners (dblclick / mouseup /
 * click for highlight) are attached by useArticleReader against this
 * div via the forwarded ref. The HTML is server-sanitized via trafilatura
 * (no <script> / <iframe> / <img>) so dangerouslySetInnerHTML is safe.
 *
 * Manual typography styles (no @tailwindcss/typography in this project).
 * Matches the editorial mood of the EPUB reader — Source Serif 4 / Georgia
 * for body, mono for code, comfortable line-height.
 */
export const ArticleContent = forwardRef<HTMLDivElement, Props>(
  function ArticleContent({ html, className }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "article-content",
          "font-serif text-base leading-relaxed text-foreground/90",
          // Headings
          "[&_h1]:font-serif [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:leading-tight",
          "[&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:leading-snug",
          "[&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2",
          "[&_h4]:font-serif [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:mt-5 [&_h4]:mb-2",
          // Paragraphs + spacing
          "[&_p]:my-4",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_blockquote]:text-foreground/80",
          // Lists
          "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4",
          "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4",
          "[&_li]:my-1",
          // Code
          "[&_code]:font-mono [&_code]:text-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded",
          "[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-4",
          "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
          // Tables
          "[&_table]:my-4 [&_table]:border-collapse [&_table]:w-full",
          "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
          // Highlights painted by useArticleReader
          "[&_mark.lr-article-hl-yellow]:bg-yellow-200/60 [&_mark.lr-article-hl-yellow]:dark:bg-yellow-700/40",
          "[&_mark.lr-article-hl-green]:bg-green-200/60 [&_mark.lr-article-hl-green]:dark:bg-green-700/40",
          "[&_mark.lr-article-hl-blue]:bg-blue-200/60 [&_mark.lr-article-hl-blue]:dark:bg-blue-700/40",
          "[&_mark.lr-article-hl-pink]:bg-pink-200/60 [&_mark.lr-article-hl-pink]:dark:bg-pink-700/40",
          "[&_mark.lr-article-hl-orange]:bg-orange-200/60 [&_mark.lr-article-hl-orange]:dark:bg-orange-700/40",
          "[&_mark]:rounded-sm [&_mark]:cursor-pointer",
          className,
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
);
