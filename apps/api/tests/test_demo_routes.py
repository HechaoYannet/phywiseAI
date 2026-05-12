from fastapi.testclient import TestClient

from phywise_api.main import app

client = TestClient(app)


def test_healthcheck() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_parse_problem_returns_structured_payload() -> None:
    response = client.post("/api/problems/parse")
    body = response.json()

    assert response.status_code == 200
    assert body["problem_id"] == "problem-demo-001"
    assert body["knowledge_links"]
    assert body["subquestions"]


def test_create_workspace_returns_document() -> None:
    response = client.post(
        "/api/workspaces",
        json={
            "title": "测试工作区",
            "source_asset_id": "asset-demo-001",
            "problem_id": "problem-demo-001",
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["title"] == "斜面静止问题工作台"
    assert body["whiteboard_nodes"]

