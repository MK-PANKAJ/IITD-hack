/**
 * CloudGreen OS — ZK Proof Engine (Real Groth16)
 * 
 * Uses snarkjs with Circom-compiled circuits for real zero-knowledge
 * range proofs on the BN128 elliptic curve.
 * 
 * Usage:
 *   const zkEngine = require("./circuits/zk_engine");
 *   const { proof, publicSignals } = await zkEngine.generateProof(150, 100000);
 *   const isValid = await zkEngine.verifyProof(proof, publicSignals);
 */

const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "build");

let _snarkjs = null;
let _vkey = null;

// Lazy-load snarkjs (ESM module) via dynamic import
async function getSnarkJS() {
  if (!_snarkjs) {
    _snarkjs = await import("snarkjs");
  }
  return _snarkjs;
}

function getVKey() {
  if (!_vkey) {
    const vkeyPath = path.join(BUILD_DIR, "verification_key.json");
    if (!fs.existsSync(vkeyPath)) {
      throw new Error("ZK Engine not initialized. Run: node server/circuits/setup.js");
    }
    _vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  }
  return _vkey;
}

/**
 * Generates a Groth16 ZK range proof.
 * Proves: 0 <= emissionKg <= maxKg without revealing emissionKg.
 * 
 * @param {number} emissionKg - The private emission value to prove
 * @param {number} maxKg      - The public upper bound
 * @returns {{ proof: object, publicSignals: string[] }}
 */
async function generateProof(emissionKg, maxKg = 100000) {
  const snarkjs = await getSnarkJS();
  
  const wasmPath = path.join(BUILD_DIR, "range_proof_js", "range_proof.wasm");
  const zkeyPath = path.join(BUILD_DIR, "range_proof_final.zkey");

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    throw new Error(
      "Circom artifacts missing. Run: node server/circuits/setup.js"
    );
  }

  // Signal inputs match the Circom circuit: `in` (private) and `maxValue` (public)
  const input = {
    in: Math.round(emissionKg),
    maxValue: Math.round(maxKg),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input, wasmPath, zkeyPath
  );

  return { proof, publicSignals };
}

/**
 * Verifies a Groth16 ZK range proof.
 * 
 * @param {object} proof         - The proof object from generateProof
 * @param {string[]} publicSignals - The public signals
 * @returns {boolean} true if the proof is cryptographically valid
 */
async function verifyProof(proof, publicSignals) {
  if (!proof || !publicSignals) return false;

  try {
    const snarkjs = await getSnarkJS();
    const vkey = getVKey();
    return await snarkjs.groth16.verify(vkey, publicSignals, proof);
  } catch {
    return false;
  }
}

module.exports = { generateProof, verifyProof };
