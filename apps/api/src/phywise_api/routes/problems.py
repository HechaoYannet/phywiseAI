from fastapi import APIRouter

from phywise_api.schemas import ProblemParseResult
from phywise_api.services.demo import demo_parse_result

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.post("/parse", response_model=ProblemParseResult)
def parse_problem() -> ProblemParseResult:
    return demo_parse_result()

