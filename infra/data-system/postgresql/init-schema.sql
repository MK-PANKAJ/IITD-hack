-- ============================================================
-- CloudGreen OS — PostgreSQL Init Schema
-- Standalone SQL file for Docker Compose volume mount.
-- Mirrors the ConfigMap version in init-configmap.yaml.
-- ============================================================

-- Suppliers (source: suppliers.json)
CREATE TABLE IF NOT EXISTS suppliers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    country         CHAR(2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (name);
CREATE INDEX IF NOT EXISTS idx_suppliers_country ON suppliers (country);

-- Supplier Emissions (source: supplier-emissions.json)
CREATE TABLE IF NOT EXISTS supplier_emissions (
    id              TEXT PRIMARY KEY,
    batch_id        TEXT NOT NULL,
    supplier_name   TEXT NOT NULL,
    scope           TEXT NOT NULL
                    CHECK (scope IN ('scope1', 'scope2', 'scope3')),
    emissions_kg    NUMERIC(12,4) NOT NULL CHECK (emissions_kg >= 0),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emissions_supplier ON supplier_emissions (supplier_name);
CREATE INDEX IF NOT EXISTS idx_emissions_scope ON supplier_emissions (scope);
CREATE INDEX IF NOT EXISTS idx_emissions_batch ON supplier_emissions (batch_id);

-- Verifiable Credentials (source: credentials.json)
CREATE TABLE IF NOT EXISTS verifiable_credentials (
    id              TEXT PRIMARY KEY,
    supplier_name   TEXT NOT NULL,
    scope           TEXT NOT NULL,
    emissions_kg    NUMERIC(12,4) NOT NULL,
    hash            TEXT UNIQUE NOT NULL,
    anchored_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vc_hash ON verifiable_credentials (hash);
CREATE INDEX IF NOT EXISTS idx_vc_supplier ON verifiable_credentials (supplier_name);

-- Carbon Credit Orders (source: orders.json)
CREATE TABLE IF NOT EXISTS orders (
    id                  TEXT PRIMARY KEY,
    side                TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    price               NUMERIC(10,2) NOT NULL CHECK (price > 0),
    quantity            NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    remaining_quantity  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'filled', 'cancelled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_side ON orders (side, status);

-- Trades (source: trades.json)
CREATE TABLE IF NOT EXISTS trades (
    id              TEXT PRIMARY KEY,
    buy_order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sell_order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    price           NUMERIC(10,2) NOT NULL,
    quantity        NUMERIC(10,2) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trades_buy ON trades (buy_order_id);
CREATE INDEX IF NOT EXISTS idx_trades_sell ON trades (sell_order_id);

-- Incidents (source: incidents.json)
CREATE TABLE IF NOT EXISTS incidents (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    severity    TEXT NOT NULL
                CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    owner       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);

-- Token Balances (source: token-balances.json)
CREATE TABLE IF NOT EXISTS token_balances (
    account     TEXT PRIMARY KEY,
    balance     NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Analytics Events (source: analytics-events.json)
-- Partitioned by quarter for time-series scalability.
CREATE TABLE IF NOT EXISTS analytics_events (
    id              TEXT NOT NULL,
    event           TEXT NOT NULL,
    distinct_id     TEXT NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}',
    ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

CREATE TABLE IF NOT EXISTS analytics_events_2026_q1
    PARTITION OF analytics_events
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS analytics_events_2026_q2
    PARTITION OF analytics_events
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS analytics_events_2026_q3
    PARTITION OF analytics_events
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS analytics_events_2026_q4
    PARTITION OF analytics_events
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events (event);
CREATE INDEX IF NOT EXISTS idx_analytics_distinct ON analytics_events (distinct_id);
