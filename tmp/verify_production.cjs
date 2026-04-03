const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

const API_BASE = "http://localhost:8787";

async function run() {
  console.log("--- 1. Authenticating as Admin ---");
  const loginRes = await axios.post(`${API_BASE}/api/auth/login`, {
    username: "admin@cloudgreen.test",
    password: "admin123",
    role: "admin"
  });
  const token = loginRes.data.token;
  console.log("Token obtained:", token.slice(0, 20) + "...");

  const csvContent = fs.readFileSync('c:/Users/Manish/Downloads/cloudgreen-os/tmp/test_emissions.csv', 'utf8');
  console.log("--- 2. Calculating SHA-256 Hash ---");
  const vcHash = crypto.createHash('sha256').update(csvContent).digest('hex');
  console.log("vcHash:", vcHash);

  console.log("--- 3. Generating ZK-Proof (3001 kgCO2e) ---");
  const proofRes = await axios.post(`${API_BASE}/api/utils/generate-zk-proof`, {
    emissionKg: 3001
  });
  const proofData = proofRes.data;
  console.log("ZK-Proof generated successfully.");

  console.log("--- 4. Submitting Verifiable Ingestion ---");
  try {
    const ingestRes = await axios.post(`${API_BASE}/api/suppliers/emissions/upload`, {
      csv: csvContent,
      vcHash: vcHash,
      proof: {
        proof: proofData.proof,
        publicSignals: proofData.publicSignals,
        totalEmissionKg: proofData.totalEmissionKg
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("VERIFICATION SUCCESS!");
    console.log("Batch ID:", ingestRes.data.batchId);
    console.log("VCs Issued:", ingestRes.data.credentials.length);
  } catch (err) {
    console.error("VERIFICATION FAILED:", err.response?.data || err.message);
    process.exit(1);
  }
}

run();
