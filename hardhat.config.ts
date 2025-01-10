// base-deployment/hardhat.config.ts

import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import * as dotenv from "dotenv";

dotenv.config();

const {
  DEPLOYER_PRIVATE_KEY,
  
} = process.env;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error("DEPLOYER_PRIVATE_KEY is not set in the .env file");
}



const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "base",
  networks: {
    base: {
      url: "https://base-rpc.publicnode.com",
      accounts: [`0x${DEPLOYER_PRIVATE_KEY}`],
      chainId: 8453, 
    },

    baseSepolia: {
        url: "https://base-sepolia-rpc.publicnode.com",
        accounts: [`0x${DEPLOYER_PRIVATE_KEY}`],
        chainId: 84532, 
      },
    
  },
 

 
};

export default config;
