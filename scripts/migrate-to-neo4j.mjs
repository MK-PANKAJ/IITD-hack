#!/usr/bin/env node
// ============================================================
// CloudGreen OS — JSON → Neo4j Graph Migration Script
//
// Maps existing JSON schemas to a Neo4j graph model with:
//   - Organization nodes (suppliers + synthetic parent orgs)
//   - SUPPLIES_TO relationships (Tier 1→2→3 supply chain)
//   - EmissionRecord nodes with EMITS relationships
//   - VerifiableCredential nodes with VERIFIED_BY edges
//
// The synthetic supply chain hierarchy demonstrates Scope 3
// CO₂ tracing through nested supplier relationships using
// variable-length Cypher path queries.
//
// Prerequisites:
//   cd infra/data-system && docker compose up -d
//   npm install neo4j-driver  (in project root or scripts/)
//
// Usage:
//   node scripts/migrate-to-neo4j.mjs
//
// Environment:
//   NEO4J_URI      (default: bolt://localhost:7687)
//   NEO4J_USER     (default: neo4j)
//   NEO4J_PASSWORD (default: cg-graph-s3cur3-2026!)
// ============================================================

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "server", "data");

// ── Config ──────────────────────────────────────────────────
const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "cg-graph-s3cur3-2026!";

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

// ── Helpers ─────────────────────────────────────────────────
async function loadJson(filename) {
  const raw = await readFile(join(DATA_DIR, filename), "utf8");
  return JSON.parse(raw);
}

function log(icon, msg) {
  console.log(`  ${icon}  ${msg}`);
}

// ============================================================
// SYNTHETIC SUPPLY CHAIN HIERARCHY
// ============================================================
// CloudGreen OS is an organization that sources from Tier-1
// suppliers, who in turn source from Tier-2 and Tier-3.
// This models real-world Scope 3 upstream emissions.
//
//   CloudGreen OS (root)
//     ├── Acme Steel (Tier 1)
//     │     ├── Ironworks Ltd (Tier 2 — raw steel)
//     │     │     └── DeepMine Corp (Tier 3 — iron ore extraction)
//     │     └── CoalCo Energy (Tier 2 — coking coal)
//     ├── Blue Plastics (Tier 1)
//     │     ├── PetroBase Inc (Tier 2 — resin feedstock)
//     │     │     └── CrudeOil Partners (Tier 3 — crude extraction)
//     │     └── ChemMix GmbH (Tier 2 — chemical additives)
//     ├── GreenPack Solutions (Tier 1)
//     │     └── RecycleFiber Co (Tier 2 — recycled materials)
//     └── TechChip Systems (Tier 1)
//           ├── RareEarth Mining (Tier 2 — mineral extraction)
//           │     └── LithiumSource SA (Tier 3 — lithium refining)
//           └── SiliconPure Labs (Tier 2 — wafer fabrication)
// ============================================================

