const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function generateKeyPair() {
  console.log("Generating RSA 2048-bit key pair...");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

function signCsv(csvText, privateKey) {
  const sign = crypto.createSign("SHA256");
  sign.update(csvText);
  sign.end();
  const signature = sign.sign(privateKey, "hex");
  return signature;
}

const main = () => {
  const csvPath = process.argv[2] || path.join(__dirname, "..", "data", "supplier-emissions.json");
  // For simplicity, we'll just sign a mock string if file not found
  const mockCsv = "supplier,scope,emissionsKg\nAcme Steel,scope3,150.5\nEcoFabric,scope2,30.1";
  
  const { publicKey, privateKey } = generateKeyPair();
  const signature = signCsv(mockCsv, privateKey);

  console.log("\n--- TRUSTED AUDITOR PUBLIC KEY (Add to server/index.js) ---");
  console.log(publicKey);
  console.log("--- DIGITAL SIGNATURE FOR MOCK CSV ---");
  console.log(signature);
  console.log("----------------------------------------\n");
  
  console.log("MOCK CSV USED:");
  console.log(mockCsv);
  console.log("\nCopy the signature above to test the 'Verifiable Upload' in the UI.");
};

main();
