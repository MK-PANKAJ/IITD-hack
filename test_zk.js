const { generateProof, verifyProof } = require("./server/circuits/zk_engine");

async function testZK() {
  console.log("Testing ZK Groth16 Verification...");
  const inputs = {
    scope: 3,
    totalEmissions: 100, // Should be >= 10
    limit: 10
  };
  
  try {
    const { proof, publicSignals } = await generateProof(inputs);
    console.log("Proof Generated Successfully.");
    
    const isValid = await verifyProof(proof, publicSignals);
    console.log("ZK Verification Result:", isValid ? "PASS" : "FAIL");
    process.exit(isValid ? 0 : 1);
  } catch (err) {
    console.error("ZK Test Failed:", err);
    process.exit(1);
  }
}

testZK();
