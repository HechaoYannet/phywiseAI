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
    case "condition_card":
      return node.payload.label;
    case "equation_block":
      return node.payload.latex;
    case "hint_card":
      return node.payload.title;
    case "simulation_object":
      return node.payload.title;
    default:
      return node.kind;
  }
}

export default function DemoWorkspacePage() {
  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Demo Workspace</span>
          <h1>{workspace.title}</h1>
          <p>
            这页不是最终白板实现，而是把共享协议、Tutor 回合、题目解析和仿真接口
            先串成一个可视基线。
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

