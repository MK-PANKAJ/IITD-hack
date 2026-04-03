#!/usr/bin/env python3
"""
CloudGreen OS — CSRD Compliance Report Generator
Generates publication-quality PDF reports using WeasyPrint.

Usage:
    python generate_report.py --org "CloudGreen Industries" --year 2026
    python generate_report.py --org "CloudGreen Industries" --year 2026 --output reports/

Environment:
    PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
    (See .env or infra/data-system/docker-compose.yaml for defaults)
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import click
from dotenv import load_dotenv
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from db import fetch_csrd_data
from models import (
    CSRDReportData,
    RiskClass,
    ScopeBreakdown,
    SupplierExposure,
    classify_risk,
)

load_dotenv()

# Template directory
TEMPLATE_DIR = Path(__file__).parent / "templates"


def render_pdf(data: CSRDReportData, output_path: Path) -> Path:
    """
    Render a CSRD report to PDF using WeasyPrint.

    Steps:
        1. Load the Jinja2 HTML template
        2. Render with report data
        3. Convert HTML → PDF via WeasyPrint
    """
    # Set up Jinja2 environment
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=True,
    )
    template = env.get_template("csrd_report.html")

    # Render HTML
    html_content = template.render(data=data)

    # Generate PDF
    output_path.parent.mkdir(parents=True, exist_ok=True)
    html_doc = HTML(string=html_content, base_url=str(TEMPLATE_DIR))
    html_doc.write_pdf(str(output_path))

    return output_path


@click.command()
@click.option(
    "--org",
    required=True,
    help="Organization name for the report header.",
)
@click.option(
    "--year",
    required=True,
    type=int,
    help="Reporting year (e.g., 2026).",
)
@click.option(
    "--output",
    default="reports",
    help="Output directory for the generated PDF.",
)
def main(org: str, year: int, output: str):
    """Generate a CSRD-compliant sustainability report as PDF."""

    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║  CloudGreen OS — CSRD Report Generator                  ║")
    print(f"╠══════════════════════════════════════════════════════════╣")
    print(f"║  Organization: {org:<41}║")
    print(f"║  Year:         {year:<41}║")
    print(f"║  Mode:         {'PostgreSQL':<41}║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print()

    print("[1/3] Fetching data from PostgreSQL...")
    try:
        data = fetch_csrd_data(organization=org, reporting_year=year)
    except Exception as e:
        print(f"\n  ⚠ CRITICAL: Database connection failed: {e}")
        print("  → Aborting. CSRD Report requires verified PostgreSQL data.\n")
        import sys
        sys.exit(1)

    # Generate filename
    safe_org = org.lower().replace(" ", "-").replace("/", "-")[:30]
    filename = f"csrd-{safe_org}-{year}-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    output_path = Path(output) / filename

    # Render PDF
    print(f"[2/3] Rendering PDF template...")
    try:
        result_path = render_pdf(data, output_path)
    except Exception as e:
        print(f"\n  ✗ PDF generation failed: {e}")
        print("  → Ensure WeasyPrint system dependencies are installed:")
        print("    https://doc.courtbouillon.org/weasyprint/stable/first_steps.html")
        sys.exit(1)

    # Summary
    file_size = result_path.stat().st_size
    print(f"[3/3] Report generated successfully!")
    print()
    print(f"  📄 File: {result_path.absolute()}")
    print(f"  📏 Size: {file_size / 1024:.1f} KB")
    print(f"  🆔 Report ID: {data.report_id}")
    print(f"  📊 Compliance Score: {data.csrd_compliance_score}/100")
    print(f"  ⚠️  Risk Class: {data.risk_class.value.upper()}")
    print(f"  🎯 Total Emissions: {data.scope_breakdown.total_tonnes} tCO₂e")
    print()


if __name__ == "__main__":
    main()
