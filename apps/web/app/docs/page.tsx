const docs = [
  {
    title: "项目白皮书",
    path: "docs/00-foundation/project-whitepaper.md",
    description: "画板优先产品叙事、受力分析首发边界与阶段路线。"
  },
  {
    title: "系统总览",
    path: "docs/02-architecture/system-overview.md",
    description: "工作台、业务文档、renderer adapter 和 API 的职责分界。"
  },
  {
    title: "快速开始",
    path: "docs/04-engineering/quickstart.md",
    description: "本地环境、工作台主入口、调试链路与运行命令。"
  }
];

export default function DocsEntryPage() {
  return (
    <main className="docs-shell">
      <div className="docs-header">
        <span className="eyebrow">Documentation Index</span>
        <h1>仓库文档入口</h1>
        <p>
          完整文档位于仓库 `docs/` 目录。当前主叙事已经切到“画板优先、上传从属、受力分析首发”，
          这里列出最关键的入口文件。
        </p>
      </div>
      <div className="docs-grid">
        {docs.map((doc) => (
          <article key={doc.path} className="doc-card">
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <code>{doc.path}</code>
          </article>
        ))}
      </div>
    </main>
  );
}
