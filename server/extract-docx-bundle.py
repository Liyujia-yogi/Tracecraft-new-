#!/usr/bin/env python3
"""Extract DOCX body order, tables, notes, headers, footers and embedded-file inventory."""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def text_of(node: ET.Element) -> str:
    return "".join(part.text or "" for part in node.findall(".//w:t", NS)).strip()


def body_blocks(xml: bytes) -> list[dict[str, object]]:
    root = ET.fromstring(xml)
    body = root.find("w:body", NS)
    if body is None:
        return []
    blocks: list[dict[str, object]] = []
    for child in body:
        if child.tag == f"{W}p":
            text = text_of(child)
            drawings = len(child.findall(".//w:drawing", NS))
            if text or drawings:
                blocks.append({"type": "paragraph", "text": text, "images": drawings})
        elif child.tag == f"{W}tbl":
            rows = []
            for row in child.findall("w:tr", NS):
                rows.append([text_of(cell) for cell in row.findall("w:tc", NS)])
            blocks.append({"type": "table", "rows": rows})
    return blocks


def xml_text(xml: bytes) -> list[str]:
    root = ET.fromstring(xml)
    values = []
    for node in root.iter():
        if node.tag in {f"{W}p", f"{W}comment", f"{W}footnote", f"{W}endnote"}:
            value = text_of(node)
            if value and value not in values:
                values.append(value)
    return values


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    source = Path(sys.argv[1])
    with zipfile.ZipFile(source) as archive:
        names = set(archive.namelist())
        result: dict[str, object] = {
            "body": body_blocks(archive.read("word/document.xml")),
            "headers": [],
            "footers": [],
            "comments": [],
            "footnotes": [],
            "endnotes": [],
            "media": sorted(name for name in names if name.startswith("word/media/") and not name.endswith("/")),
            "embeddings": sorted(name for name in names if name.startswith("word/embeddings/") and not name.endswith("/")),
        }
        for name in sorted(names):
            if re.fullmatch(r"word/header\d+\.xml", name):
                result["headers"].extend(xml_text(archive.read(name)))
            elif re.fullmatch(r"word/footer\d+\.xml", name):
                result["footers"].extend(xml_text(archive.read(name)))
        for key, name in (("comments", "word/comments.xml"), ("footnotes", "word/footnotes.xml"), ("endnotes", "word/endnotes.xml")):
            if name in names:
                result[key] = xml_text(archive.read(name))
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
