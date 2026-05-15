from io import BytesIO

from PIL import Image
from fastapi.testclient import TestClient
import pytest

from phywise_api.main import app, initialize_runtime


@pytest.fixture()
def client() -> TestClient:
    initialize_runtime()
    with TestClient(app) as test_client:
        yield test_client


def test_healthcheck(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_text_to_parse_job_to_workspace_flow(client: TestClient) -> None:
    upload_response = client.post(
        "/api/uploads",
        data={
            "text_content": "已知斜面倾角为30度，质量为m的物块静止在斜面上。\n(1) 画出受力图。\n(2) 求摩擦力大小。",
            "filename": "force-problem.md",
        },
    )
    asset = upload_response.json()

    assert upload_response.status_code == 200
    assert asset["source_provider"] == "manual_text"
    assert asset["storage_key"]

    job_response = client.post(
        "/api/problems/parse-jobs",
        json={"source_asset_id": asset["id"], "provider_strategy": "hybrid"},
    )
    job = job_response.json()

    assert job_response.status_code == 200
    assert job["status"] == "completed"
    assert job["result_problem_id"]

    problem_response = client.get(f"/api/problems/{job['result_problem_id']}")
    problem = problem_response.json()

    assert problem_response.status_code == 200
    assert problem["stem"]
    assert problem["knowledge_links"]
    assert problem["subquestions"]

    workspace_response = client.post(
        "/api/workspaces",
        json={
            "title": "受力分析工作区",
            "source_asset_id": asset["id"],
            "problem_id": problem["problem_id"],
        },
    )
    workspace = workspace_response.json()

    assert workspace_response.status_code == 200
    assert workspace["title"] == "受力分析工作区"
    assert workspace["whiteboard_nodes"]
    assert workspace["revision_id"]

    workspace["title"] = "受力分析工作区-已保存"
    save_response = client.patch(f"/api/workspaces/{workspace['id']}", json={"document": workspace})
    saved = save_response.json()

    assert save_response.status_code == 200
    assert saved["title"] == "受力分析工作区-已保存"


def test_blank_workspace_can_be_created_without_problem(client: TestClient) -> None:
    response = client.post("/api/workspaces", json={"title": "空白受力工作台"})
    body = response.json()

    assert response.status_code == 200
    assert body["title"] == "空白受力工作台"
    assert body["problem_id"] is None
    assert body["revision_id"]
    assert body["whiteboard_nodes"] == []


def test_workspace_source_analysis_and_suggestion_flow(client: TestClient) -> None:
    workspace_response = client.post("/api/workspaces", json={"title": "板内导入测试"})
    workspace = workspace_response.json()
    workspace_id = workspace["id"]

    attach_response = client.post(
        f"/api/workspaces/{workspace_id}/sources",
        data={
            "text_content": "质量为m的物块静止在粗糙斜面上，倾角为theta。(1) 画受力图。(2) 写平衡式。",
            "filename": "board-import.md",
        },
    )
    attached = attach_response.json()

    assert attach_response.status_code == 200
    assert any(node["kind"] == "rich_block" for node in attached["whiteboard_nodes"])
    assert attached["source_asset_id"]

    analyzed_response = client.post(f"/api/workspaces/{workspace_id}/analyze-source", json={})
    analyzed = analyzed_response.json()

    assert analyzed_response.status_code == 200
    assert analyzed["problem_id"]
    assert analyzed["suggestions"]
    assert any(item["status"] == "pending" for item in analyzed["suggestions"])

    diagram_suggestion = next(item for item in analyzed["suggestions"] if item["kind"] == "diagram_rebuild")
    accept_response = client.post(
        f"/api/workspaces/{workspace_id}/suggestions/{diagram_suggestion['id']}/accept"
    )
    accepted = accept_response.json()

    assert accept_response.status_code == 200
    assert any(item["id"] == diagram_suggestion["id"] and item["status"] == "accepted" for item in accepted["suggestions"])
    assert any(node["kind"] == "phy_canvas" for node in accepted["whiteboard_nodes"])

    board_response = client.post(
        f"/api/workspaces/{workspace_id}/analyze-board",
        json={"selected_object_refs": []},
    )
    board = board_response.json()

    assert board_response.status_code == 200
    assert board["revision_id"]

    pending = next(item for item in board["suggestions"] if item["status"] == "pending")
    reject_response = client.post(
        f"/api/workspaces/{workspace_id}/suggestions/{pending['id']}/reject"
    )
    rejected = reject_response.json()

    assert reject_response.status_code == 200
    assert any(item["id"] == pending["id"] and item["status"] == "rejected" for item in rejected["suggestions"])


def test_text_source_analysis_skips_duplicate_summary_node(client: TestClient) -> None:
    workspace_response = client.post("/api/workspaces", json={"title": "文本导入去重"})
    workspace_id = workspace_response.json()["id"]
    problem_text = "An object of mass m is at rest on a rough incline at angle theta."

    attach_response = client.post(
        f"/api/workspaces/{workspace_id}/sources",
        data={
            "text_content": problem_text,
            "filename": "incline-problem.txt",
        },
    )
    analyzed_response = client.post(f"/api/workspaces/{workspace_id}/analyze-source", json={})
    analyzed = analyzed_response.json()
    semantic_roles = [node["semantic_role"] for node in analyzed["whiteboard_nodes"]]

    assert attach_response.status_code == 200
    assert analyzed_response.status_code == 200
    assert semantic_roles.count("problem-source") == 1
    assert "source-summary" not in semantic_roles
    assert analyzed["suggestions"]


def test_upload_image_asset_returns_previewable_record(client: TestClient) -> None:
    image = Image.new("RGB", (32, 24), color=(255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)

    response = client.post(
        "/api/uploads",
        files={"file": ("diagram.png", buffer.getvalue(), "image/png")},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["kind"] == "image"
    assert body["storage_key"].endswith(".png")
