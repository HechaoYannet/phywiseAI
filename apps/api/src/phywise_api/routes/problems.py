from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from phywise_api.db import get_session
from phywise_api.schemas import CreateParseJobInput, ParseJob, ProblemParseResult
from phywise_api.services.parsing import create_parse_job, load_parse_job, load_problem, maybe_process_parse_job

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.post("/parse-jobs", response_model=ParseJob)
def create_problem_parse_job(
    input_data: CreateParseJobInput,
    session: Session = Depends(get_session),
) -> ParseJob:
    job = create_parse_job(session, input_data)
    maybe_process_parse_job(job.id)
    return load_parse_job(session, job.id) or job


@router.get("/parse-jobs/{job_id}", response_model=ParseJob)
def get_problem_parse_job(job_id: str, session: Session = Depends(get_session)) -> ParseJob:
    job = load_parse_job(session, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Parse job not found.")
    return job


@router.get("/{problem_id}", response_model=ProblemParseResult)
def get_problem(problem_id: str, session: Session = Depends(get_session)) -> ProblemParseResult:
    parse_result = load_problem(session, problem_id)
    if parse_result is None:
        raise HTTPException(status_code=404, detail="Problem not found.")
    return parse_result
