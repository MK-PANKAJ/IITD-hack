// =============================================================================
// CloudGreen OS — GreenCredit Token Test Suite
// Tests the core ERC-20 carbon credit functionality.
// =============================================================================

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("GreenCredit", function () {
  // ── Fixture ───────────────────────────────────────────────────────
  async function deployFixture() {
    const [admin, minter, verifier, user1, user2] = await ethers.getSigners();

    const GreenCredit = await ethers.getContractFactory("GreenCredit");
    const token = await GreenCredit.deploy(admin.address);
    await token.waitForDeployment();

    // Grant roles
    const MINTER_ROLE = await token.MINTER_ROLE();
    const VERIFIER_ROLE = await token.VERIFIER_ROLE();
    await token.grantRole(MINTER_ROLE, minter.address);
    await token.grantRole(VERIFIER_ROLE, verifier.address);

    return { token, admin, minter, verifier, user1, user2, MINTER_ROLE, VERIFIER_ROLE };
  }

  // ── Deployment ───────────────────────────────────────────────────
  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("GreenCredit");
      expect(await token.symbol()).to.equal("GCR");
    });

    it("should have 18 decimals", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.decimals()).to.equal(18);
    });

    it("should start with zero total supply", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.totalSupply()).to.equal(0);
    });

    it("should set default yearly mint cap to 1M GCR", async function () {
      const { token } = await loadFixture(deployFixture);
      expect(await token.yearlyMintCap()).to.equal(ethers.parseEther("1000000"));
    });

    it("should grant admin all roles", async function () {
      const { token, admin, MINTER_ROLE, VERIFIER_ROLE } = await loadFixture(deployFixture);
      const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await token.hasRole(MINTER_ROLE, admin.address)).to.be.true;
      expect(await token.hasRole(VERIFIER_ROLE, admin.address)).to.be.true;
    });
  });

  // ── Minting ──────────────────────────────────────────────────────
  describe("Minting for Carbon Reduction", function () {
    it("should mint credits for a verified reduction", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-1"));

      await expect(
        token.connect(minter).mintForReduction(
          eventId, user1.address, 500, "ipfs://evidence-1"
        )
      ).to.emit(token, "CarbonReductionMinted")
        .withArgs(eventId, user1.address, minter.address, 500, ethers.parseEther("500"), "ipfs://evidence-1");

      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
      expect(await token.totalReductionKg()).to.equal(500);
      expect(await token.totalEvents()).to.equal(1);
    });

    it("should reject duplicate event IDs", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-dup"));

      await token.connect(minter).mintForReduction(eventId, user1.address, 100, "ipfs://ev");
      await expect(
        token.connect(minter).mintForReduction(eventId, user1.address, 50, "ipfs://ev2")
      ).to.be.revertedWithCustomError(token, "EventAlreadyExists");
    });

    it("should reject zero reduction", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("zero-event"));

      await expect(
        token.connect(minter).mintForReduction(eventId, user1.address, 0, "ipfs://zero")
      ).to.be.revertedWithCustomError(token, "ZeroReduction");
    });

    it("should reject minting to zero address", async function () {
      const { token, minter } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("zero-addr"));

      await expect(
        token.connect(minter).mintForReduction(eventId, ethers.ZeroAddress, 100, "ipfs://x")
      ).to.be.revertedWithCustomError(token, "ZeroBeneficiary");
    });

    it("should reject minting from non-minter", async function () {
      const { token, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("unauth"));

      await expect(
        token.connect(user1).mintForReduction(eventId, user1.address, 100, "ipfs://x")
      ).to.be.reverted;
    });

    it("should store event details on-chain", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("detail-event"));

      await token.connect(minter).mintForReduction(eventId, user1.address, 250, "ipfs://detail");

      const event = await token.reductionEvents(eventId);
      expect(event.verifier).to.equal(minter.address);
      expect(event.beneficiary).to.equal(user1.address);
      expect(event.reductionKg).to.equal(250);
      expect(event.metadataURI).to.equal("ipfs://detail");
      expect(event.retired).to.be.false;
    });
  });

  // ── Claim & Verify ───────────────────────────────────────────────
  describe("Claim and Verify Workflow", function () {
    it("should allow submitting and approving a claim", async function () {
      const { token, verifier, user1 } = await loadFixture(deployFixture);
      const claimId = ethers.keccak256(ethers.toUtf8Bytes("claim-1"));

      await token.connect(user1).submitClaim(claimId, 200, "ipfs://claim-ev");
      await expect(
        token.connect(verifier).verifyClaim(claimId, true)
      ).to.emit(token, "ClaimVerified");

      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));
    });

    it("should not mint on rejected claim", async function () {
      const { token, verifier, user1 } = await loadFixture(deployFixture);
      const claimId = ethers.keccak256(ethers.toUtf8Bytes("claim-reject"));

      await token.connect(user1).submitClaim(claimId, 100, "ipfs://claim-rej");
      await token.connect(verifier).verifyClaim(claimId, false);

      expect(await token.balanceOf(user1.address)).to.equal(0);
    });
  });

  // ── Retirement ───────────────────────────────────────────────────
  describe("Credit Retirement", function () {
    it("should burn credits and track retirement", async function () {
      const { token, minter, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("retire-event"));

      await token.connect(minter).mintForReduction(eventId, user1.address, 300, "ipfs://r");
      await token.connect(user1).retireCredits(ethers.parseEther("100"));

      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));
      expect(await token.totalRetiredCredits()).to.equal(ethers.parseEther("100"));
    });

    it("should reject retiring more than balance", async function () {
      const { token, user1 } = await loadFixture(deployFixture);

      await expect(
        token.connect(user1).retireCredits(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(token, "InsufficientBalance");
    });
  });

  // ── Pausability ──────────────────────────────────────────────────
  describe("Pause/Unpause", function () {
    it("should prevent minting when paused", async function () {
      const { token, admin, minter, user1 } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("paused-event"));

      await token.connect(admin).pause();
      await expect(
        token.connect(minter).mintForReduction(eventId, user1.address, 100, "ipfs://p")
      ).to.be.revertedWithCustomError(token, "EnforcedPause");

      await token.connect(admin).unpause();
      await token.connect(minter).mintForReduction(eventId, user1.address, 100, "ipfs://p");
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
    });
  });
});
