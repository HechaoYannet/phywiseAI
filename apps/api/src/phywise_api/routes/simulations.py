from fastapi import APIRouter

from phywise_api.schemas import RebuildSimulationInput, SimulationScene
from phywise_api.services.demo import demo_simulation_scene

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


@router.post("/rebuild", response_model=SimulationScene)
def rebuild_simulation(_: RebuildSimulationInput) -> SimulationScene:
    return demo_simulation_scene()

