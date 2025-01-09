import { ethers, run, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log(`Deploying to network: ${network.name}`);

  // Retrieve constructor arguments from environment variables
  const campaignTitle = process.env.CAMPAIGN_TITLE || "Default Campaign";
  const tokenAddr = process.env.TOKEN_ADDRESS;
  const ownerAddr = process.env.OWNER_ADDRESS;

  // Validate constructor arguments
  if (!tokenAddr || !ownerAddr) {
    throw new Error("TOKEN_ADDRESS or OWNER_ADDRESS is not set in the .env file");
  }

  console.log("Constructor Arguments:", {
    campaignTitle,
    tokenAddr,
    ownerAddr,
  });

  // Get the contract factory
  const Campaign = await ethers.getContractFactory("Campaign");
  console.log("Contract factory obtained.");

  // Deploy the contract
  const campaign = await Campaign.deploy(campaignTitle, tokenAddr, ownerAddr);
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
