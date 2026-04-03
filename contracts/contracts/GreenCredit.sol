// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GreenCredit
 * @author CloudGreen OS
 * @notice ERC-20 carbon credit token minted upon verified carbon reduction events.
 *
 * @dev Key features:
 *   - Role-based access: MINTER_ROLE for verified carbon reduction minting
 *   - VERIFIER_ROLE for approving carbon reduction claims
 *   - Each mint is tied to a CarbonReductionEvent with on-chain provenance
 *   - Burnable: credits can be retired (burned) to offset emissions
 *   - Pausable: emergency stop for regulatory compliance
 *   - EIP-2612 Permit: gasless approvals
 *
 * Token Economics:
 *   - 1 GreenCredit (GCR) = 1 kgCO₂e reduced
 *   - 18 decimals (standard ERC-20)
 *   - No cap (supply grows with verified reductions)
 *   - Yearly minting limit per minter (configurable, default 1M GCR)
 */
contract GreenCredit is
    ERC20,
    ERC20Burnable,
    ERC20Permit,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    // ── Roles ───────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ── Carbon Reduction Event ──────────────────────────────────────────
    struct CarbonReductionEvent {
        bytes32 eventId;            // Unique event identifier
        address verifier;           // Address that verified the reduction
        address beneficiary;        // Address receiving the credits
        uint256 reductionKg;        // kgCO₂e reduced
        uint256 creditsIssued;      // GCR tokens minted (with 18 decimals)
        string  metadataURI;        // IPFS/Arweave URI for evidence documents
        uint256 timestamp;          // Block timestamp of minting
        bool    retired;            // Whether credits have been retired
    }

    // ── State ───────────────────────────────────────────────────────────
    /// @notice All carbon reduction events, indexed by eventId
    mapping(bytes32 => CarbonReductionEvent) public reductionEvents;

    /// @notice Ordered list of all event IDs for enumeration
    bytes32[] public eventIds;

    /// @notice Total kgCO₂e reduced across all events
    uint256 public totalReductionKg;

    /// @notice Total credits retired (burned for offset)
    uint256 public totalRetiredCredits;

    /// @notice Per-minter yearly minting cap (in wei, default 1M * 10^18)
    uint256 public yearlyMintCap;

    /// @notice Tracks minting per address per year
    mapping(address => mapping(uint256 => uint256)) public yearlyMinted;

    /// @notice Pending (unverified) reduction claims
    mapping(bytes32 => PendingClaim) public pendingClaims;

    struct PendingClaim {
        address claimant;
        uint256 reductionKg;
        string  metadataURI;
        uint256 submittedAt;
        bool    exists;
    }

    // ── Events ──────────────────────────────────────────────────────────
    event CarbonReductionMinted(
        bytes32 indexed eventId,
        address indexed beneficiary,
        address indexed verifier,
        uint256 reductionKg,
        uint256 creditsIssued,
        string  metadataURI
    );

    event CreditsRetired(
        bytes32 indexed eventId,
        address indexed retirer,
        uint256 amount
    );

    event ClaimSubmitted(
        bytes32 indexed claimId,
        address indexed claimant,
        uint256 reductionKg
    );

    event ClaimVerified(
        bytes32 indexed claimId,
        address indexed verifier,
        bool    approved
    );

    event YearlyMintCapUpdated(uint256 oldCap, uint256 newCap);

    // ── Errors ──────────────────────────────────────────────────────────
    error EventAlreadyExists(bytes32 eventId);
    error EventNotFound(bytes32 eventId);
    error ZeroReduction();
    error ZeroBeneficiary();
    error YearlyCapExceeded(address minter, uint256 year, uint256 attempted, uint256 remaining);
    error ClaimNotFound(bytes32 claimId);
    error ClaimAlreadyExists(bytes32 claimId);
    error InsufficientBalance(uint256 requested, uint256 available);

    // ── Constructor ─────────────────────────────────────────────────────
    constructor(address defaultAdmin) 
        ERC20("GreenCredit", "GCR") 
        ERC20Permit("GreenCredit") 
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(VERIFIER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);

        // Default yearly cap: 1,000,000 GCR per minter
        yearlyMintCap = 1_000_000 * 10**18;
    }

    // ── Core: Mint Credits for Verified Reduction ───────────────────────

    /**
     * @notice Mint GreenCredits for a verified carbon reduction event.
     * @param eventId     Unique identifier for this reduction event
     * @param beneficiary Address to receive the minted credits
     * @param reductionKg Amount of CO₂ reduced in kilograms
     * @param metadataURI IPFS/Arweave URI pointing to verification evidence
     *
     * @dev 1 GCR = 1 kgCO₂e, so reductionKg directly maps to token amount.
     *      Requires MINTER_ROLE. Enforces yearly cap per minter.
     */
    function mintForReduction(
        bytes32 eventId,
        address beneficiary,
        uint256 reductionKg,
        string calldata metadataURI
    ) external onlyRole(MINTER_ROLE) whenNotPaused nonReentrant {
        if (reductionKg == 0) revert ZeroReduction();
        if (beneficiary == address(0)) revert ZeroBeneficiary();
        if (reductionEvents[eventId].timestamp != 0) revert EventAlreadyExists(eventId);

        uint256 creditsWei = reductionKg * 10**18;
        uint256 currentYear = _currentYear();

        // Enforce yearly minting cap
        uint256 alreadyMinted = yearlyMinted[msg.sender][currentYear];
        if (alreadyMinted + creditsWei > yearlyMintCap) {
            revert YearlyCapExceeded(
                msg.sender,
                currentYear,
                creditsWei,
                yearlyMintCap - alreadyMinted
            );
        }

        // Record the event
        reductionEvents[eventId] = CarbonReductionEvent({
            eventId: eventId,
            verifier: msg.sender,
            beneficiary: beneficiary,
            reductionKg: reductionKg,
            creditsIssued: creditsWei,
            metadataURI: metadataURI,
            timestamp: block.timestamp,
            retired: false
        });

        eventIds.push(eventId);
        totalReductionKg += reductionKg;
        yearlyMinted[msg.sender][currentYear] += creditsWei;

        // Mint tokens
        _mint(beneficiary, creditsWei);

        emit CarbonReductionMinted(
            eventId,
            beneficiary,
            msg.sender,
            reductionKg,
            creditsWei,
            metadataURI
        );
    }

    // ── Claim & Verify Workflow ─────────────────────────────────────────

    /**
     * @notice Submit an unverified carbon reduction claim.
     * @param claimId      Unique claim identifier
     * @param reductionKg  Claimed CO₂ reduction in kg
     * @param metadataURI  Evidence documentation URI
     */
    function submitClaim(
        bytes32 claimId,
        uint256 reductionKg,
        string calldata metadataURI
    ) external whenNotPaused {
        if (reductionKg == 0) revert ZeroReduction();
        if (pendingClaims[claimId].exists) revert ClaimAlreadyExists(claimId);

        pendingClaims[claimId] = PendingClaim({
            claimant: msg.sender,
            reductionKg: reductionKg,
            metadataURI: metadataURI,
            submittedAt: block.timestamp,
            exists: true
        });

        emit ClaimSubmitted(claimId, msg.sender, reductionKg);
    }

    /**
     * @notice Verify a pending claim and mint credits if approved.
     * @param claimId  Claim to verify
     * @param approved Whether the claim is approved (true) or rejected (false)
     */
    function verifyClaim(
        bytes32 claimId,
        bool approved
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused nonReentrant {
        PendingClaim memory claim = pendingClaims[claimId];
        if (!claim.exists) revert ClaimNotFound(claimId);

        // Remove from pending regardless of approval
        delete pendingClaims[claimId];

        emit ClaimVerified(claimId, msg.sender, approved);

        if (approved) {
            // Convert claim to a verified reduction event and mint
            bytes32 eventId = keccak256(abi.encodePacked(claimId, block.timestamp));

            // Bypass the public mintForReduction to avoid double role check
            uint256 creditsWei = claim.reductionKg * 10**18;
            uint256 currentYear = _currentYear();

            reductionEvents[eventId] = CarbonReductionEvent({
                eventId: eventId,
                verifier: msg.sender,
                beneficiary: claim.claimant,
                reductionKg: claim.reductionKg,
                creditsIssued: creditsWei,
                metadataURI: claim.metadataURI,
                timestamp: block.timestamp,
                retired: false
            });

            eventIds.push(eventId);
            totalReductionKg += claim.reductionKg;
            yearlyMinted[msg.sender][currentYear] += creditsWei;

            _mint(claim.claimant, creditsWei);

            emit CarbonReductionMinted(
                eventId,
                claim.claimant,
                msg.sender,
                claim.reductionKg,
                creditsWei,
                claim.metadataURI
            );
        }
    }

    // ── Credit Retirement ───────────────────────────────────────────────

    /**
     * @notice Retire (burn) credits to permanently offset carbon emissions.
     * @param amount Credits to retire (in wei)
     *
     * @dev Burns the tokens and increments the retirement counter.
     *      Retirement is irreversible — tokens are permanently destroyed.
     */
    function retireCredits(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroReduction();
        uint256 bal = balanceOf(msg.sender);
        if (bal < amount) revert InsufficientBalance(amount, bal);

        totalRetiredCredits += amount;
        _burn(msg.sender, amount);

        emit CreditsRetired(bytes32(0), msg.sender, amount);
    }

    // ── Admin Functions ─────────────────────────────────────────────────

    /**
     * @notice Update the yearly minting cap per minter.
     * @param newCap New cap in wei (e.g., 2_000_000 * 10^18)
     */
    function setYearlyMintCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldCap = yearlyMintCap;
        yearlyMintCap = newCap;
        emit YearlyMintCapUpdated(oldCap, newCap);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ── View Functions ──────────────────────────────────────────────────

    /// @notice Total number of carbon reduction events
    function totalEvents() external view returns (uint256) {
        return eventIds.length;
    }

    /// @notice Get minter's remaining yearly quota (in wei)
    function remainingYearlyQuota(address minter) external view returns (uint256) {
        uint256 used = yearlyMinted[minter][_currentYear()];
        return yearlyMintCap > used ? yearlyMintCap - used : 0;
    }

    /// @notice Get the current year (UTC)
    function _currentYear() internal view returns (uint256) {
        return (block.timestamp / 365 days) + 1970;
    }
}
