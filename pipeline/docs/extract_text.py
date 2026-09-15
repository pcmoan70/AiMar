#!/usr/bin/env python3
"""Full-text extraction for the eInnsyn document archive, keeping originals untouched.

  originals   /media/pc/ext4TB/AiMar/docs/einnsyn/<id>.<ext>      (never modified)
  text        /media/pc/ext4TB/AiMar/docs/text/<id>.txt           (one UTF-8 file per original)
  index       /media/pc/ext4TB/AiMar/docs/text/index.json         (id -> provenance record)

Every record ties the text to its original for attribution: source path, SHA-256, size, MIME
type, extraction method (pdf-text / ocr / mixed / pandoc / xlsx / plain / xml), pages, OCR'd
pages, character count, tool versions, timestamp, plus the eInnsyn entry id and title from
docs.json. Idempotent: a file whose SHA-256 already has a successful record is skipped.

Run in the aimar-ocr conda env:  conda run -n aimar-ocr python pipeline/docs/extract_text.py [--limit N] [--workers 4]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

SRC = Path(os.environ.get("DOCS_DIR", "/media/pc/ext4TB/AiMar/docs/einnsyn"))
OUT = Path(os.environ.get("TEXT_DIR", "/media/pc/ext4TB/AiMar/docs/text"))
INDEX = OUT / "index.json"
DOCS_JSON = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "docs.json"
OCR_LANG = os.environ.get("OCR_LANG", "nor+eng")
OCR_DPI = 300
MIN_CHARS_PER_PAGE = 40  # below this a PDF page is treated as a scan and OCR'd
CHECKPOINT_EVERY = 25


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def mime_of(path: Path) -> str:
    return subprocess.run(["file", "-b", "--mime-type", str(path)], capture_output=True, text=True, check=False).stdout.strip()


def tool_versions() -> dict:
    v = {}
    try:
        import fitz  # PyMuPDF
        v["pymupdf"] = fitz.version[0]
    except Exception:
        pass
    for name, args in (("tesseract", ["tesseract", "--version"]), ("pandoc", ["pandoc", "--version"])):
        try:
            out = subprocess.run(args, capture_output=True, text=True, check=False)
            v[name] = (out.stdout or out.stderr).splitlines()[0].split()[-1]
        except Exception:
            pass
    return v


def ocr_png(png: bytes) -> str:
    """OCR one PNG image with tesseract (Norwegian + English)."""
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", OCR_LANG, "--psm", "3"], input=png, capture_output=True, check=False)
    return r.stdout.decode("utf-8", "replace")


def extract_pdf(path: Path) -> tuple[str, str, int, int]:
    import fitz

    doc = fitz.open(path)
    parts, ocr_pages = [], 0
    for page in doc:
        text = page.get_text("text")
        if len(re.sub(r"\s", "", text)) < MIN_CHARS_PER_PAGE:
            png = page.get_pixmap(dpi=OCR_DPI, colorspace=fitz.csGRAY).tobytes("png")
            text = ocr_png(png)
            ocr_pages += 1
        parts.append(text)
    n = doc.page_count
    doc.close()
    method = "ocr" if ocr_pages == n else "pdf-text" if ocr_pages == 0 else "mixed"
    return "\f".join(parts), method, n, ocr_pages


def extract_image(path: Path) -> str:
    return ocr_png(path.read_bytes()) if path.suffix.lower() == ".png" else subprocess.run(["tesseract", str(path), "stdout", "-l", OCR_LANG], capture_output=True, check=False).stdout.decode("utf-8", "replace")


def extract_docx(path: Path) -> str:
    return subprocess.run(["pandoc", "-t", "plain", "--wrap=none", str(path)], capture_output=True, text=True, check=False).stdout


def extract_xlsx(path: Path) -> str:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    lines = []
    for ws in wb.worksheets:
        lines.append(f"## {ws.title}")
        for row in ws.iter_rows(values_only=True):
            if any(c is not None for c in row):
                lines.append("\t".join("" if c is None else str(c) for c in row))
    return "\n".join(lines)


def extract_plain(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def extract_xml(path: Path) -> str:
    try:
        return "\n".join(t.strip() for t in ET.parse(path).getroot().itertext() if t.strip())
    except ET.ParseError:
        return extract_plain(path)


def extract(path: Path, mime: str) -> tuple[str, str, int, int]:
    """Returns (text, method, pages, ocr_pages)."""
    if mime == "application/pdf":
        return extract_pdf(path)
    if mime.startswith("image/"):
        return extract_image(path), "ocr", 1, 1
    if mime in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"):
        return extract_docx(path), "pandoc", 0, 0
    if mime in ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",):
        return extract_xlsx(path), "xlsx", 0, 0
    if mime in ("text/xml", "application/xml"):
        return extract_xml(path), "xml", 0, 0
    if mime.startswith("text/"):
        return extract_plain(path), "plain", 0, 0
    raise ValueError(f"unsupported type {mime}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    index: dict = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    docs_meta = {}
    if DOCS_JSON.exists():
        for entry, items in json.loads(DOCS_JSON.read_text())["docs"].items():
            for d in items:
                docs_meta[d["id"]] = {"entry": entry, "title": d.get("title", ""), "format": d.get("format", "")}
    tools = tool_versions()
    files = sorted(p for p in SRC.iterdir() if p.is_file())
    todo = []
    for p in files:
        rec = index.get(p.stem)
        if rec and rec.get("method") != "failed" and rec.get("bytes") == p.stat().st_size:
            continue  # cheap check first; the SHA is verified inside the worker
        todo.append(p)
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(files)} originals, {len(index)} indexed, {len(todo)} to extract", flush=True)

    def work(p: Path) -> tuple[str, dict]:
        digest = sha256(p)
        rec = index.get(p.stem)
        if rec and rec.get("sha256") == digest and rec.get("method") != "failed":
            return p.stem, rec
        mime = mime_of(p)
        base = {"source": f"einnsyn/{p.name}", "sha256": digest, "bytes": p.stat().st_size, "mime": mime, "tools": tools, "extractedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), **docs_meta.get(p.stem, {})}
        try:
            text, method, pages, ocr_pages = extract(p, mime)
            text = text.replace("\r\n", "\n").strip()
            (OUT / f"{p.stem}.txt").write_text(text, encoding="utf-8")
            return p.stem, {**base, "text": f"text/{p.stem}.txt", "method": method, "pages": pages, "ocrPages": ocr_pages, "chars": len(text), "lang": OCR_LANG if ocr_pages else None}
        except Exception as e:  # noqa: BLE001
            return p.stem, {**base, "method": "failed", "error": str(e)[:200]}

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = [ex.submit(work, p) for p in todo]
        for fut in as_completed(futures):
            doc_id, rec = fut.result()
            index[doc_id] = rec
            done += 1
            if done % CHECKPOINT_EVERY == 0:
                INDEX.write_text(json.dumps(index, ensure_ascii=False))
                ocr = sum(1 for r in index.values() if r.get("ocrPages"))
                print(f"  {done}/{len(todo)} ({ocr} with OCR so far)", flush=True)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=0))
    methods: dict[str, int] = {}
    for r in index.values():
        methods[r.get("method", "?")] = methods.get(r.get("method", "?"), 0) + 1
    print(f"index.json: {len(index)} records {methods}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
