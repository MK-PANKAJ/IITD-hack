"""
CloudGreen OS — PostgreSQL Data Access Layer for CSRD Reports
Fetches emission, supplier, credential, and market data from PostgreSQL.
"""

from __future__ import annotations

import os
from decimal import Decimal
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from models import (
    CSRDReportData,
    EmissionRow,
    RiskClass,
    ScopeBreakdown,
    SupplierExposure,
    classify_risk,
)

load_dotenv()


def _get_connection():
    """Create a PostgreSQL connection using environment variables."""
    return psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=int(os.getenv("PGPORT", "5432")),
        user=os.getenv("PGUSER", "cloudgreen_admin"),
        password=os.getenv("PGPASSWORD", "cg-poly-s3cur3-2026!"),
        dbname=os.getenv("PGDATABASE", "cloudgreen"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def fetch_csrd_data(
    organization: str,
    reporting_year: int,
    conn=None,
) -> CSRDReportData:
    """
    Fetch all data required for a CSRD compliance report from PostgreSQL.

    Queries:
      1. Scope 1/2/3 emission totals from supplier_emissions
      2. Top emitting suppliers (risk exposure)
      3. Supplier count
      4. Verifiable credential count
      5. Incident summary
      6. Token market summary
      7. Active order count
    """
    should_close = conn is None
    if conn is None:
        conn = _get_connection()

    try:
        with conn.cursor() as cur:
            # ── 1. Scope breakdown ──────────────────────────────────────
            cur.execute("""
                SELECT
                    COALESCE(SUM(CASE WHEN scope = 'scope1' THEN emissions_kg ELSE 0 END), 0) AS scope1_kg,
                    COALESCE(SUM(CASE WHEN scope = 'scope2' THEN emissions_kg ELSE 0 END), 0) AS scope2_kg,
                    COALESCE(SUM(CASE WHEN scope = 'scope3' THEN emissions_kg ELSE 0 END), 0) AS scope3_kg,
                    COUNT(*) AS record_count
                FROM supplier_emissions
                WHERE EXTRACT(YEAR FROM uploaded_at) = %s
            """, (reporting_year,))
            scope_row = cur.fetchone()

            scope_breakdown = ScopeBreakdown(
                scope1_kg=Decimal(str(scope_row["scope1_kg"])),
                scope2_kg=Decimal(str(scope_row["scope2_kg"])),
                scope3_kg=Decimal(str(scope_row["scope3_kg"])),
            )
            emission_record_count = int(scope_row["record_count"])

            # ── 2. Top emitters ─────────────────────────────────────────
            cur.execute("""
                SELECT
                    supplier_name AS name,
                    SUM(emissions_kg) AS total_emissions_kg,
                    COUNT(DISTINCT scope) AS scope_count
                FROM supplier_emissions
                WHERE EXTRACT(YEAR FROM uploaded_at) = %s
                GROUP BY supplier_name
                ORDER BY total_emissions_kg DESC
                LIMIT 10
            """, (reporting_year,))

            top_emitters = []
            for row in cur.fetchall():
                total = Decimal(str(row["total_emissions_kg"]))
                top_emitters.append(SupplierExposure(
                    name=row["name"],
                    total_emissions_kg=total,
                    scope_count=int(row["scope_count"]),
                    risk_class=classify_risk(total),
                ))

            # ── 3. Supplier count ───────────────────────────────────────
            cur.execute("SELECT COUNT(*) AS n FROM suppliers")
            supplier_count = int(cur.fetchone()["n"])

            # ── 4. Verifiable credentials ───────────────────────────────
            cur.execute("""
                SELECT COUNT(*) AS n FROM verifiable_credentials
                WHERE EXTRACT(YEAR FROM anchored_at) = %s
            """, (reporting_year,))
            credential_count = int(cur.fetchone()["n"])

            # ── 5. Incidents ────────────────────────────────────────────
            cur.execute("""
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status = 'open') AS open_count
                FROM incidents
                WHERE EXTRACT(YEAR FROM created_at) = %s
            """, (reporting_year,))
            inc_row = cur.fetchone()
            total_incidents = int(inc_row["total"])
            open_incidents = int(inc_row["open_count"])

            # ── 6. Token balances ───────────────────────────────────────
            cur.execute("SELECT COALESCE(SUM(balance), 0) AS total FROM token_balances")
            total_token_balance = Decimal(str(cur.fetchone()["total"]))

            # ── 7. Active orders ────────────────────────────────────────
            cur.execute("SELECT COUNT(*) AS n FROM orders WHERE status = 'open'")
            active_orders = int(cur.fetchone()["n"])

        # ── Assemble report ─────────────────────────────────────────────
        risk = classify_risk(scope_breakdown.total_kg)

        # Compliance scoring (0-100 scale)
        csrd_score = _calculate_compliance_score(
            credential_count=credential_count,
            supplier_count=supplier_count,
            emission_record_count=emission_record_count,
            open_incidents=open_incidents,
        )

        return CSRDReportData(
            organization=organization,
            reporting_year=reporting_year,
            scope_breakdown=scope_breakdown,
            supplier_count=supplier_count,
            emission_record_count=emission_record_count,
            top_emitters=top_emitters,
            credential_count=credential_count,
            open_incidents=open_incidents,
            total_incidents=total_incidents,
            total_token_balance=total_token_balance,
            active_orders=active_orders,
            risk_class=risk,
            csrd_compliance_score=csrd_score,
        )

    finally:
        if should_close:
            conn.close()


def _calculate_compliance_score(
    credential_count: int,
    supplier_count: int,
    emission_record_count: int,
    open_incidents: int,
) -> float:
    """
    CSRD compliance readiness score (0-100).
    Based on data completeness, verification coverage, and incident exposure.
    """
    score = 0.0

    # 30 pts: Data completeness (have emission records)
    if emission_record_count > 0:
        score += min(30, emission_record_count * 3)

    # 30 pts: Verification coverage (VCs issued as % of suppliers)
    if supplier_count > 0:
        coverage = min(1.0, credential_count / max(supplier_count, 1))
        score += coverage * 30

    # 20 pts: Supplier onboarding
    score += min(20, supplier_count * 4)

    # 20 pts penalty: Open incidents reduce score
    incident_penalty = min(20, open_incidents * 5)
    score += 20 - incident_penalty

    return round(min(100, max(0, score)), 1)
