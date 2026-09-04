"""
Both tests are DELIBERATELY FAILING. They exist to generate real trace.zip files
for the M0 spike, not to pass — see AI/DECISION.md D-003 and spike/README.md.
Mirrors fixtures/ts-suite/tests/drift.spec.ts so the two bindings produce structurally
comparable fixture traces.
"""
import os
from pathlib import Path


def _page_url(name: str) -> str:
    path = Path(__file__).parent.parent / "pages" / name
    return path.resolve().as_uri()


def test_saves_the_form(page):
    page.goto(_page_url("semantic.html"))
    # #save-btn was renamed on the page but the test still looks for the old id —
    # this is the "timeout" failureKind (locator drift, TRD §3).
    page.locator("#save-btn-RENAMED").click(timeout=3000)


def test_strict_mode_violation(page):
    page.goto(_page_url("data-grid.html"))
    # Matches all 40 row-action buttons — this is the "strict_violation" failureKind.
    page.locator("button.row-action").click(timeout=3000)
