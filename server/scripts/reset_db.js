const fs = require('fs');
const path = require('path');
const { pg, neo } = require('../services');

async function resetPostgres() {
  console.log('--- Resetting PostgreSQL (Surgical) ---');
  try {
    // 1. Truncate application tables instead of dropping schema
    // This preserves Keycloak internal tables
    const tables = [
      'suppliers',
      'supplier_emissions',
      'verifiable_credentials',
      'trades',
      'orders',
      'incidents',
      'token_balances',
      'analytics_events'
    ];
    
    console.log(`Truncating tables: ${tables.join(', ')}`);
    await pg.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    console.log('Application tables truncated.');

    // 2. Seed baseline data for production wallet
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