const SYNTHETIC_SUPPLY_CHAIN = {
  root: {
    name: "CloudGreen OS",
    country: "IN",
    tier: 0,
  },
  suppliers: [
    // ── Tier 1 (direct suppliers, from suppliers.json) ──
    {
      name: "Acme Steel",
      country: "IN",
      tier: 1,
      parentName: "CloudGreen OS",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 450.0, desc: "Steel smelting furnace" },
        { scope: "scope2", emissionsKg: 180.5, desc: "Factory grid electricity" },
      ],
    },
    {
      name: "Blue Plastics",
      country: "IN",
      tier: 1,
      parentName: "CloudGreen OS",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 310.2, desc: "Injection molding" },
        { scope: "scope2", emissionsKg: 95.0, desc: "Facility cooling systems" },
      ],
    },
    {
      name: "GreenPack Solutions",
      country: "DE",
      tier: 1,
      parentName: "CloudGreen OS",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 45.0, desc: "Cardboard press" },
        { scope: "scope2", emissionsKg: 22.3, desc: "Warehouse HVAC" },
      ],
    },
    {
      name: "TechChip Systems",
      country: "TW",
      tier: 1,
      parentName: "CloudGreen OS",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 520.0, desc: "Chip fabrication" },
        { scope: "scope2", emissionsKg: 340.0, desc: "Clean room power" },
      ],
    },

    // ── Tier 2 (sub-suppliers) ──
    {
      name: "Ironworks Ltd",
      country: "IN",
      tier: 2,
      parentName: "Acme Steel",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 820.0, desc: "Blast furnace operations" },
        { scope: "scope3", emissionsKg: 290.0, desc: "Upstream ore transport" },
      ],
    },
    {
      name: "CoalCo Energy",
      country: "AU",
      tier: 2,
      parentName: "Acme Steel",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 1450.0, desc: "Coal extraction & processing" },
      ],
    },
    {
      name: "PetroBase Inc",
      country: "US",
      tier: 2,
      parentName: "Blue Plastics",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 680.0, desc: "Ethylene cracking" },
        { scope: "scope2", emissionsKg: 210.0, desc: "Refinery electricity" },
      ],
    },
    {
      name: "ChemMix GmbH",
      country: "DE",
      tier: 2,
      parentName: "Blue Plastics",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 125.0, desc: "Chemical synthesis" },
        { scope: "scope2", emissionsKg: 55.0, desc: "Lab equipment power" },
      ],
    },
    {
      name: "RecycleFiber Co",
      country: "NL",
      tier: 2,
      parentName: "GreenPack Solutions",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 18.0, desc: "Fiber pulping" },
        { scope: "scope2", emissionsKg: 8.5, desc: "Plant electricity" },
      ],
    },
    {
      name: "RareEarth Mining",
      country: "CN",
      tier: 2,
      parentName: "TechChip Systems",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 920.0, desc: "Open-pit mining" },
        { scope: "scope3", emissionsKg: 380.0, desc: "Diesel haulage fleet" },
      ],
    },
    {
      name: "SiliconPure Labs",
      country: "JP",
      tier: 2,
      parentName: "TechChip Systems",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 340.0, desc: "Wafer furnace" },
        { scope: "scope2", emissionsKg: 150.0, desc: "Ultra-pure water systems" },
      ],
    },

    // ── Tier 3 (deep supply chain) ──
    {
      name: "DeepMine Corp",
      country: "BR",
      tier: 3,
      parentName: "Ironworks Ltd",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 2100.0, desc: "Iron ore extraction" },
        { scope: "scope3", emissionsKg: 640.0, desc: "Ocean freight to smelters" },
      ],
    },
    {
      name: "CrudeOil Partners",
      country: "SA",
      tier: 3,
      parentName: "PetroBase Inc",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 3200.0, desc: "Crude well operations" },
        { scope: "scope2", emissionsKg: 410.0, desc: "Pumping station power" },
      ],
    },
    {
      name: "LithiumSource SA",
      country: "CL",
      tier: 3,
      parentName: "RareEarth Mining",
      syntheticEmissions: [
        { scope: "scope1", emissionsKg: 580.0, desc: "Brine evaporation ponds" },
        { scope: "scope3", emissionsKg: 210.0, desc: "Chemical reagent transport" },
      ],
    },
  ],
};

// ============================================================
// GRAPH CREATION
// ============================================================

async function clearGraph(session) {
  log("🗑️", "Clearing existing graph data...");
  await session.run("MATCH (n) DETACH DELETE n");
  log("✅", "Graph cleared.");
}

async function createConstraints(session) {
  log("🔑", "Creating uniqueness constraints...");

  const constraints = [
    "CREATE CONSTRAINT org_name IF NOT EXISTS FOR (o:Organization) REQUIRE o.name IS UNIQUE",
    "CREATE CONSTRAINT emission_id IF NOT EXISTS FOR (e:EmissionRecord) REQUIRE e.id IS UNIQUE",
    "CREATE CONSTRAINT vc_id IF NOT EXISTS FOR (v:VerifiableCredential) REQUIRE v.id IS UNIQUE",
  ];

  for (const cypher of constraints) {
    try {
      await session.run(cypher);
    } catch (err) {
      // Constraint may already exist — safe to ignore
      if (!err.message.includes("already exists")) throw err;
    }
  }
  log("✅", "Constraints created.");
}

