import type { WhiteboardNode } from "@phywise/whiteboard-schema";
import {
  createDemoAssignment,
  createDemoProblemParseResult,
  createDemoSimulationScene,
  createDemoTutorTurn,
  createDemoWorkspace
} from "@phywise/domain";

const workspace = createDemoWorkspace();
const parseResult = createDemoProblemParseResult();
const tutorTurn = createDemoTutorTurn();
const simulationScene = createDemoSimulationScene();
const assignment = createDemoAssignment();

function getNodeTitle(node: WhiteboardNode): string {
  switch (node.kind) {
    case "rich_block":
      return String(node.payload.title ?? "内容块");
    case "ai_annotation":
      return String(node.payload.title ?? "AI 批注");
    case "phy_canvas":
      return String(node.payload.summary ?? "受力分析图");
    case "source_image":
      return String(node.payload.caption ?? node.payload.alt ?? "题图");
  }

  return "节点";
}

export default function DemoWorkspacePage() {
  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Demo Workspace</span>
          <h1>{workspace.title}</h1>
          <p>
            这页只保留为内部参考，用来查看协议、Tutor 回合、题目解析和仿真接口的样例数据。
          </p>
        </div>
        <div className="workspace-badge">
          <strong>教师分享码</strong>
          <span>{assignment.share_code}</span>
        </div>
      </header>

      <section className="workspace-grid">
        <article className="workspace-card">
          <div className="card-head">
            <h2>题目解析</h2>
            <span className="status-tag">confidence {parseResult.confidence}</span>
          </div>
          <p className="stem">{parseResult.stem}</p>
          <div className="chip-row">
            {parseResult.knowledge_links.map((item) => (
              <span key={item.id} className="chip">
                {item.title}
              </span>
            ))}
          </div>
        </article>

        <article className="workspace-card">
          <div className="card-head">
            <h2>Tutor 回合</h2>
            <span className="status-tag">{tutorTurn.mode}</span>
          </div>
          <p>{tutorTurn.prompt}</p>
          <div className="detail-block">
            <strong>Hint</strong>
            <p>{tutorTurn.hint}</p>
          </div>
          <div className="detail-block">
            <strong>Check</strong>
            <p>{tutorTurn.check}</p>
          </div>
        </article>

        <article className="workspace-card board-card">
          <div className="card-head">
            <h2>工作区节点</h2>
            <span className="status-tag">{workspace.whiteboard_nodes.length} nodes</span>
          </div>
          <div className="board-list">
            {workspace.whiteboard_nodes.map((node) => (
              <div key={node.id} className={`board-node kind-${node.kind}`}>
                <span className="node-kind">{node.kind}</span>
                <strong>{getNodeTitle(node)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="workspace-card">
          <div className="card-head">
            <h2>待处理建议</h2>
            <span className="status-tag">{workspace.suggestions.length} suggestions</span>
          </div>
          <ul className="compact-list">
            {workspace.suggestions.map((suggestion) => (
              <li key={suggestion.id}>{suggestion.reason}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="workspace-card">
          <div className="card-head">
            <h2>仿真协议</h2>
            <span className="status-tag">{simulationScene.module}</span>
          </div>
          <ul className="compact-list">
            {simulationScene.equations.map((equation) => (
              <li key={equation}>{equation}</li>
            ))}
          </ul>
          <div className="chip-row">
            {simulationScene.observables.map((observable) => (
              <span key={observable} className="chip muted-chip">
                {observable}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section className="subquestion-section">
        <h2>分步问题</h2>
        <div className="subquestion-list">
          {parseResult.subquestions.map((question) => (
            <article key={question.id} className="subquestion-card">
              <strong>{question.prompt}</strong>
              <span>{question.expected_output}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
