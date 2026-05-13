from __future__ import annotations

import re
from pathlib import Path

import fitz
from PIL import Image
from sqlalchemy.orm import Session

from phywise_api.config import get_settings
from phywise_api.db import SessionLocal
from phywise_api.models import ParseJobRecord, ProblemRecord, SourceAssetRecord
from phywise_api.schemas import (
    ConfirmationItem,
    CreateParseJobInput,
    DiagramRegion,
    KnowledgeLink,
    PageRegion,
    ParseJob,
    ProblemCondition,
    ProblemParseResult,
    ProblemSubquestion,
    ProviderTraceEntry,
)
from phywise_api.services.common import make_id, now_iso
from phywise_api.storage import storage

settings = get_settings()


def create_parse_job(session: Session, input_data: CreateParseJobInput) -> ParseJob:
    now = now_iso()
    job = ParseJobRecord(
        id=make_id("parsejob"),
        source_asset_id=input_data.source_asset_id,
        provider_strategy=input_data.provider_strategy,
        status="queued",
        progress=0,
        created_at=now,
        updated_at=now,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return ParseJob.model_validate(job.__dict__)


def maybe_process_parse_job(job_id: str) -> None:
    if settings.parse_execution_mode == "inline":
        process_parse_job(job_id)
        return

    try:
        from redis import Redis
        from rq import Queue
    except ImportError:
        process_parse_job(job_id)
        return

    queue = Queue("phywise", connection=Redis.from_url(settings.redis_url))
    queue.enqueue(process_parse_job, job_id)


def process_parse_job(job_id: str) -> None:
    session = SessionLocal()
    try:
        job = session.get(ParseJobRecord, job_id)
        if job is None:
            return

        asset = session.get(SourceAssetRecord, job.source_asset_id)
        if asset is None:
            job.status = "failed"
            job.error_code = "asset_not_found"
            job.error_message = "Source asset does not exist."
            job.updated_at = now_iso()
            session.commit()
            return

        job.status = "processing"
        job.progress = 15
        job.updated_at = now_iso()
        session.commit()

        problem_id = make_id("problem")
        parse_result = parse_asset_to_problem(asset, job.provider_strategy, problem_id)
        problem = ProblemRecord(
            id=problem_id,
            source_asset_id=asset.id,
            parse_result=parse_result.model_dump(mode="json"),
            created_at=now_iso(),
            updated_at=now_iso(),
        )
        session.add(problem)

        asset.preview_pages = [item.model_dump() for item in parse_result.page_regions]
        job.status = "completed"
        job.progress = 100
        job.result_problem_id = problem_id
        job.updated_at = now_iso()
        session.commit()
    except Exception as exc:  # pragma: no cover - defensive path
        job = session.get(ParseJobRecord, job_id)
        if job is not None:
            job.status = "failed"
            job.error_code = "parse_failed"
            job.error_message = str(exc)
            job.updated_at = now_iso()
            session.commit()
        raise
    finally:
        session.close()


def load_parse_job(session: Session, job_id: str) -> ParseJob | None:
    session.expire_all()
    record = session.get(ParseJobRecord, job_id)
    if record is None:
        return None
    return ParseJob.model_validate(record.__dict__)


def load_problem(session: Session, problem_id: str) -> ProblemParseResult | None:
    record = session.get(ProblemRecord, problem_id)
    if record is None:
        return None
    return ProblemParseResult.model_validate(record.parse_result)


def parse_asset_to_problem(asset: SourceAssetRecord, provider_strategy: str, problem_id: str) -> ProblemParseResult:
    provider_trace: list[ProviderTraceEntry] = []
    warnings: list[str] = []
    normalized_text = ""
    page_regions = [PageRegion.model_validate(item) for item in (asset.preview_pages or [])]
    diagram_regions: list[DiagramRegion] = []
    confidence = 0.45

    if asset.kind in {"markdown", "latex", "other"}:
        normalized_text = storage.read_text(asset.storage_key).strip()
        provider_trace.append(
            ProviderTraceEntry(provider="manual_text", status="used", detail="Parsed from submitted text input.")
        )
        confidence = 0.95 if normalized_text else 0.2
    elif asset.kind == "pdf":
        normalized_text, pdf_regions = extract_pdf_text(asset.storage_key)
        if pdf_regions:
            page_regions = pdf_regions
        provider_trace.append(
            ProviderTraceEntry(provider="hybrid", status="used", detail="Parsed PDF text via PyMuPDF extraction.")
        )
        if settings.paddleocr_enabled:
            provider_trace.append(
                ProviderTraceEntry(provider="paddleocr", status="skipped", detail="OCR fallback reserved for image-heavy PDFs.")
            )
        else:
            provider_trace.append(
                ProviderTraceEntry(provider="paddleocr", status="unavailable", detail="Local OCR dependency is not installed.")
            )
        confidence = 0.82 if normalized_text else 0.42
    else:
        normalized_text = extract_image_text(asset.storage_key, provider_strategy, provider_trace, warnings)
        confidence = 0.74 if normalized_text else 0.28

    if not normalized_text:
        normalized_text = Path(asset.filename).stem
        warnings.append("OCR 未返回可用文本，当前结果主要基于文件名和预览区域。")

    knowledge_links = infer_knowledge_links(normalized_text)
    subquestions = split_subquestions(normalized_text)
    conditions = extract_conditions(normalized_text)
    diagram_type = infer_diagram_type(normalized_text)

    if asset.kind in {"image", "photo"}:
        width, height = image_dimensions(asset.storage_key)
        preview_key = asset.storage_key
        page_regions = [
            PageRegion(
                id=f"{asset.id}-page-1",
                page=1,
                label=asset.filename,
                preview_key=preview_key,
                width=width,
                height=height,
            )
        ]

    for region in page_regions:
        diagram_regions.append(
            DiagramRegion(
                id=f"{region.id}-diagram",
                page=region.page,
                label=f"{region.label} 图示区域",
                preview_key=region.preview_key,
                x=0,
                y=0,
                w=region.width,
                h=region.height,
                diagram_type=diagram_type,
            )
        )

    needs_confirmation = confidence < 0.8 or bool(warnings)
    confirmation_items = build_confirmation_items(needs_confirmation, subquestions, conditions, diagram_regions)
    stem = build_stem(normalized_text, subquestions)

    return ProblemParseResult(
        problem_id=problem_id,
        source_asset_id=asset.id,
        stem=stem,
        subquestions=subquestions,
        conditions=conditions,
        diagram_entities=[],
        knowledge_links=knowledge_links,
        provider_trace=provider_trace,
        normalized_text=normalized_text,
        page_regions=page_regions,
        diagram_regions=diagram_regions,
        confirmation_items=confirmation_items,
        confidence=confidence,
        needs_confirmation=needs_confirmation,
        warnings=warnings,
        created_at=now_iso(),
    )


def extract_pdf_text(storage_key: str) -> tuple[str, list[PageRegion]]:
    path = storage.resolve(storage_key)
    document = fitz.open(path)
    text_chunks: list[str] = []
    page_regions: list[PageRegion] = []
    for page_index, page in enumerate(document, start=1):
        text_chunks.append(page.get_text("text"))
        if page_index <= settings.max_preview_pages:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False)
            preview_key = f"previews/{path.stem}/page-{page_index}.png"
            storage.write_bytes(preview_key, pixmap.tobytes("png"))
            page_regions.append(
                PageRegion(
                    id=f"{path.stem}-page-{page_index}",
                    page=page_index,
                    label=f"{path.stem} 第 {page_index} 页",
                    preview_key=preview_key,
                    width=pixmap.width,
                    height=pixmap.height,
                )
            )
    document.close()
    return "\n".join(chunk.strip() for chunk in text_chunks if chunk.strip()), page_regions