async function createOrganizationNodes(session) {
  log("🏢", "Creating Organization nodes...");

  // Root org
  await session.run(
    `MERGE (o:Organization {name: $name})
     ON CREATE SET o.country = $country, o.tier = $tier, o.status = 'active',
                   o.createdAt = datetime()`,
    SYNTHETIC_SUPPLY_CHAIN.root
  );

  // All suppliers (Tier 1, 2, 3)
  for (const supplier of SYNTHETIC_SUPPLY_CHAIN.suppliers) {
    await session.run(
      `MERGE (o:Organization {name: $name})
       ON CREATE SET o.country = $country, o.tier = $tier, o.status = 'active',
                     o.createdAt = datetime()`,
      { name: supplier.name, country: supplier.country, tier: neo4j.int(supplier.tier) }
    );
  }

  // Also merge in any suppliers from suppliers.json that aren't already in synthetic set
  const existingSuppliers = await loadJson("suppliers.json");
  const syntheticNames = new Set(SYNTHETIC_SUPPLY_CHAIN.suppliers.map((s) => s.name));
  for (const s of existingSuppliers) {
    if (!syntheticNames.has(s.name)) {
      await session.run(
        `MERGE (o:Organization {name: $name})
         ON CREATE SET o.country = $country, o.tier = 1, o.status = $status,
                       o.createdAt = datetime($createdAt)`,
        {
          name: s.name,
          country: s.country,
          status: s.status || "active",
          createdAt: s.createdAt,
        }
      );
    }
  }

  const countResult = await session.run("MATCH (o:Organization) RETURN count(o) AS n");
  log("✅", `Organization nodes: ${countResult.records[0].get("n")}`);
}

async function createSupplyChainRelationships(session) {
  log("🔗", "Creating SUPPLIES_TO relationships (supply chain hierarchy)...");

  for (const supplier of SYNTHETIC_SUPPLY_CHAIN.suppliers) {
    await session.run(
      `MATCH (parent:Organization {name: $parentName})
       MATCH (child:Organization {name: $childName})
       MERGE (child)-[r:SUPPLIES_TO]->(parent)
       ON CREATE SET r.tier = $tier, r.createdAt = datetime()`,
      {
        parentName: supplier.parentName,
        childName: supplier.name,
        tier: neo4j.int(supplier.tier),
      }
    );
  }

  const countResult = await session.run(
    "MATCH ()-[r:SUPPLIES_TO]->() RETURN count(r) AS n"
  );
  log("✅", `SUPPLIES_TO relationships: ${countResult.records[0].get("n")}`);
}

async function createEmissionRecords(session) {
  log("🌫️", "Creating EmissionRecord nodes and EMITS relationships...");

  let emissionCount = 0;

  // From existing supplier-emissions.json (real production data)
  const emissions = await loadJson("supplier-emissions.json");
  for (const e of emissions) {
    await session.run(
      `MATCH (o:Organization {name: $supplierName})
       MERGE (er:EmissionRecord {id: $id})
       ON CREATE SET er.scope = $scope,
                     er.emissionsKg = $emissionsKg,
                     er.batchId = $batchId,
                     er.uploadedAt = datetime($uploadedAt),
                     er.source = 'production'
       MERGE (o)-[:EMITS]->(er)`,
      {
        supplierName: e.supplierName,
        id: e.id,
        scope: e.scope,
        emissionsKg: e.emissionsKg,
        batchId: e.batchId,
        uploadedAt: e.uploadedAt,
      }
    );
    emissionCount++;
  }

  // From synthetic supply chain (demo data for deep tracing)
  let syntheticIdx = 0;
  for (const supplier of SYNTHETIC_SUPPLY_CHAIN.suppliers) {
    for (const emission of supplier.syntheticEmissions || []) {
      syntheticIdx++;
      const syntheticId = `syn-emission-${syntheticIdx.toString().padStart(4, "0")}`;
      await session.run(
        `MATCH (o:Organization {name: $supplierName})
         MERGE (er:EmissionRecord {id: $id})
         ON CREATE SET er.scope = $scope,
                       er.emissionsKg = $emissionsKg,
                       er.description = $description,
                       er.batchId = 'synthetic-demo',
                       er.uploadedAt = datetime(),
                       er.source = 'synthetic'
         MERGE (o)-[:EMITS]->(er)`,
        {
          supplierName: supplier.name,
          id: syntheticId,
          scope: emission.scope,
          emissionsKg: emission.emissionsKg,
          description: emission.desc,
        }
      );
      emissionCount++;
    }
  }

  log("✅", `EmissionRecord nodes: ${emissionCount} (production + synthetic)`);
}

