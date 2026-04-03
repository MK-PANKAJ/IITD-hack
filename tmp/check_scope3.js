const { Client } = require('pg');
const neo4j = require('neo4j-driver');

async function test() {
  console.log("--- Testing PostgreSQL Scope 3 Credentials ---");
  const pgClient = new Client('postgresql://cloudgreen_admin:cg-poly-s3cur3-2026!@localhost:5432/cloudgreen');
  try {
    await pgClient.connect();
    const res = await pgClient.query("SELECT scope, status, COUNT(*) FROM verifiable_credentials GROUP BY scope, status");
    console.log("Scope Counts:", res.rows);
    
    const sample = await pgClient.query("SELECT vc_data FROM verifiable_credentials WHERE scope = 'scope3' LIMIT 1");
    if (sample.rows.length > 0) {
      const data = JSON.parse(sample.rows[0].vc_data);
      console.log("Sample Scope 3 VC Data (Check for proof):", {
        type: data.type,
        scope: data.credentialSubject ? data.credentialSubject.scope : 'missing',
        hasProof: !!data.proof
      });
    } else {
      console.log("No Scope 3 credentials found in PostgreSQL.");
    }
  } catch (err) {
    console.error("PostgreSQL Error:", err.message);
  } finally {
    await pgClient.end();
  }

  console.log("\n--- Testing Neo4j Scope 3 Nodes ---");
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'cg-graph-s3cur3-2026!'));
  const session = driver.session();
  try {
    const res = await session.run("MATCH (s:Supplier)-[r:REPORTED]->(e:Emissions) WHERE r.scope = 'scope3' RETURN count(r) as count");
    console.log("Scope 3 Relationships in Neo4j:", res.records[0].get('count').toNumber());
  } catch (err) {
    console.error("Neo4j Error:", err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

test();
