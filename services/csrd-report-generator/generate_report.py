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


def generate_demo_data(organization: str, year: int) -> CSRDReportData:
    """
    Generate realistic demo data for testing without a database connection.
    Used when --demo flag is set or PostgreSQL is unreachable.
    """
    scope = ScopeBreakdown(
        scope1_kg=Decimal("4520.50"),
        scope2_kg=Decimal("12890.75"),
        scope3_kg=Decimal("38450.00"),
    )

    top_emitters = [
        SupplierExposure(
            name="SteelCorp GmbH",
            total_emissions_kg=Decimal("18500.00"),
            scope_count=3,
            risk_class=RiskClass.MEDIUM,
        ),
        SupplierExposure(
            name="LogiTrans EU",
            total_emissions_kg=Decimal("12300.00"),
            scope_count=2,
            risk_class=RiskClass.MEDIUM,
        ),
        SupplierExposure(
            name="ChemWorks International",
            total_emissions_kg=Decimal("8900.00"),
            scope_count=2,
            risk_class=RiskClass.MEDIUM,
        ),
        SupplierExposure(
            name="PackageSolutions Ltd",
            total_emissions_kg=Decimal("4200.00"),
            scope_count=1,
            risk_class=RiskClass.LOW,
        ),
        SupplierExposure(
            name="GreenEnergy Solar",
            total_emissions_kg=Decimal("1250.00"),
            scope_count=1,
            risk_class=RiskClass.LOW,
        ),
    ]

    return CSRDReportData(
        organization=organization,
        reporting_year=year,
        scope_breakdown=scope,
        supplier_count=24,
        emission_record_count=156,
        top_emitters=top_emitters,
        credential_count=18,
        open_incidents=2,
        total_incidents=7,
        total_token_balance=Decimal("15420.50"),
        active_orders=5,
        risk_class=classify_risk(scope.total_kg),
        csrd_compliance_score=72.5,
    )


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
@click.option(
    "--demo",
    is_flag=True,
    default=False,
    help="Use demo data instead of querying PostgreSQL.",
)
def main(org: str, year: int, output: str, demo: bool):
    """Generate a CSRD-compliant sustainability report as PDF."""

    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║  CloudGreen OS — CSRD Report Generator                  ║")
    print(f"╠══════════════════════════════════════════════════════════╣")
    print(f"║  Organization: {org:<41}║")
    print(f"║  Year:         {year:<41}║")
    print(f"║  Mode:         {'Demo Data' if demo else 'PostgreSQL':<41}║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print()

    # Fetch or generate data
    if demo:
        print("[1/3] Using demo data...")
        data = generate_demo_data(org, year)
    else:
        print("[1/3] Fetching data from PostgreSQL...")
        try:
            data = fetch_csrd_data(organization=org, reporting_year=year)
        except Exception as e:
            print(f"\n  ⚠ Database connection failed: {e}")
            print("  → Falling back to demo data.\n")
            data = generate_demo_data(org, year)

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