async function createVerifiableCredentialNodes(session) {
  log("🔒", "Creating VerifiableCredential nodes and VERIFIED_BY edges...");

  const creds = await loadJson("credentials.json");
  let count = 0;
  for (const c of creds) {
    await session.run(
      `MERGE (vc:VerifiableCredential {id: $id})
       ON CREATE SET vc.hash = $hash,
                     vc.supplierName = $supplierName,
                     vc.scope = $scope,
                     vc.emissionsKg = $emissionsKg,
                     vc.anchoredAt = datetime($anchoredAt)
       WITH vc
       OPTIONAL MATCH (er:EmissionRecord)
         WHERE er.scope = $scope
         AND abs(er.emissionsKg - $emissionsKg) < 0.01
       WITH vc, er LIMIT 1
       FOREACH (_ IN CASE WHEN er IS NOT NULL THEN [1] ELSE [] END |
         MERGE (er)-[:VERIFIED_BY]->(vc)
       )`,
      {
        id: c.id,
        hash: c.hash,
        supplierName: c.supplierName,
        scope: c.scope,
        emissionsKg: c.emissionsKg,
        anchoredAt: c.anchoredAt,
      }
    );
    count++;
  }
  log("✅", `VerifiableCredential nodes: ${count}`);
}

// ============================================================
// DEMO QUERIES — executed after migration to prove the graph
// ============================================================

