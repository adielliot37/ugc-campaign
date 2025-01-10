import { ethers, run, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log(`\nDeploying to network: ${network.name}`);

  // Retrieve constructor arguments from environment variables
  const campaignTitle = process.env.CAMPAIGN_TITLE || "Default Campaign";
  const tokenAddr = process.env.TOKEN_ADDRESS;
  const ownerAddr = process.env.OWNER_ADDRESS;

  // Validate constructor arguments
  if (!tokenAddr || !ownerAddr) {
    throw new Error("TOKEN_ADDRESS or OWNER_ADDRESS is not set in the .env file");
  }

  // Hardcoded feeRecipient address
  const feeRecipient = "0x26E978cCE80B7af20dF83fFC2a577386BCD0Ab70"; 

  // Validate the feeRecipient address
  if (!ethers.utils.isAddress(feeRecipient)) {
    throw new Error("Invalid feeRecipient address");
  }

  console.log("Constructor Arguments:", {
    campaignTitle,
    tokenAddr,
    ownerAddr,
    feeRecipient,
  });

  // Get the contract factory
  const Campaign = await ethers.getContractFactory("Campaign");
  console.log("Contract factory obtained.");

  // Deploy the contract with the new constructor arguments
  const campaign = await Campaign.deploy(campaignTitle, tokenAddr, ownerAddr, feeRecipient);
  console.log("Deployment transaction sent. Waiting for confirmation...");

  await campaign.deployed();
  console.log(JSON.stringify({ address: campaign.address }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });