#!/usr/bin/env node
// ============================================================
// CloudGreen OS — JSON → PostgreSQL Migration Script
// Reads server/data/*.json and inserts into PostgreSQL with
// upsert (ON CONFLICT DO NOTHING) semantics.
//
// Prerequisites:
//   cd infra/data-system && docker compose up -d
//   npm install pg  (in project root or scripts/)
//
// Usage:
//   node scripts/migrate-json-to-polyglot.mjs
//
// Environment:
//   PGHOST     (default: localhost)
//   PGPORT     (default: 5432)
//   PGUSER     (default: cloudgreen_admin)
//   PGPASSWORD (default: cg-poly-s3cur3-2026!)
//   PGDATABASE (default: cloudgreen)
// ============================================================

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "server", "data");

// ── Config ──────────────────────────────────────────────────
const pool = new pg.Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "cloudgreen_admin",
  password: process.env.PGPASSWORD || "cg-poly-s3cur3-2026!",
  database: process.env.PGDATABASE || "cloudgreen",
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

// ── Helpers ─────────────────────────────────────────────────
async function loadJson(filename) {
  const raw = await readFile(join(DATA_DIR, filename), "utf8");
  return JSON.parse(raw);
}

function log(icon, msg) {
  console.log(`  ${icon}  ${msg}`);
}

// ── Migrators ───────────────────────────────────────────────

async function migrateSuppliers(client) {
  const suppliers = await loadJson("suppliers.json");
  if (!suppliers.length) return log("⬜", "suppliers.json — empty, skipped");

  const sql = `
    INSERT INTO suppliers (id, name, email, country, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `;
  let count = 0;
  for (const s of suppliers) {
    const res = await client.query(sql, [
      s.id,
      s.name,
      s.email,
      s.country,
      s.status || "active",
      s.createdAt || new Date().toISOString(),
    ]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `suppliers: ${count} inserted (${suppliers.length} total in JSON)`);
}

async function migrateSupplierEmissions(client) {
  const emissions = await loadJson("supplier-emissions.json");
  if (!emissions.length) return log("⬜", "supplier-emissions.json — empty, skipped");

  const sql = `
    INSERT INTO supplier_emissions (id, batch_id, supplier_name, scope, emissions_kg, uploaded_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `;
  let count = 0;
  for (const e of emissions) {
    const res = await client.query(sql, [
      e.id,
      e.batchId,
      e.supplierName,
      e.scope,
      e.emissionsKg,
      e.uploadedAt || new Date().toISOString(),
    ]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `supplier_emissions: ${count} inserted (${emissions.length} total in JSON)`);
}

async function migrateCredentials(client) {
  const creds = await loadJson("credentials.json");
  if (!creds.length) return log("⬜", "credentials.json — empty, skipped");

  const sql = `
    INSERT INTO verifiable_credentials (id, supplier_name, scope, emissions_kg, hash, anchored_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `;
  let count = 0;
  for (const c of creds) {
    const res = await client.query(sql, [
      c.id,
      c.supplierName,
      c.scope,
      c.emissionsKg,
      c.hash,
      c.anchoredAt || new Date().toISOString(),
    ]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `verifiable_credentials: ${count} inserted (${creds.length} total in JSON)`);
}

async function migrateOrders(client) {
  const orders = await loadJson("orders.json");
  if (!orders.length) return log("⬜", "orders.json — empty, skipped");

  const sql = `
    INSERT INTO orders (id, side, price, quantity, remaining_quantity, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO NOTHING
  `;
  let count = 0;
  for (const o of orders) {
    const res = await client.query(sql, [
      o.id,
      o.side,
      o.price,
      o.quantity,
      o.remainingQuantity ?? o.quantity,
      o.status || "open",
      o.createdAt || new Date().toISOString(),
    ]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `orders: ${count} inserted (${orders.length} total in JSON)`);
}

async function migrateTrades(client) {
  const trades = await loadJson("trades.json");
  if (!trades.length) return log("⬜", "trades.json — empty, skipped");

  const sql = `
    INSERT INTO trades (id, buy_order_id, sell_order_id, price, quantity, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `;
  let count = 0;
  for (const t of trades) {
    const res = await client.query(sql, [
      t.id,
      t.buyOrderId,
      t.sellOrderId,
      t.price,
      t.quantity,
      t.createdAt || new Date().toISOString(),
    ]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `trades: ${count} inserted (${trades.length} total in JSON)`);
}

async function migrateIncidents(client) {
  const incidents = await loadJson("incidents.json");
  if (!incidents.length) return log("⬜", "incidents.json — empty, skipped");

  const sql = `
    INSERT INTO incidents (id, title, severity, owner, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
  `;
  let count = 0;
  for (const i of incidents) {
    const res = await client.query(sql, [
      i.id,
      i.title,
      i.severity,
      i.owner,
      i.status || "open",
      i.createdAt || new Date().toISOString(),
    ]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `incidents: ${count} inserted (${incidents.length} total in JSON)`);
}

async function migrateTokenBalances(client) {
  const balances = await loadJson("token-balances.json");
  const entries = Object.entries(balances);
  if (!entries.length) return log("⬜", "token-balances.json — empty, skipped");

  const sql = `
    INSERT INTO token_balances (account, balance)
    VALUES ($1, $2)
    ON CONFLICT (account) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now()
  `;
  let count = 0;
  for (const [account, balance] of entries) {
    const res = await client.query(sql, [account, balance]);
    if (res.rowCount > 0) count++;
  }
  log("✅", `token_balances: ${count} upserted (${entries.length} total in JSON)`);
}

async function migrateAnalyticsEvents(client) {
  const events = await loadJson("analytics-events.json");
  if (!events.length) return log("⬜", "analytics-events.json — empty, skipped");

  const sql = `
    INSERT INTO analytics_events (id, event, distinct_id, properties, ts)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id, ts) DO NOTHING
  `;
  let count = 0;
  for (const e of events) {
    try {
      const res = await client.query(sql, [
        e.id,
        e.event,
        e.distinctId,
        JSON.stringify(e.properties || {}),
        e.ts || new Date().toISOString(),
      ]);
      if (res.rowCount > 0) count++;
    } catch (err) {
      // Partition may not exist for ts — log and continue
      log("⚠️", `analytics event ${e.id} skipped: ${err.message}`);
    }
  }
  log("✅", `analytics_events: ${count} inserted (${events.length} total in JSON)`);
}

// ── Validation ──────────────────────────────────────────────

async function validateCounts(client) {
  console.log("\n📊 Validation — Row Counts:\n");
  const tables = [
    "suppliers",
    "supplier_emissions",
    "verifiable_credentials",
    "orders",
    "trades",
    "incidents",
    "token_balances",
    "analytics_events",
  ];
  for (const table of tables) {
    const res = await client.query(`SELECT count(*) AS n FROM ${table}`);
    log("📋", `${table}: ${res.rows[0].n} rows`);
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  CloudGreen OS — JSON → PostgreSQL Migration    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await migrateSuppliers(client);
    await migrateSupplierEmissions(client);
    await migrateCredentials(client);
    await migrateOrders(client);
    await migrateTrades(client);
    await migrateIncidents(client);
    await migrateTokenBalances(client);
    await migrateAnalyticsEvents(client);

    await client.query("COMMIT");
    console.log("\n✅ All data committed to PostgreSQL.\n");

    await validateCounts(client);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migration failed — rolled back.\n", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  console.log("\n🏁 Migration complete. Run 'node scripts/migrate-to-neo4j.mjs' next.\n");
}

main();
