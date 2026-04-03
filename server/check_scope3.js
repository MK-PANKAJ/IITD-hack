const { Client } = require('pg');
const neo4j = require('neo4j-driver');

async function test() {
  const pgClient = new Client('postgresql://cloudgreen_admin:cg-poly-s3cur3-2026!@localhost:5432/cloudgreen');
  try {
    await pgClient.connect();
    
    console.log("--- Listing PostgreSQL Tables ---");
    const tables = await pgClient.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables:", tables.rows.map(r => r.table_name));

    console.log("\n--- Testing PostgreSQL Scope 3 Credentials ---");
    const res = await pgClient.query("SELECT * FROM verifiable_credentials WHERE scope = 'scope3' LIMIT 1");
    if (res.rows.length > 0) {
      console.log("Found Scope 3 VC.");
      const vc = JSON.parse(res.rows[0].vc_data);
      console.log("VC Proof Present:", !!vc.proof);
    } else {
      console.log("No Scope 3 credentials found.");
    }

    console.log("\n--- Checking Emissions Table Content ---");
    // Try both possible names
    for (const tableName of ['emissions', 'supplier_emissions']) {
      try {
        const rows = await pgClient.query(`SELECT * FROM ${tableName} LIMIT 1`);
        console.log(`Sample from ${tableName}:`, rows.rows[0]);
      } catch (e) {}
    }

  } catch (err) {
    console.log("PostgreSQL Error:", err.message);
  } finally {
    await pgClient.end();
  }

  console.log("\n--- Testing Neo4j Scope 3 Nodes ---");
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'cg-graph-s3cur3-2026!'));
  const session = driver.session();
  try {
    const res = await session.run("MATCH (s:Supplier)-[r:REPORTED]->(e:Emissions) RETURN s.name, r.scope, e.value, e.unit LIMIT 5");
    console.log("Neo4j Samples:", res.records.map(r => ({
      supplier: r.get(0),
      scope: r.get(1),
      value: r.get(2),
      unit: r.get(3)
    })));
  } catch (err) {
    console.log("Neo4j Error:", err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

test();
