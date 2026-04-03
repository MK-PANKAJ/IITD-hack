const fs = require('fs');
const path = require('path');
const { pg, neo } = require('../services');

async function resetPostgres() {
  console.log('--- Resetting PostgreSQL ---');
  try {
    // 1. Drop public schema to kill everything
    await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Public schema dropped and recreated.');

    // 2. Read init-schema.sql
    const sqlPath = path.join(__dirname, '../../infra/data-system/postgresql/init-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // 3. Execute SQL
    await pg.query(sql);
    console.log('Schema re-initialized from init-schema.sql.');

    // 4. Seed baseline data for production wallet
    const signerAddress = process.env.BLOCKCHAIN_SIGNER_KEY_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat #0
    await pg.query(
      'INSERT INTO token_balances (account, balance) VALUES ($1, $2)',
      [signerAddress, 0]
    );
    console.log(`Baseline Token Balance initialized for ${signerAddress}.`);

  } catch (err) {
    console.error('PostgreSQL Reset Error:', err);
    process.exit(1);
  }
}

async function resetNeo4j() {
  console.log('--- Resetting Neo4j ---');
  const session = neo.session();
  try {
    // 1. Clear all nodes and relationships
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('Graph cleared.');

    // 2. Create seed Organization
    await session.run("CREATE (:Organization {name: 'CloudGreen', industry: 'Sustainability', country: 'Global'})");
    console.log("Seed Organization node 'CloudGreen' created.");

  } catch (err) {
    console.error('Neo4j Reset Error:', err);
    process.exit(1);
  } finally {
    await session.close();
  }
}

async function run() {
  await resetPostgres();
  await resetNeo4j();
  console.log('--- DATABASE RESET COMPLETE ---');
  process.exit(0);
}

run();