async function runDemoQueries(session) {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  DEMO: CO₂ Supply Chain Tracing Queries         ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Query 1: Full supply chain tree from CloudGreen OS
  log("🔍", "Query 1: All suppliers in the CloudGreen OS supply chain\n");
  const q1 = await session.run(`
    MATCH path = (root:Organization {name: 'CloudGreen OS'})
      <-[:SUPPLIES_TO*1..5]-(supplier:Organization)
    RETURN supplier.name AS supplier,
           supplier.country AS country,
           supplier.tier AS tier,
           length(path) AS depth
    ORDER BY depth, supplier.name
  `);
  console.log("    Supplier                 | Country | Tier | Depth");
  console.log("    ─────────────────────────┼─────────┼──────┼──────");
  for (const r of q1.records) {
    const name = r.get("supplier").padEnd(25);
    const country = r.get("country").padEnd(7);
    const tier = String(r.get("tier")).padEnd(4);
    const depth = String(r.get("depth"));
    console.log(`    ${name} | ${country} | ${tier} | ${depth}`);
  }

  // Query 2: Trace CO₂ through nested supplier chains
  console.log("");
  log("🔍", "Query 2: CO₂ emissions traced through full supply chain\n");
  const q2 = await session.run(`
    MATCH (root:Organization {name: 'CloudGreen OS'})
      <-[:SUPPLIES_TO*1..5]-(supplier:Organization)
      -[:EMITS]->(emission:EmissionRecord)
    RETURN supplier.name AS supplier,
           supplier.tier AS tier,
           emission.scope AS scope,
           emission.emissionsKg AS emissionsKg,
           emission.source AS source
    ORDER BY supplier.tier, emission.emissionsKg DESC
  `);
  console.log("    Supplier               | Tier | Scope  | kg CO₂   | Source");
  console.log("    ───────────────────────┼──────┼────────┼──────────┼───────────");
  for (const r of q2.records) {
    const name = r.get("supplier").padEnd(23);
    const tier = String(r.get("tier")).padEnd(4);
    const scope = r.get("scope").padEnd(6);
    const kg = String(r.get("emissionsKg")).padEnd(8);
    const source = r.get("source") || "unknown";
    console.log(`    ${name} | ${tier} | ${scope} | ${kg} | ${source}`);
  }

  // Query 3: Aggregate Scope 3 exposure
  console.log("");
  log("🔍", "Query 3: Total Scope 3 exposure across full supply chain\n");
  const q3 = await session.run(`
    MATCH (root:Organization {name: 'CloudGreen OS'})
      <-[:SUPPLIES_TO*1..5]-(s:Organization)
      -[:EMITS]->(e:EmissionRecord)
    WITH s.tier AS tier,
         sum(e.emissionsKg) AS totalKg,
         count(DISTINCT s) AS supplierCount,
         collect(DISTINCT e.scope) AS scopes
    RETURN tier, totalKg, supplierCount, scopes
    ORDER BY tier
  `);
  console.log("    Tier | Total kg CO₂ | Suppliers | Scopes");
  console.log("    ─────┼──────────────┼───────────┼────────────────────");
  for (const r of q3.records) {
    const tier = String(r.get("tier")).padEnd(4);
    const total = String(r.get("totalKg")).padEnd(12);
    const count = String(r.get("supplierCount")).padEnd(9);
    const scopes = r.get("scopes").join(", ");
    console.log(`    ${tier} | ${total} | ${count} | ${scopes}`);
  }

  // Query 4: Hotspot — which Tier 3 supplier has the highest CO₂?
  console.log("");
  log("🔍", "Query 4: Emission hotspot — highest CO₂ single source\n");
  const q4 = await session.run(`
    MATCH (root:Organization {name: 'CloudGreen OS'})
      <-[:SUPPLIES_TO*1..5]-(supplier:Organization)
      -[:EMITS]->(e:EmissionRecord)
    WITH supplier, sum(e.emissionsKg) AS totalKg
    ORDER BY totalKg DESC
    LIMIT 5
    RETURN supplier.name AS supplier,
           supplier.tier AS tier,
           supplier.country AS country,
           totalKg
  `);
  console.log("    Rank | Supplier               | Tier | Country | Total kg CO₂");
  console.log("    ─────┼────────────────────────┼──────┼─────────┼─────────────");
  q4.records.forEach((r, idx) => {
    const rank = String(idx + 1).padEnd(4);
    const name = r.get("supplier").padEnd(22);
    const tier = String(r.get("tier")).padEnd(4);
    const country = r.get("country").padEnd(7);
    const total = String(r.get("totalKg"));
    console.log(`    ${rank} | ${name} | ${tier} | ${country} | ${total}`);
  });

  // Query 5: Shortest path between root and deepest emitter
  console.log("");
  log("🔍", "Query 5: Supply chain path to highest Tier 3 emitter\n");
  const q5 = await session.run(`
    MATCH path = shortestPath(
      (root:Organization {name: 'CloudGreen OS'})
      <-[:SUPPLIES_TO*]-(deep:Organization {name: 'CrudeOil Partners'})
    )
    UNWIND nodes(path) AS node
    RETURN node.name AS name, node.tier AS tier
  `);
  const pathParts = q5.records.map((r) => r.get("name"));
  console.log(`    Path: ${pathParts.join(" ← ")}`);
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  CloudGreen OS — JSON → Neo4j Graph Migration   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const session = driver.session({ database: "neo4j" });

  try {
    await clearGraph(session);
    await createConstraints(session);
    await createOrganizationNodes(session);
    await createSupplyChainRelationships(session);
    await createEmissionRecords(session);
    await createVerifiableCredentialNodes(session);

    console.log("\n✅ Graph migration complete.\n");

    // Final stats
    const nodeCount = await session.run("MATCH (n) RETURN count(n) AS n");
    const relCount = await session.run("MATCH ()-[r]->() RETURN count(r) AS n");
    log("📊", `Total nodes: ${nodeCount.records[0].get("n")}`);
    log("📊", `Total relationships: ${relCount.records[0].get("n")}`);

    // Run demo queries to show the graph in action
    await runDemoQueries(session);
  } catch (err) {
    console.error("\n❌ Neo4j migration failed:\n", err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }

  console.log("\n🏁 Neo4j migration complete. Open http://localhost:7474 to explore the graph.\n");
}

main();
