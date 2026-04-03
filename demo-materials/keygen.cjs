const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

console.log("Generating RSA Keypair for Production Auditor...");
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

fs.writeFileSync(path.join(__dirname, "auditor_private.pem"), privateKey);
fs.writeFileSync(path.join(__dirname, "auditor_public.pem"), publicKey);
console.log("Saved auditor_private.pem and auditor_public.pem.");

const csvContent = `id,name,emissionsKg,date\nSUP-001,Green Energy Inc,150,2024-03-01\nSUP-002,Global Logistics,850,2024-03-02\nSUP-003,Acme Packaging,3000,2024-03-05`;

const sign = crypto.createSign("SHA256");
sign.update(csvContent);
sign.end();
const signature = sign.sign(privateKey, "hex");

const finalCsvContent = csvContent + "\n# SIGNATURE: " + signature;
fs.writeFileSync(path.join(__dirname, "demo_supplier_data.csv"), finalCsvContent);
console.log("Saved natively-signed demo_supplier_data.csv");

console.log("\n--- TEST PAYLOAD READY ---");
console.log("Public Key to place in .env:\nTRUSTED_AUDITOR_PUBLIC_KEY=\"" + publicKey.replace(/\n/g, "\\n") + "\"\n");
console.log("Signature to pass in UI when uploading demo_supplier_data.csv:\n");
console.log(signature);
console.log("\n--------------------------\n");
