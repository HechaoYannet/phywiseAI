import Link from "next/link";

const productPillars = [
  "上传 PDF 或图片后自动抽取题干、条件和图示实体。",
  "在可编辑白板里同时处理文字、公式、图形和教学提示。",
  "Tutor 不直接泄露答案，而是按教学回合引导学生完成推导。",
  "仿真场景和公式联动，服务初高中物理题的可视化理解。"
];

const architecturePillars = [
  "客户端无关的 WorkspaceDocument 协议。",
  "Next.js Web 工作台 + FastAPI AI/解析服务拆分。",
  "Postgres、Redis、S3 兼容存储组成自托管基线。",
  "docs/ 下的白皮书、架构、里程碑、快速开始与运行文档。"
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Physics Tutoring Workspace</span>
          <h1>Phywise 不是拍题聊天，而是物理推导工作台。</h1>
          <p className="hero-text">
            当前仓库已经落下首版 monorepo、共享协议、Web/API 骨架和文档体系，
            下一步可以直接围绕题目解析、白板交互和 Tutor 流程继续开发。
          </p>
          <div className="hero-actions">
            <Link href="/workspace/demo" className="primary-link">
              查看 Demo 工作台
            </Link>
            <Link href="/docs" className="secondary-link">
              阅读文档入口
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-heading">
            <span>首发聚焦</span>
            <strong>题目自动重建 + 分步引导 + 教学级仿真</strong>
          </div>
          <ul className="compact-list">
            {productPillars.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid-section">
        <article className="info-card">
          <h2>产品基线</h2>
          <ul className="compact-list">
            <li>中国大陆优先，Web 首发，未来保留 PWA 与原生 App 两条路。</li>
            <li>学生主产品 + 教师轻功能，不把 v1 做成重后台。</li>
            <li>游客试用 + 手机号注册，先验证学习闭环与留存。</li>
          </ul>
        </article>

        <article className="info-card">
          <h2>工程基线</h2>
          <ul className="compact-list">
            {architecturePillars.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="roadmap-strip">
        <div>
          <span className="eyebrow">Milestones</span>
          <h2>M0 到 M4 的产品路径已经写入 docs/03-delivery。</h2>
        </div>
        <p>
          这套仓库现在是可开发基线，不是静态提案。重点已经从“想法描述”
          进入“协议、骨架和交付文档”。
        </p>
      </section>
    </main>
  );
}

