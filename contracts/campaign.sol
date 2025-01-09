// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Campaign {
    enum State { Graduating, Live, Rescue, Ended }

    string public title;
    address public tokenAddress;
    uint256 public totalDeposits;
    address public owner;
    State public currentState;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public allocations;
    mapping(address => bool) public hasClaimed;
    address[] public depositors; // Track all depositors

    event Deposit(address indexed depositor, uint256 amount);
    event StateChanged(State newState);
    event FundsRescued(address indexed rescuer, uint256 amount);
    event AllocationsSet(address indexed user, uint256 amount);
    event TokensClaimed(address indexed claimer, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier inState(State requiredState) {
        require(currentState == requiredState, "Invalid state for this action");
        _;
    }

    constructor(string memory _title, address _tokenAddress, address _owner) {
        title = _title;
        tokenAddress = _tokenAddress;
        owner = _owner;
        currentState = State.Graduating; // Initial state
    }

    function deposit(uint256 amount) external {
        require(
            currentState == State.Graduating || currentState == State.Live,
            "Deposits are not allowed in the current state"
        );

        IERC20 token = IERC20(tokenAddress);
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        if (deposits[msg.sender] == 0) {
            depositors.push(msg.sender); // Add depositor only once
        }

        deposits[msg.sender] += amount;
        totalDeposits += amount;

        emit Deposit(msg.sender, amount);
    }

    function changeStateToLive() external onlyOwner inState(State.Graduating) {
        currentState = State.Live;
        emit StateChanged(State.Live);
    }

    function changeStateToRescue() external onlyOwner inState(State.Graduating) {
        IERC20 token = IERC20(tokenAddress);

        // Refund all deposits
        for (uint256 i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            uint256 depositAmount = deposits[depositor];
            if (depositAmount > 0) {
                deposits[depositor] = 0;
                require(token.transfer(depositor, depositAmount), "Refund failed");
                emit FundsRescued(depositor, depositAmount);
            }
        }

        totalDeposits = 0;
        currentState = State.Rescue;
        emit StateChanged(State.Rescue);
    }

    function changeStateToEnded() external onlyOwner inState(State.Live) {
        currentState = State.Ended;
        emit StateChanged(State.Ended);
    }

    function setAllocations(address[] memory users, uint256[] memory amounts) external onlyOwner inState(State.Ended) {
        require(users.length == amounts.length, "Mismatched input lengths");
        uint256 totalAllocated = 0;

        for (uint256 i = 0; i < users.length; i++) {
            allocations[users[i]] = amounts[i];
            totalAllocated += amounts[i];
            emit AllocationsSet(users[i], amounts[i]);
        }

        require(totalAllocated <= totalDeposits, "Allocation exceeds deposits");
    }

    function claimTokens() external inState(State.Ended) {
        uint256 allocation = allocations[msg.sender];
        require(allocation > 0, "No tokens allocated");
        require(!hasClaimed[msg.sender], "Tokens already claimed");

        hasClaimed[msg.sender] = true;
        IERC20 token = IERC20(tokenAddress);
        require(token.transfer(msg.sender, allocation), "Claim failed");

        emit TokensClaimed(msg.sender, allocation);
    }

    // Updated getter function
    function getDepositors() external view returns (address[] memory, uint256[] memory) {
        uint256[] memory depositAmounts = new uint256[](depositors.length);
        for (uint256 i = 0; i < depositors.length; i++) {
            depositAmounts[i] = deposits[depositors[i]];
        }
        return (depositors, depositAmounts);
    }

    // New function to check if an address has claimed tokens
    function hasAddressClaimed(address user) external view returns (bool) {
        return hasClaimed[user];
    }

    // Existing getter functions
    function getDeposit(address depositor) external view returns (uint256) {
        return deposits[depositor];
    }

    function getAllocation(address user) external view returns (uint256) {
        return allocations[user];
    }

    function getDepositedAmount(address user) external view returns (uint256) {
        return deposits[user];
    }
}
