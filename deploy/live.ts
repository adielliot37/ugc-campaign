// scripts/change-state-to-live.ts

import { ethers, run, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log(`\nDeploying to network: ${network.name}`);

  // Retrieve environment variables
  const { DEPLOYER_PRIVATE_KEY, CONTRACT_ADDRESS } = process.env;

  // Validate environment variables
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set in the .env file");
  }

  if (!CONTRACT_ADDRESS) {
    throw new Error("DEPLOYED_CONTRACT_ADDRESS is not set in the .env file");
  }

  // Initialize signer
  const [signer] = await ethers.getSigners();

  console.log(`Using account: ${signer.address}`);

  // Verify that the signer is the owner
  // You can add additional verification here if needed

  // Get the Contract Factory
  const Campaign = await ethers.getContractFactory("Campaign");
  console.log("Contract factory obtained.");

  // Attach to the deployed contract
  const campaign = Campaign.attach(CONTRACT_ADDRESS);
  console.log(`Connected to Campaign contract at: ${campaign.address}`);

  // Call changeStateToLive
  console.log("Initiating state change to Live...");
  const tx = await campaign.changeStateToLive();
  console.log(`Transaction submitted. Hash: ${tx.hash}`);

  // Wait for the transaction to be mined
  const receipt = await tx.wait();
  console.log(`Transaction mined in block ${receipt.blockNumber}`);

  console.log("State changed to Live successfully!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
