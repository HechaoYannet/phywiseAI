"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createWorkspace } from "../lib/api";

export function WorkspaceLauncher() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    void createWorkspace({ title: "新建受力分析工作台" })
      .then((workspace) => {
        router.replace(`/workspace/${workspace.id}`);
      })
      .catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : "创建工作台失败。");
        startedRef.current = false;
      });
  }, [router]);

  return (
    <main className="launch-shell">
      <section className="launch-card">
        <span className="eyebrow">Board First</span>
        <h1>正在进入受力分析工作台</h1>
        <p>默认入口会直接创建一块空白画板，导入题目、插入模板和 AI 检查都在板内完成。</p>
        {error ? <p className="error-copy">{error}</p> : <p className="status-note">正在创建空白工作台…</p>}
      </section>
    </main>
  );
}
