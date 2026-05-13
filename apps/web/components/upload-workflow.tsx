"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { createParseJob, createUpload, getParseJob } from "../lib/api";

type UploadMode = "file" | "text";

export function UploadWorkflow() {
  const router = useRouter();
  const [mode, setMode] = useState<UploadMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("manual-problem.md");
  const [textContent, setTextContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("等待上传");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (busy) {
      return false;
    }

    if (mode === "file") {
      return file !== null;
    }

    return textContent.trim().length > 0;
  }, [busy, file, mode, textContent]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("上传资源中");

    try {
      const formData = new FormData();
      if (mode === "file" && file) {
        formData.append("file", file);
      } else {
        formData.append("text_content", textContent);
        formData.append("filename", filename);
      }

      const asset = await createUpload(formData);
      setStatus("创建解析任务中");

      let job = await createParseJob({
        source_asset_id: asset.id,
        provider_strategy: "hybrid"
      });

      while (job.status === "queued" || job.status === "processing") {
        setStatus(`解析中 ${job.progress}%`);
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        job = await getParseJob(job.id);
      }

      if (job.status !== "completed" || !job.result_problem_id) {
        throw new Error(job.error_message ?? "解析任务失败。");
      }

      router.push(`/problems/${job.result_problem_id}/confirm`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "上传失败。");
      setStatus("等待重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ingest-shell">
      <div className="ingest-header">
        <span className="eyebrow">M1 Ingestion Flow</span>
        <h2>上传题目、等待解析，再进入真实工作区。</h2>
        <p>
          当前支持 `图片 / PDF / 文本` 三种入口。图片和 PDF 会生成真实资源记录与解析任务，
          文本输入会直接进入结构化解析。
        </p>
      </div>

      <div className="mode-switch">
        <button
          type="button"
          className={mode === "file" ? "mode-button active-mode" : "mode-button"}
          onClick={() => setMode("file")}
        >
          文件上传
        </button>
        <button
          type="button"
          className={mode === "text" ? "mode-button active-mode" : "mode-button"}
          onClick={() => setMode("text")}
        >
          文本输入
        </button>
      </div>

      <form className="upload-form" onSubmit={handleSubmit}>
        {mode === "file" ? (
          <label className="file-drop">
            <span>选择图片或 PDF</span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.md,.txt,.tex"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <small>{file ? file.name : "支持 JPG / PNG / PDF"}</small>
          </label>
        ) : (
          <div className="text-entry">
            <label>
              文件名
              <input value={filename} onChange={(event) => setFilename(event.target.value)} />
            </label>
            <label>
              题目文本
              <textarea
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                rows={10}
                placeholder="输入题干、小问和已知条件。"
              />
            </label>
          </div>
        )}

        <div className="submit-row">
          <button type="submit" className="primary-link" disabled={!canSubmit}>
            {busy ? "处理中" : "开始解析"}
          </button>
          <span className="status-note">{status}</span>
        </div>
        {error ? <p className="error-copy">{error}</p> : null}
      </form>
    </section>
  );
}

