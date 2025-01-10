// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Campaign is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { Graduating, Live, Rescue, Ended }

    string public title;
    address public tokenAddress;
    uint256 public totalDeposits;
    address public owner;
    State public currentState;
    address public feeRecipient; // Address to receive the ETH fee

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public allocations;
    mapping(address => bool) public hasClaimed;
    address[] public depositors; // Track all depositors

    uint256 public constant DEPOSIT_FEE = 0.001 ether;

    event Deposit(address indexed depositor, uint256 amount, uint256 fee);
    event StateChanged(State newState);
    event FundsRescued(address indexed rescuer, uint256 amount);
    event AllocationsSet(address indexed user, uint256 amount);
    event TokensClaimed(address indexed claimer, uint256 amount);
    event RemainingTokensRescued(uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier inState(State requiredState) {
        require(currentState == requiredState, "Invalid state for this action");
        _;
    }

    constructor(
        string memory _title,
        address _tokenAddress,
        address _owner,
        address _feeRecipient
    ) {
        require(_feeRecipient != address(0), "Invalid fee recipient address");
        title = _title;
        tokenAddress = _tokenAddress;
        owner = _owner;
        feeRecipient = _feeRecipient;
        currentState = State.Graduating; 
    }

    /**
     * @dev Allows users to deposit tokens along with a fixed ETH fee.
     * The ETH fee is transferred to the feeRecipient.
     * @param amount The amount of ERC20 tokens to deposit.
     */
    function deposit(uint256 amount) external payable nonReentrant {
        require(
            currentState == State.Graduating || currentState == State.Live,
            "Deposits are not allowed in the current state"
        );
        require(msg.value == DEPOSIT_FEE, "Incorrect ETH fee sent");

        // Transfer the ETH fee to the feeRecipient using call to prevent potential issues
        (bool sent, ) = feeRecipient.call{value: msg.value}("");
        require(sent, "Failed to transfer ETH fee");

        IERC20 token = IERC20(tokenAddress);
        token.safeTransferFrom(msg.sender, address(this), amount);

        if (deposits[msg.sender] == 0) {
            depositors.push(msg.sender); // Add depositor only once
        }

        deposits[msg.sender] += amount;
        totalDeposits += amount;

        emit Deposit(msg.sender, amount, msg.value);
    }

    /**
     * @dev Allows the owner to change the campaign state to Live from Graduating.
     */
    function changeStateToLive() external onlyOwner inState(State.Graduating) {
        currentState = State.Live;
        emit StateChanged(State.Live);
    }

    /**
     * @dev Allows the owner to rescue funds by refunding all depositors.
     * Changes the state to Rescue.
     */
    function changeStateToRescue() external onlyOwner inState(State.Graduating) nonReentrant {
        IERC20 token = IERC20(tokenAddress);

        // Refund all deposits
        for (uint256 i = 0; i < depositors.length; i++) {
            address depositor = depositors[i];
            uint256 depositAmount = deposits[depositor];
            if (depositAmount > 0) {
                deposits[depositor] = 0;
                token.safeTransfer(depositor, depositAmount);
                emit FundsRescued(depositor, depositAmount);
            }
        }

        totalDeposits = 0;
        currentState = State.Rescue;
        emit StateChanged(State.Rescue);
    }

    /**
     * @dev Allows the owner to end the campaign, changing the state to Ended.
     */
    function changeStateToEnded() external onlyOwner inState(State.Live) {
        currentState = State.Ended;
        emit StateChanged(State.Ended);
    }

    /**
     * @dev Allows the owner to set allocations for users after the campaign has ended.
     * @param users The array of user addresses.
     * @param amounts The array of allocation amounts corresponding to each user.
     */
    function setAllocations(
        address[] memory users,
        uint256[] memory amounts
    ) external onlyOwner inState(State.Ended) {
        require(users.length == amounts.length, "Mismatched input lengths");
        uint256 totalAllocated = 0;

        for (uint256 i = 0; i < users.length; i++) {
            allocations[users[i]] = amounts[i];
            totalAllocated += amounts[i];
            emit AllocationsSet(users[i], amounts[i]);
        }

        require(totalAllocated <= totalDeposits, "Allocation exceeds deposits");
    }

    /**
     * @dev Allows users to claim their allocated tokens after the campaign has ended.
     */
    function claimTokens() external inState(State.Ended) nonReentrant {
        uint256 allocation = allocations[msg.sender];
        require(allocation > 0, "No tokens allocated");
        require(!hasClaimed[msg.sender], "Tokens already claimed");

        hasClaimed[msg.sender] = true;
        IERC20 token = IERC20(tokenAddress);
        token.safeTransfer(msg.sender, allocation);

        emit TokensClaimed(msg.sender, allocation);
    }

    /**
     * @dev Allows the owner to rescue any remaining tokens after allocations.
     * Can only be called once and only when the campaign is ended.
     */
    function rescueRemainingTokens() external onlyOwner inState(State.Ended) nonReentrant {
        IERC20 token = IERC20(tokenAddress);
        uint256 totalAllocated = 0;

        // Calculate total allocated tokens
        for (uint256 i = 0; i < depositors.length; i++) {
            totalAllocated += allocations[depositors[i]];
        }

        uint256 contractBalance = token.balanceOf(address(this));
        require(contractBalance > totalAllocated, "No remaining tokens to rescue");

        uint256 remaining = contractBalance - totalAllocated;
        require(remaining > 0, "No remaining tokens to rescue");

        token.safeTransfer(owner, remaining);
        emit RemainingTokensRescued(remaining);
    }

    /**
     * @dev Returns the list of depositors and their respective deposit amounts.
     */
    function getDepositors() external view returns (address[] memory, uint256[] memory) {
        uint256[] memory depositAmounts = new uint256[](depositors.length);
        for (uint256 i = 0; i < depositors.length; i++) {
            depositAmounts[i] = deposits[depositors[i]];
        }
        return (depositors, depositAmounts);
    }

    /**
     * @dev Checks if a specific address has claimed their tokens.
     * @param user The address to check.
     */
    function hasAddressClaimed(address user) external view returns (bool) {
        return hasClaimed[user];
    }

    /**
     * @dev Returns the deposit amount for a specific depositor.
     * @param depositor The address of the depositor.
     */
    function getDeposit(address depositor) external view returns (uint256) {
        return deposits[depositor];
    }

    /**
     * @dev Returns the allocation amount for a specific user.
     * @param user The address of the user.
     */
    function getAllocation(address user) external view returns (uint256) {
        return allocations[user];
    }

    /**
     * @dev Returns the deposited amount for a specific user.
     * @param user The address of the user.
     */
    function getDepositedAmount(address user) external view returns (uint256) {
        return deposits[user];
    }

    /**
     * @dev Allows the owner to update the fee recipient address.
     * @param _feeRecipient The new fee recipient address.
     */
    function updateFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient address");
        feeRecipient = _feeRecipient;
    }

    /**
     * @dev Allows the owner to withdraw any ETH mistakenly sent to the contract.
     * This is a safety mechanism.
     */
    function withdrawEther() external onlyOwner nonReentrant {
        uint256 contractBalance = address(this).balance;
        require(contractBalance > 0, "No ETH to withdraw");

        (bool sent, ) = owner.call{value: contractBalance}("");
        require(sent, "Failed to withdraw ETH");
    }
}
