from fastapi import APIRouter

from phywise_api.schemas import TutorTurn, TutorTurnInput
from phywise_api.services.demo import demo_tutor_turn

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


@router.post("/turns", response_model=TutorTurn)
def create_tutor_turn(_: TutorTurnInput) -> TutorTurn:
    return demo_tutor_turn()

