// =============================================================================
// CloudGreen OS — GreenCredit Deployment Script
// Deploys to Polygon Amoy testnet and performs initial setup.
//
// Usage:
//   npx hardhat run scripts/deploy.js --network polygonAmoy
//
// Prerequisites:
//   1. Fund deployer with MATIC: https://faucet.polygon.technology/
//   2. Set DEPLOYER_PRIVATE_KEY in .env
//   3. npx hardhat compile
// =============================================================================

const hre = require("hardhat");

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  CloudGreen OS — GreenCredit Token Deployment           ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Network:  ${hre.network.name.padEnd(45)}║`);
  console.log(`║  Chain ID: ${String(hre.network.config.chainId || "local").padEnd(45)}║`);
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`[1/5] Deployer:  ${deployer.address}`);
  console.log(`      Balance:   ${hre.ethers.formatEther(balance)} MATIC`);

  if (balance === 0n) {
    console.error("\n  ✗ Deployer account has 0 MATIC. Fund it first:");
    console.error("    https://faucet.polygon.technology/");
    process.exit(1);
  }

  // ── Deploy GreenCredit ─────────────────────────────────────────────
  console.log("\n[2/5] Deploying GreenCredit (GCR) token...");

  const GreenCredit = await hre.ethers.getContractFactory("GreenCredit");
  const greenCredit = await GreenCredit.deploy(deployer.address);
  await greenCredit.waitForDeployment();

  const contractAddress = await greenCredit.getAddress();
  console.log(`      ✓ GreenCredit deployed at: ${contractAddress}`);

  // ── Verify deployment ──────────────────────────────────────────────
  console.log("\n[3/5] Verifying deployment...");

  const name = await greenCredit.name();
  const symbol = await greenCredit.symbol();
  const decimals = await greenCredit.decimals();
  const totalSupply = await greenCredit.totalSupply();
  const yearlyMintCap = await greenCredit.yearlyMintCap();

  console.log(`      Name:          ${name}`);
  console.log(`      Symbol:        ${symbol}`);
  console.log(`      Decimals:      ${decimals}`);
  console.log(`      Total Supply:  ${hre.ethers.formatEther(totalSupply)} GCR`);
  console.log(`      Yearly Cap:    ${hre.ethers.formatEther(yearlyMintCap)} GCR per minter`);

  // ── Output summary ────────────────────────────────────────────────
  console.log("\n[4/4] Deployment complete!");
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Deployment Summary                                     ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Contract: ${contractAddress}  ║`);
  console.log(`║  Network:  ${hre.network.name.padEnd(45)}║`);
  console.log(`║  Deployer: ${deployer.address}  ║`);
  console.log("║                                                          ║");
  console.log("║  Next Steps:                                             ║");
  console.log("║  1. Verify on PolygonScan:                               ║");
  console.log("║     npx hardhat run scripts/verify.js --network amoy     ║");
  console.log("║  2. Grant MINTER_ROLE to your backend service            ║");
  console.log("║  3. Grant VERIFIER_ROLE to auditor wallets               ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Save deployment info for later scripts
  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    contractAddress,
    deployer: deployer.address,
    blockNumber: mintTx.blockNumber,
    deployedAt: new Date().toISOString(),
    transactionHash: mintTx.hash,
  };

  const fs = require("fs");
  const outputDir = "./deployments";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = `${outputDir}/${hre.network.name}-greencredit.json`;
  fs.writeFileSync(outputFile, JSON.stringify(deployment, null, 2));
  console.log(`\n  📄 Deployment info saved: ${outputFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
