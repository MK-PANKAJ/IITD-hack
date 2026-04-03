"""
CloudGreen OS — CSRD Report Data Models
Pydantic schemas for CSRD compliance report data structures.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, computed_field


class Scope(str, Enum):
    """GHG Protocol emission scopes."""
    SCOPE1 = "scope1"
    SCOPE2 = "scope2"
    SCOPE3 = "scope3"


class RiskClass(str, Enum):
    """CSRD materiality risk classification."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Severity(str, Enum):
    """Incident severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ── Database DTOs ────────────────────────────────────────────────────────────

class SupplierRow(BaseModel):
    """Supplier record from PostgreSQL."""
    id: str
    name: str
    email: str
    country: str
    status: str
    created_at: datetime


class EmissionRow(BaseModel):
    """Supplier emission record from PostgreSQL."""
    id: str
    batch_id: str
    supplier_name: str
    scope: Scope
    emissions_kg: Decimal
    uploaded_at: datetime


class CredentialRow(BaseModel):
    """Verifiable credential record from PostgreSQL."""
    id: str
    supplier_name: str
    scope: str
    emissions_kg: Decimal
    hash: str
    anchored_at: datetime


class IncidentRow(BaseModel):
    """Incident record from PostgreSQL."""
    id: str
    title: str
    severity: Severity
    owner: str
    status: str
    created_at: datetime


class TokenBalanceRow(BaseModel):
    """Carbon token balance record from PostgreSQL."""
    account: str
    balance: Decimal


# ── CSRD Report Data Structures ──────────────────────────────────────────────

class ScopeBreakdown(BaseModel):
    """Emissions breakdown by GHG Protocol scope."""
    scope1_kg: Decimal = Decimal("0")
    scope2_kg: Decimal = Decimal("0")
    scope3_kg: Decimal = Decimal("0")

    @computed_field
    @property
    def total_kg(self) -> Decimal:
        return self.scope1_kg + self.scope2_kg + self.scope3_kg

    @computed_field
    @property
    def total_tonnes(self) -> Decimal:
        return (self.total_kg / 1000).quantize(Decimal("0.01"))


class SupplierExposure(BaseModel):
    """Top supplier by total emissions for risk assessment."""
    name: str
    total_emissions_kg: Decimal
    scope_count: int
    risk_class: RiskClass


class CSRDReportData(BaseModel):
    """Complete data payload for a CSRD compliance report."""
    report_id: str = Field(default_factory=lambda: f"csrd-{uuid.uuid4()}")
    organization: str
    reporting_year: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    # Emission data
    scope_breakdown: ScopeBreakdown
    supplier_count: int
    emission_record_count: int
    top_emitters: list[SupplierExposure]

    # Compliance metrics
    credential_count: int
    open_incidents: int
    total_incidents: int

    # Carbon market
    total_token_balance: Decimal
    active_orders: int

    # Classification
    risk_class: RiskClass
    csrd_compliance_score: Optional[float] = None

    @computed_field
    @property
    def year_over_year_target_kg(self) -> Decimal:
        """EU CSRD target: 4.2% annual reduction (Science-Based Targets)."""
        return (self.scope_breakdown.total_kg * Decimal("0.042")).quantize(
            Decimal("0.01")
        )


def classify_risk(total_kg: Decimal) -> RiskClass:
    """Classify risk based on total emissions."""
    if total_kg < 5000:
        return RiskClass.LOW
    elif total_kg < 20000:
        return RiskClass.MEDIUM
    elif total_kg < 100000:
        return RiskClass.HIGH
    return RiskClass.CRITICAL
