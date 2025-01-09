// scripts/setAllocations.ts

import { ethers, run, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Utility function to parse comma-separated strings into arrays.
 * @param str - The comma-separated string.
 * @returns An array of trimmed strings.
 */
const parseCSV = (str: string): string[] => {
  return str.split(",").map((s) => s.trim());
};

async function main() {
  console.log(`Setting allocations on network: ${network.name}`);

  // Retrieve environment variables
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const userAddressesCSV = process.env.USER_ADDRESSES;
  const allocationsCSV = process.env.ALLOCATIONS;

  // Validate environment variables
  if (!contractAddress) {
    throw new Error("CONTRACT_ADDRESS is not set in the .env file");
  }

  if (!userAddressesCSV || !allocationsCSV) {
    throw new Error(
      "USER_ADDRESSES and ALLOCATIONS must be set in the .env file as comma-separated lists"
    );
  }

  // Parse CSV inputs
  const userAddresses = parseCSV(userAddressesCSV);
  const allocations = parseCSV(allocationsCSV).map((amt) => ethers.utils.parseUnits(amt, 18));

  // Validate that the number of users matches the number of allocations
  if (userAddresses.length !== allocations.length) {
    throw new Error(
      `Mismatch between number of users (${userAddresses.length}) and allocations (${allocations.length})`
    );
  }

  // Validate Ethereum addresses
  for (const address of userAddresses) {
    if (!ethers.utils.isAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address}`);
    }
  }

  // Get the contract instance
  const Campaign = await ethers.getContractFactory("Campaign");
  const campaign = Campaign.attach(contractAddress);
  console.log(`Attached to Campaign contract at: ${contractAddress}`);

  // Execute the setAllocations function
  console.log("Executing setAllocations...");
  const tx = await campaign.setAllocations(userAddresses, allocations);
  console.log(`Transaction submitted. Hash: ${tx.hash}`);

  // Wait for the transaction to be mined
  const receipt = await tx.wait();
  console.log(`Transaction mined in block ${receipt.blockNumber}`);
  console.log("Allocations set successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error setting allocations:", error);
    process.exit(1);
  });