def extract_image_text(
    storage_key: str,
    provider_strategy: str,
    provider_trace: list[ProviderTraceEntry],
    warnings: list[str],
) -> str:
    text = ""
    if provider_strategy in {"paddleocr", "hybrid"}:
        text = try_paddle_ocr(storage.resolve(storage_key), provider_trace)
    else:
        provider_trace.append(
            ProviderTraceEntry(provider="paddleocr", status="skipped", detail="Current strategy skips local OCR.")
        )

    if not text and provider_strategy in {"tencent_ocr", "hybrid"}:
        provider_trace.append(
            ProviderTraceEntry(
                provider="tencent_ocr",
                status="unavailable",
                detail="Cloud OCR adapter requires credentials and is not configured in this environment.",
            )
        )

    if not text:
        warnings.append("当前环境没有可用的图片 OCR 结果，请在确认页手动修正题干与小问。")
    return text


def try_paddle_ocr(path: Path, provider_trace: list[ProviderTraceEntry]) -> str:
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except ImportError:
        provider_trace.append(
            ProviderTraceEntry(provider="paddleocr", status="unavailable", detail="paddleocr is not installed.")
        )
        return ""

    ocr = PaddleOCR(use_angle_cls=True, lang="ch")
    result = ocr.ocr(str(path))
    lines: list[str] = []
    for block in result:
        for item in block:
            if len(item) < 2:
                continue
            lines.append(str(item[1][0]).strip())
    text = "\n".join(line for line in lines if line)
    if text:
        provider_trace.append(
            ProviderTraceEntry(provider="paddleocr", status="used", detail="Parsed image via local PaddleOCR.")
        )
    return text


def build_stem(normalized_text: str, subquestions: list[ProblemSubquestion]) -> str:
    if len(subquestions) > 1:
        first_prompt = subquestions[0].prompt
        return normalized_text.split(first_prompt)[0].strip() or normalized_text
    return normalized_text.strip()


