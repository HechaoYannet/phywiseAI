from phywise_api.services.demo import (
    demo_assignment,
    demo_parse_result,
    demo_simulation_scene,
    demo_tutor_turn,
    demo_workspace,
)


def test_demo_parse_result_is_high_confidence() -> None:
    parse_result = demo_parse_result()

    assert parse_result.confidence > 0.8
    assert parse_result.needs_confirmation is False


def test_demo_workspace_carries_focus() -> None:
    workspace = demo_workspace()

    assert workspace.selection_state["focused_subquestion_id"] == "subq-1"
    assert workspace.mastery.misconceptions == ["misread-equilibrium"]


def test_demo_tutor_turn_remains_locked() -> None:
    tutor_turn = demo_tutor_turn()

    assert tutor_turn.mode == "ask"
    assert tutor_turn.reveal_state == "locked"


def test_demo_assignment_uses_share_code() -> None:
    assignment = demo_assignment()
    scene = demo_simulation_scene()

    assert assignment.share_code == "PHYWISE-DEMO"
    assert scene.module == "forces"
