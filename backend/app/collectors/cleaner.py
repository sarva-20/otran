import re

import trafilatura
from selectolax.parser import HTMLParser


def clean_html(html: str) -> str:
    """Extract readable text while preserving table rows as separate lines."""
    parser = HTMLParser(html)
    table_lines: list[str] = []
    for row in parser.css("tr"):
        cells = [" ".join(cell.text().split()) for cell in row.css("th, td")]
        cells = [cell for cell in cells if cell]
        if cells:
            table_lines.append(" - ".join(cells))

    extracted = trafilatura.extract(html, include_tables=True, favor_precision=True) or ""
    if not extracted:
        body = parser.body
        extracted = body.text(separator="\n") if body else parser.text()
    lines = _normalise_lines(extracted)
    for table_line in table_lines:
        if table_line not in lines:
            lines.append(table_line)
    return "\n".join(lines)


def _normalise_lines(text: str) -> list[str]:
    return [
        re.sub(r"[ \t]+", " ", line).strip()
        for line in text.splitlines()
        if re.sub(r"[ \t]+", " ", line).strip()
    ]
