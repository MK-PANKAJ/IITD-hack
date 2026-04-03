// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GreenCredit is ERC20, Ownable {
    constructor() ERC20("GreenCredit", "GCRD") Ownable(msg.sender) {}

    // Function to mint credits based on validated carbon savings
    function mintCredits(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
