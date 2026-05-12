const docs = [
  {
    title: "项目白皮书",
    path: "docs/00-foundation/project-whitepaper.md",
    description: "目标用户、问题定义、产品形态、阶段路线和风险。"
  },
  {
    title: "系统总览",
    path: "docs/02-architecture/system-overview.md",
    description: "Web、API、解析、存储、仿真与 Tutor 的职责分界。"
  },
  {
    title: "快速开始",
    path: "docs/04-engineering/quickstart.md",
    description: "本地环境、依赖服务、运行命令和后续开发入口。"
  }
];

export default function DocsEntryPage() {
  return (
    <main className="docs-shell">
      <div className="docs-header">
        <span className="eyebrow">Documentation Index</span>
        <h1>仓库文档入口</h1>
        <p>
          完整文档位于仓库 `docs/` 目录。这里给出最关键的三份入口，便于从 Web
          工作台直接跳转。
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