def split_subquestions(text: str) -> list[ProblemSubquestion]:
    stripped = text.strip()
    if not stripped:
        return [
            ProblemSubquestion(
                id=make_id("subq"),
                prompt="请确认题目内容后开始推导。",
                expected_output="explanatory",
                knowledge_keys=[],
            )
        ]

    pattern = re.compile(r"(?:^|\n)\s*(?:[（(]?[0-9一二三四五六七八九][)）.、])\s*")
    matches = list(pattern.finditer(stripped))
    prompts: list[str] = []

    if not matches:
        prompts = [stripped]
    else:
        for index, match in enumerate(matches):
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(stripped)
            prompt = stripped[start:end].strip()
            if prompt:
                prompts.append(prompt)

    subquestions: list[ProblemSubquestion] = []
    for index, prompt in enumerate(prompts, start=1):
        subquestions.append(
            ProblemSubquestion(
                id=f"subq-{index}",
                prompt=prompt,
                expected_output=infer_output_type(prompt),
                knowledge_keys=[item.key for item in infer_knowledge_links(prompt)[:2]],
            )
        )
    return subquestions


def infer_output_type(prompt: str) -> str:
    if any(keyword in prompt for keyword in ("画出", "作图", "图", "示意")):
        return "diagrammatic"
    if any(keyword in prompt for keyword in ("说明", "解释", "分析")):
        return "explanatory"
    if any(keyword in prompt for keyword in ("表达式", "求", "计算")):
        return "algebraic"
    return "numeric"


def extract_conditions(text: str) -> list[ProblemCondition]:
    conditions: list[ProblemCondition] = []
    for index, line in enumerate(filter(None, (segment.strip() for segment in text.splitlines())), start=1):
        if any(token in line for token in ("已知", "质量", "速度", "加速度", "电阻", "电压", "倾角", "半径")):
            conditions.append(
                ProblemCondition(
                    id=f"cond-{index}",
                    label=line[:12],
                    value=line,
                    source="ocr",
                )
            )
        if len(conditions) >= 4:
            break

    if not conditions:
        conditions.append(
            ProblemCondition(
                id="cond-1",
                label="待确认条件",
                value="请在确认页补充题目中的已知量、状态和限制条件。",
                source="agent",
            )
        )
    return conditions


def infer_knowledge_links(text: str) -> list[KnowledgeLink]:
    lower_text = text.lower()
    links: list[KnowledgeLink] = []

    def add_link(key: str, title: str, kind: str = "concept", band: str = "cross_stage", weight: float = 0.82) -> None:
        links.append(KnowledgeLink(id=f"kk-{key}", key=key, title=title, kind=kind, grade_band=band, weight=weight))

    if any(keyword in text for keyword in ("受力", "摩擦", "牛顿", "斜面")):
        add_link("force-analysis", "受力分析")
        add_link("newton-second-law", "牛顿第二定律", kind="formula", band="high_school")
    if any(keyword in text for keyword in ("电路", "电流", "电压", "电阻")):
        add_link("circuit-analysis", "基础电路分析")
    if any(keyword in text for keyword in ("透镜", "光线", "反射", "折射", "像距")):
        add_link("geometric-optics", "几何光学")
    if any(keyword in text for keyword in ("速度", "位移", "加速度", "运动")) or "motion" in lower_text:
        add_link("kinematics", "运动学")

    if not links:
        add_link("problem-interpretation", "题意理解", weight=0.7)
    return links


def infer_diagram_type(text: str) -> str:
    if any(keyword in text for keyword in ("受力", "摩擦", "牛顿", "斜面")):
        return "force"
    if any(keyword in text for keyword in ("电路", "电流", "电压", "电阻")):
        return "circuit"
    if any(keyword in text for keyword in ("透镜", "光线", "反射", "折射")):
        return "optics"
    return "generic"


def build_confirmation_items(
    needs_confirmation: bool,
    subquestions: list[ProblemSubquestion],
    conditions: list[ProblemCondition],
    diagram_regions: list[DiagramRegion],
) -> list[ConfirmationItem]:
    if not needs_confirmation:
        return []

    items = [
        ConfirmationItem(
            id="confirm-stem",
            field="stem",
            label="请确认题干是否完整",
            reason="当前解析结果包含低置信度或退化信息。",
        )
    ]
    if subquestions:
        items.append(
            ConfirmationItem(
                id="confirm-subq-1",
                field="subquestion",
                label="请确认第一个小问",
                reason="小问切分可能依赖 OCR 结果，需要人工确认。",
                suggested_value=subquestions[0].prompt,
            )
        )
    if conditions:
        items.append(
            ConfirmationItem(
                id="confirm-cond-1",
                field="condition",
                label="请确认首个已知条件",
                reason="已知量抽取为规则推断结果。",
                suggested_value=conditions[0].value,
            )
        )
    if diagram_regions:
        items.append(
            ConfirmationItem(
                id="confirm-diagram-1",
                field="diagram",
                label="请确认题图区域",
                reason="图示结构化仅对部分题型做强约束，其余题型需要人工确认。",
                suggested_value=diagram_regions[0].label,
            )
        )
    return items


def image_dimensions(storage_key: str) -> tuple[int, int]:
    with Image.open(storage.resolve(storage_key)) as image:
        return image.width, image.height
