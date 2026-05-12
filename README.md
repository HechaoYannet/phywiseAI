# Phywise

Phywise is a physics tutoring workspace for middle-school and high-school learners.
The product combines problem ingestion, structured whiteboard reasoning, guided tutoring,
and teaching-grade simulations in a single workflow.

## Repository Layout

- `apps/web`: Next.js student and teacher-facing web application.
- `apps/api`: FastAPI service for OCR orchestration, tutoring flows, and simulation APIs.
- `packages/contracts`: Shared TypeScript contracts for workspace, tutor, and simulation data.
- `packages/domain`: Shared domain helpers and demo fixtures.
- `packages/whiteboard-schema`: Whiteboard document schema decoupled from any renderer.
- `packages/design-tokens`: Shared design tokens for web and future app clients.
- `docs`: Product, architecture, delivery, and engineering documentation.

## Quick Start

Read [docs/README.md](/E:/otherProject/phywise/docs/README.md) first, then follow
[docs/04-engineering/quickstart.md](/E:/otherProject/phywise/docs/04-engineering/quickstart.md).

## Product Direction

The initial implementation in this repository focuses on:

- A client-agnostic `WorkspaceDocument`.
- A structured `TutorTurn` protocol instead of free-form chat.
- A teaching-grade `SimulationScene` contract for future physics modules.
- Documentation as a first-class deliverable under `docs/`.

