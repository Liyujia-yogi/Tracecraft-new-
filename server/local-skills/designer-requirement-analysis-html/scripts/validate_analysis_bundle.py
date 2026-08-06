#!/usr/bin/env python3
"""Validate the required data and HTML contract for this skill."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REQUIREMENT_ID = re.compile(r"^R\d{3,}$")
REQUIRED_PRODUCTS = {"移动云", "阿里云", "华为云", "腾讯云"}
REQUIRED_TABS = {
    "tab-requirement-analysis",
    "tab-design-review",
    "tab-competitor-analysis",
}


def load_json(path: Path, errors: list[str]) -> Any:
    if not path.exists():
        errors.append(f"缺少文件: {path}")
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"无法读取 JSON {path}: {exc}")
        return {}


def require_list(obj: dict[str, Any], key: str, errors: list[str]) -> list[Any]:
    value = obj.get(key)
    if not isinstance(value, list):
        errors.append(f"字段 {key} 必须为数组")
        return []
    return value


def validate_requirements(data: dict[str, Any], errors: list[str]) -> set[str]:
    requirements = require_list(data, "requirements", errors)
    ids: list[str] = []
    for index, item in enumerate(requirements):
        if not isinstance(item, dict):
            errors.append(f"requirements[{index}] 必须为对象")
            continue
        rid = item.get("id")
        if not isinstance(rid, str) or not REQUIREMENT_ID.match(rid):
            errors.append(f"requirements[{index}].id 无效: {rid!r}")
            continue
        ids.append(rid)
        if not str(item.get("text", "")).strip():
            errors.append(f"{rid} 缺少原文 text")
        if not str(item.get("source", "")).strip():
            errors.append(f"{rid} 缺少 source")
    if len(ids) != len(set(ids)):
        errors.append("requirements 中存在重复 Rxxx")
    if not ids:
        errors.append("requirements 不能为空")
    return set(ids)


def validate_coverage(
    data: dict[str, Any], requirement_ids: set[str], coverage_path: Path, errors: list[str]
) -> None:
    coverage_obj = load_json(coverage_path, errors) if coverage_path.exists() else data.get("coverage", [])
    if isinstance(coverage_obj, dict):
        coverage = coverage_obj.get("coverage", [])
    else:
        coverage = coverage_obj
    if not isinstance(coverage, list):
        errors.append("coverage 必须为数组")
        return
    seen: dict[str, str] = {}
    for index, item in enumerate(coverage):
        if not isinstance(item, dict):
            errors.append(f"coverage[{index}] 必须为对象")
            continue
        rid = item.get("sourceId")
        status = item.get("status")
        if rid not in requirement_ids:
            errors.append(f"coverage[{index}] 引用了未知需求 {rid!r}")
            continue
        if status not in {"covered", "uncertain", "missing"}:
            errors.append(f"{rid} 的 coverage.status 无效: {status!r}")
        if rid in seen:
            errors.append(f"{rid} 在 coverage 中重复")
        seen[rid] = str(status)
        if status == "missing":
            errors.append(f"{rid} 仍为 missing，禁止交付")
        if status == "uncertain" and not item.get("locations") and not item.get("reason"):
            errors.append(f"{rid} 为 uncertain，但没有 locations 或 reason")
    uncovered = sorted(requirement_ids - set(seen))
    if uncovered:
        errors.append("以下需求没有覆盖状态: " + ", ".join(uncovered))


def validate_pages(data: dict[str, Any], errors: list[str]) -> set[str]:
    pages = require_list(data, "pages", errors)
    page_ids: list[str] = []
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            errors.append(f"pages[{index}] 必须为对象")
            continue
        page_id = page.get("id")
        if not isinstance(page_id, str) or not page_id.strip():
            errors.append(f"pages[{index}].id 不能为空")
            continue
        page_ids.append(page_id)
        if page.get("origin") not in {"source_fact", "design_required"}:
            errors.append(f"页面 {page_id} 的 origin 必须为 source_fact 或 design_required")
        for key in ("designPoints", "designRisks"):
            if not isinstance(page.get(key), list):
                errors.append(f"页面 {page_id} 缺少数组字段 {key}")
    if len(page_ids) != len(set(page_ids)):
        errors.append("pages 中存在重复页面 ID")
    if not page_ids:
        errors.append("pages 不能为空")

    review = data.get("designReview")
    if not isinstance(review, dict):
        errors.append("缺少 designReview 对象")
        return set(page_ids)
    review_pages = review.get("pages")
    if not isinstance(review_pages, list):
        errors.append("designReview.pages 必须为数组")
        return set(page_ids)
    review_ids = {
        item.get("pageId")
        for item in review_pages
        if isinstance(item, dict) and isinstance(item.get("pageId"), str)
    }
    page_set = set(page_ids)
    if review_ids != page_set:
        errors.append(
            "designReview.pages 与 pages 不一致: "
            f"缺少={sorted(page_set - review_ids)}, 多出={sorted(review_ids - page_set)}"
        )
    for item in review_pages:
        if isinstance(item, dict) and not isinstance(item.get("items"), list):
            errors.append(f"designReview 页面 {item.get('pageId')} 缺少 items 数组")
    return page_set


def validate_flow(flow_path: Path, page_ids: set[str], errors: list[str]) -> None:
    flow = load_json(flow_path, errors)
    if not isinstance(flow, dict):
        return
    flow_pages = flow.get("pages")
    if not isinstance(flow_pages, list):
        errors.append("page_flow_schema.pages 必须为数组")
        return
    flow_ids = {
        item.get("id")
        for item in flow_pages
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if flow_ids != page_ids:
        errors.append(
            "page_flow_schema.pages 与 analysis pages 不一致: "
            f"缺少={sorted(page_ids - flow_ids)}, 多出={sorted(flow_ids - page_ids)}"
        )
    edges = flow.get("edges", [])
    if not isinstance(edges, list):
        errors.append("page_flow_schema.edges 必须为数组")
    else:
        for index, edge in enumerate(edges):
            if not isinstance(edge, dict):
                errors.append(f"edges[{index}] 必须为对象")
                continue
            if edge.get("from") not in flow_ids or edge.get("to") not in flow_ids:
                errors.append(f"edges[{index}] 的端点不存在")
    if not isinstance(flow.get("unknownEdges", []), list):
        errors.append("page_flow_schema.unknownEdges 必须为数组")
    if not isinstance(flow.get("coverage", []), list):
        errors.append("page_flow_schema.coverage 必须为数组")


def validate_competitors(data: dict[str, Any], errors: list[str]) -> None:
    competitors = data.get("competitors")
    if not isinstance(competitors, dict):
        errors.append("缺少 competitors 对象")
        return
    products = competitors.get("products")
    if not isinstance(products, list) or not REQUIRED_PRODUCTS.issubset(set(products)):
        errors.append("competitors.products 必须包含移动云、阿里云、华为云、腾讯云")
    evidence = competitors.get("evidence")
    if not isinstance(evidence, list):
        errors.append("competitors.evidence 必须为数组")
        return
    represented = set()
    for index, item in enumerate(evidence):
        if not isinstance(item, dict):
            errors.append(f"competitors.evidence[{index}] 必须为对象")
            continue
        product = item.get("product")
        status = item.get("status")
        if product in REQUIRED_PRODUCTS:
            represented.add(product)
        if status not in {"verified", "docs-only", "login-blocked", "inaccessible", "not-found"}:
            errors.append(f"竞品证据 {index} 的 status 无效: {status!r}")
        if status in {"verified", "docs-only"}:
            if not item.get("url") or not item.get("accessedAt"):
                errors.append(f"竞品证据 {index} 已验证但缺少 url 或 accessedAt")
    missing = REQUIRED_PRODUCTS - represented
    if missing:
        errors.append("竞品证据未覆盖: " + ", ".join(sorted(missing)))


def validate_knowledge(data: dict[str, Any], errors: list[str]) -> None:
    retrieval = data.get("knowledgeRetrieval")
    if not isinstance(retrieval, dict):
        errors.append("缺少 knowledgeRetrieval 对象")
        return
    for name in ("knowleddge", "fallback-kb"):
        entry = retrieval.get(name)
        if not isinstance(entry, dict) or not entry.get("status"):
            errors.append(f"knowledgeRetrieval.{name} 缺少 status")


def validate_html(path: Path, errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"缺少 HTML: {path}")
        return
    try:
        html = path.read_text(encoding="utf-8")
    except OSError as exc:
        errors.append(f"无法读取 HTML {path}: {exc}")
        return
    for tab in sorted(REQUIRED_TABS):
        if tab not in html:
            errors.append(f"HTML 缺少顶层 Tab 标识: {tab}")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--html", type=Path, required=True)
    parser.add_argument("--flow", type=Path)
    parser.add_argument("--coverage", type=Path)
    args = parser.parse_args()

    base = args.data.parent
    flow_path = args.flow or base / "page_flow_schema.json"
    coverage_path = args.coverage or base / "coverage-ledger.json"
    errors: list[str] = []
    data = load_json(args.data, errors)
    if isinstance(data, dict):
        requirement_ids = validate_requirements(data, errors)
        validate_coverage(data, requirement_ids, coverage_path, errors)
        page_ids = validate_pages(data, errors)
        validate_flow(flow_path, page_ids, errors)
        validate_competitors(data, errors)
        validate_knowledge(data, errors)
    validate_html(args.html, errors)

    if errors:
        print(f"FAIL: {len(errors)} 个问题", file=sys.stderr)
        for issue in errors:
            print(f"- {issue}", file=sys.stderr)
        return 1
    print("PASS: 需求、页面、设计汇总、页面流、竞品证据和 HTML Tab 校验通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
