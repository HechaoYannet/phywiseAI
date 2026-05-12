from fastapi import APIRouter

from phywise_api.schemas import Assignment, AssignmentCreateInput, ReplayEvent
from phywise_api.services.demo import demo_assignment, demo_replay_events

router = APIRouter(prefix="/api", tags=["assignments"])


@router.post("/assignments", response_model=Assignment)
def create_assignment(_: AssignmentCreateInput) -> Assignment:
    return demo_assignment()


@router.get("/replays/{session_id}", response_model=list[ReplayEvent])
def get_replay(session_id: str) -> list[ReplayEvent]:
    _ = session_id
    return demo_replay_events()
