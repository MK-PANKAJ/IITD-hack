// =============================================================================
// CloudGreen OS — GreenCredit Contract Verification
// Verifies the deployed contract source on PolygonScan (Amoy).
//
// Usage:
//   npx hardhat run scripts/verify.js --network polygonAmoy
//
// Prerequisites:
//   Set POLYGONSCAN_API_KEY in .env
// =============================================================================

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const networkName = hre.network.name;
  const deploymentFile = path.join(
    __dirname,
    "..",
    "deployments",
    `${networkName}-greencredit.json`
  );

  if (!fs.existsSync(deploymentFile)) {
    console.error(`Deployment file not found: ${deploymentFile}`);
    console.error("Run the deploy script first: npx hardhat run scripts/deploy.js --network polygonAmoy");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  console.log(`Verifying GreenCredit at ${deployment.contractAddress} on ${networkName}...`);

  try {
    await hre.run("verify:verify", {
      address: deployment.contractAddress,
      constructorArguments: [deployment.deployer],
    });
    console.log("✓ Contract verified successfully on PolygonScan!");
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ Contract already verified.");
    } else {
      console.error("Verification failed:", error.message);
      process.exit(1);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
