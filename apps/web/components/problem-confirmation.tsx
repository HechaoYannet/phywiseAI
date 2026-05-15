"use client";

import type { ProblemCondition, ProblemParseResult, ProblemSubquestion } from "@phywise/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { buildPreviewUrl, createWorkspace, getProblem } from "../lib/api";
import { MarkdownMath } from "./markdown-math";

interface ProblemConfirmationProps {
  problemId: string;
}

export function ProblemConfirmation({ problemId }: ProblemConfirmationProps) {
  const router = useRouter();
  const [problem, setProblem] = useState<ProblemParseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getProblem(problemId);
        if (!cancelled) {
          setProblem(result);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "加载解析结果失败。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  function updateSubquestion(index: number, prompt: string) {
    setProblem((current) => {
      if (!current) {
        return current;
      }

      const nextSubquestions = current.subquestions.map((item, itemIndex) =>
        itemIndex === index ? { ...item, prompt } : item
      );
      return { ...current, subquestions: nextSubquestions };
    });
  }

  function updateCondition(index: number, value: string) {
    setProblem((current) => {
      if (!current) {
        return current;
      }

      const nextConditions = current.conditions.map((item, itemIndex) =>
        itemIndex === index ? ({ ...item, value } satisfies ProblemCondition) : item
      );
      return { ...current, conditions: nextConditions };
    });
  }

  async function handleCreateWorkspace() {
    if (!problem) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const workspace = await createWorkspace({
        title: `${problem.knowledge_links[0]?.title ?? "物理题"} 工作区`,
        source_asset_id: problem.source_asset_id,
        problem_id: problem.problem_id,
        parse_overrides: {
          stem: problem.stem,
          subquestions: problem.subquestions as ProblemSubquestion[],
          conditions: problem.conditions as ProblemCondition[]
        }
      });
      router.push(`/workspace/${workspace.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "创建工作区失败。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="page-shell">正在加载解析结果…</main>;
  }

  if (!problem) {
    return <main className="page-shell">未找到解析结果。</main>;
  }

  return (
    <main className="page-shell">
      <section className="confirm-layout">
        <article className="workspace-card">
          <div className="card-head">
            <h2>解析确认</h2>
            <span className="status-tag">
              confidence {problem.confidence.toFixed(2)} / {problem.needs_confirmation ? "需确认" : "可直接生成"}
            </span>
          </div>
          <p className="status-note">这条确认页链路仅保留为内部调试入口，主产品入口已经改为空白工作台。</p>
          <label className="stacked-field">
            <span>题干</span>
            <textarea
              rows={8}
              value={problem.stem}
              onChange={(event) =>
                setProblem((current) => (current ? { ...current, stem: event.target.value } : current))
              }
            />
            <MarkdownMath content={problem.stem} className="markdown-preview-panel" />
          </label>

          <div className="confirm-grid">
            <section>
              <h3>小问</h3>
              <div className="stack-list">
                {problem.subquestions.map((item, index) => (
                  <label className="stacked-field" key={item.id}>
                    <span>小问 {index + 1}</span>
                    <textarea
                      rows={3}
                      value={item.prompt}
                      onChange={(event) => updateSubquestion(index, event.target.value)}
                    />
                    <MarkdownMath
                      content={item.prompt}
                      className="markdown-preview-panel markdown-preview-panel--compact"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3>条件</h3>
              <div className="stack-list">
                {problem.conditions.map((item, index) => (
                  <label className="stacked-field" key={item.id}>
                    <span>{item.label}</span>
                    <input value={item.value} onChange={(event) => updateCondition(index, event.target.value)} />
                    <MarkdownMath
                      content={item.value}
                      className="markdown-preview-panel markdown-preview-panel--compact"
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>

          {problem.warnings.length ? (
            <div className="warning-box">
              <strong>警告</strong>
              <ul className="compact-list">
                {problem.warnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="submit-row">
            <button type="button" className="primary-link" disabled={saving} onClick={handleCreateWorkspace}>
              {saving ? "生成中" : "生成真实工作区"}
            </button>
            {error ? <span className="error-copy">{error}</span> : null}
          </div>
        </article>

        <aside className="workspace-card">
          <div className="card-head">
            <h2>预览与确认项</h2>
            <span className="status-tag">{problem.provider_trace.map((item) => item.provider).join(" / ")}</span>
          </div>
          <div className="preview-stack">
            {problem.page_regions.map((page) => (
              <figure key={page.id} className="preview-card">
                <img src={buildPreviewUrl(page.preview_key)} alt={page.label} />
                <figcaption>{page.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="stack-list">
            {problem.confirmation_items.map((item) => (
              <div key={item.id} className="confirm-chip">
                <strong>{item.label}</strong>
                <span>{item.reason}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
