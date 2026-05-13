from phywise_api.schemas import CreateWorkspaceInput, ProblemParseResult
from phywise_api.services.demo import demo_assignment, demo_parse_result, demo_simulation_scene, demo_tutor_turn
from phywise_api.services.parsing import infer_knowledge_links, split_subquestions
from phywise_api.services.workspaces import build_workspace_document


def test_split_subquestions_extracts_multiple_items() -> None:
    subquestions = split_subquestions("已知电压为U。\n(1) 求电流。\n(2) 求电功率。")

    assert len(subquestions) == 2
    assert subquestions[0].prompt.startswith("求电流")


def test_infer_knowledge_links_detects_force_topics() -> None:
    links = infer_knowledge_links("斜面上的物块受力平衡，求摩擦力。")

    assert any(link.key == "force-analysis" for link in links)


def test_demo_tutor_turn_remains_locked() -> None:
    tutor_turn = demo_tutor_turn()

    assert tutor_turn.mode == "ask"
    assert tutor_turn.reveal_state == "locked"


def test_workspace_builder_emits_nodes() -> None:
    parse_result: ProblemParseResult = demo_parse_result()
    workspace = build_workspace_document(
        CreateWorkspaceInput(
            title="斜面受力",
            source_asset_id=parse_result.source_asset_id,
            problem_id=parse_result.problem_id,
        ),
        parse_result,
    )

    assert workspace.whiteboard_nodes
    assert workspace.selection_state["focused_subquestion_id"] == "subq-1"


def test_demo_assignment_uses_share_code() -> None:
    assignment = demo_assignment()
    scene = demo_simulation_scene()

    assert assignment.share_code == "PHYWISE-DEMO"
    assert scene.module == "forces"
