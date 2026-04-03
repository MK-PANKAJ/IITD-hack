const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error("Usage: node sign_csv.cjs <path-to-your-csv-file>");
  process.exit(1);
}

const absoluteCsvPath = path.resolve(csvFilePath);
const privateKeyPath = path.join(__dirname, "demo-materials", "auditor_private.pem");

if (!fs.existsSync(absoluteCsvPath)) {
  console.error(`Error: CSV file not found at ${absoluteCsvPath}`);
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error("Error: auditor_private.pem not found. Run demo-materials/keygen.cjs first.");
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, "utf8");
let rawCsv = fs.readFileSync(absoluteCsvPath, "utf8").trim();

// Strip any existing signature if the user is double-signing
const lines = rawCsv.split(/\r?\n/);
if (lines[lines.length - 1].startsWith("# SIGNATURE:")) {
  lines.pop();
  rawCsv = lines.join("\n").trim();
}

// Generate mathematical signature of the raw CSV
const sign = crypto.createSign("SHA256");
sign.update(rawCsv);
sign.end();
const signature = sign.sign(privateKey, "hex");

// Append the new signature to the file natively
const signedCsv = rawCsv + "\n# SIGNATURE: " + signature;
fs.writeFileSync(absoluteCsvPath, signedCsv);

console.log(`\n✅ Success! Signed ${path.basename(csvFilePath)}`);
console.log("The file now has its cryptographic signature appended to the bottom.");
console.log("You can safely upload this file directly into the CloudGreen OS dashboard!\n");
