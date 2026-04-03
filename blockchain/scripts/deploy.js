const hre = require("hardhat");

async function main() {
  const GreenCredit = await hre.ethers.getContractFactory("GreenCredit");
  const greenCredit = await GreenCredit.deploy();

  await greenCredit.waitForDeployment();

  console.log("GreenCredit deployed to:", await greenCredit.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
