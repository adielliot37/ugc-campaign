// server.ts

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { ethers } from 'ethers';
import { body, query, validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import YAML from 'js-yaml';
import { exec } from 'child_process';
import Moralis from 'moralis';
import axios from 'axios';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;

if (!PORT) {
  console.error("PORT environment variable is not set or invalid.");
  process.exit(1); 
}
const HOST = '0.0.0.0';

// **Simplified CORS Configuration to Allow All Origins**
// **CORS Configuration to Allow All Origins**
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
}));
app.options('*', cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
}));


app.use(express.json());

// **API Key for Authentication**
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY environment variable is not set.");
  process.exit(1);
}

const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey === API_KEY) {
    next();
  } else {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing API key.',
    });
  }
};

// **Ethereum Provider Setup**
const providerUrl = process.env.RPC;
if (!providerUrl) {
  console.error('RPC is not set in .env file');
  process.exit(1);
}

const provider = new ethers.providers.JsonRpcProvider(providerUrl);

// Minimal ERC20 ABI to fetch decimals
const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const getTokenDecimals = async (campaignAddress: string): Promise<number> => {
  try {
    // Load the minimal Campaign ABI from abi.json
    const CAMPAIGN_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi.json'), 'utf8'));

    // Initialize the Campaign contract
    const campaignContract = new ethers.Contract(campaignAddress, CAMPAIGN_ABI, provider);
    
    // Fetch the token address from the Campaign contract
    const tokenAddr: string = await campaignContract.tokenAddress();
    
    // Validate the token address
    if (!ethers.utils.isAddress(tokenAddr)) {
      throw new Error('Invalid token address fetched from Campaign contract.');
    }
    
    // Initialize the Token contract using the minimal ERC20 ABI
    const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    
    // Fetch decimals
    const decimals: number = await tokenContract.decimals();
    
    return decimals;
  } catch (error) {
    console.error('Error fetching token decimals:', error);
    throw error;
  }
};

// **Moralis Initialization**
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
if (!MORALIS_API_KEY) {
  console.error('Error: MORALIS_API_KEY is not set in the environment variables.');
  process.exit(1);
}

// Initialize Moralis
Moralis.start({
  apiKey: MORALIS_API_KEY,
})
  .then(() => {
    console.log('Moralis initialized successfully.');
  })
  .catch((error) => {
    console.error('Moralis initialization failed:', error);
    process.exit(1);
  });

// **Header Validation Middlewares**
const validateDeploymentHeaders = [
  (req: Request, res: Response, next: NextFunction): void => {
    const title = req.headers['x-campaign-title'];
    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Invalid or missing "x-campaign-title" header.',
      });
      return;
    }
    next();
  },
  (req: Request, res: Response, next: NextFunction): void => {
    const tokenAddr = req.headers['x-token-address'];
    if (typeof tokenAddr !== 'string' || !ethers.utils.isAddress(tokenAddr)) {
      res.status(400).json({
        success: false,
        message: 'Invalid or missing "x-token-address" header.',
      });
      return;
    }
    next();
  },
  // Uncomment if OWNER_ADDRESS is required
  // (req: Request, res: Response, next: NextFunction): void => {
  //   const ownerAddr = req.headers['x-owner-address'];
  //   if (typeof ownerAddr !== 'string' || !ethers.utils.isAddress(ownerAddr)) {
  //     res.status(400).json({
  //       success: false,
  //       message: 'Invalid or missing "x-owner-address" header.',
  //     });
  //     return;
  //   }
  //   next();
  // },
];

const validateStateChangeHeaders = [
  (req: Request, res: Response, next: NextFunction): void => {
    const contractAddr = req.headers['x-contract-address'];
    if (typeof contractAddr !== 'string' || !ethers.utils.isAddress(contractAddr)) {
      res.status(400).json({
        success: false,
        message: 'Invalid or missing "x-contract-address" header.',
      });
      return;
    }
    next();
  },
];

const validateGetDepositedAmount = [
  body('contractAddress')
    .isEthereumAddress()
    .withMessage('Invalid contract address'),
  body('userAddress')
    .isEthereumAddress()
    .withMessage('Invalid user address'),
];

// **Utility Function to Execute Shell Commands**
const executeCommand = (
  command: string,
  cwd: string = process.cwd(),
  env?: NodeJS.ProcessEnv
): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd, env: { ...process.env, ...env }, maxBuffer: 1024 * 500 },
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Command Execution Error: ${stderr || stdout}`);
          reject(stderr || stdout);
        } else {
          resolve(stdout);
        }
      }
    );
  });
};

// **Route Handlers**
const deployCampaign = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Received deployment request');

    const campaignTitle = req.headers['x-campaign-title'] as string;
    const tokenAddr = req.headers['x-token-address'] as string;
    // const ownerAddr = req.headers['x-owner-address'] as string;

    console.log('Extracted Constructor Arguments:', {
      campaignTitle,
      tokenAddr,
      // ownerAddr,
    });

    const envVars: NodeJS.ProcessEnv = {
      CAMPAIGN_TITLE: campaignTitle,
      TOKEN_ADDRESS: tokenAddr,
      OWNER_ADDRESS: "0xCBaf15D6D097fbf0D744814Ebe92e00e00321fC3",
    };

    console.log('Environment Variables for Deployment:', {
      CAMPAIGN_TITLE: envVars.CAMPAIGN_TITLE,
      TOKEN_ADDRESS: envVars.TOKEN_ADDRESS,
      OWNER_ADDRESS: "0xCBaf15D6D097fbf0D744814Ebe92e00e00321fC3", 
    });

    console.log('Deploying the Campaign contract...');
    const deployCommand =
      'npx hardhat run deploy/deploy-base.ts --network baseSepolia';
    const deployOutput = await executeCommand(deployCommand, process.cwd(), envVars);
    console.log('Deployment Output:', deployOutput);

    // **Extract JSON from Deploy Output**
    let deployResult;
    const jsonMatch = deployOutput.match(/\{.*\}/);
    if (!jsonMatch || !jsonMatch[0]) {
      throw new Error('Failed to find JSON in deployment output.');
    }

    try {
      deployResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new Error('Failed to parse deployment output as JSON.');
    }

    if (!deployResult.address) {
      throw new Error('Deployed contract address not found in deployment output.');
    }
    const contractAddress = deployResult.address;
    console.log('Deployed Contract Address:', contractAddress);

    res.status(200).json({
      success: true,
      contractAddress,
      message: 'Contract deployed successfully.',
    });
  } catch (error: unknown) {
    console.error('Error during deployment and verification:', error);
    let errorMessage = 'Unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    res.status(500).json({
      success: false,
      error: errorMessage,
      message: 'Deployment or verification failed.',
    });
  }
};

const changeCampaignState = async (
  req: Request,
  res: Response,
  scriptName: string,
  stateName: string
): Promise<void> => {
  try {
    console.log(`Received request to change state to ${stateName}`);

    const contractAddress = req.headers['x-contract-address'] as string;

    console.log(`Contract Address: ${contractAddress}`);

    const envVars: NodeJS.ProcessEnv = {
      CONTRACT_ADDRESS: contractAddress,
    };

    console.log('Environment Variables for State Change:', {
      CONTRACT_ADDRESS: envVars.CONTRACT_ADDRESS,
    });

    console.log(`Executing state change to ${stateName}...`);
    const changeStateCommand = `npx hardhat run deploy/${scriptName} --network baseSepolia`;
    const changeStateOutput = await executeCommand(changeStateCommand, process.cwd(), envVars);
    console.log('State Change Output:', changeStateOutput);

    res.status(200).json({
      success: true,
      message: `State changed to ${stateName} successfully.`,
    });
  } catch (error: unknown) {
    console.error(`Error during changing state to ${stateName}:`, error);
    let errorMessage = 'Unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    res.status(500).json({
      success: false,
      error: errorMessage,
      message: `Failed to change state to ${stateName}.`,
    });
  }
};

const getDepositedAmount = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { contractAddress, userAddress } = req.body;

  try {
    // Fetch token decimals dynamically
    const decimals = await getTokenDecimals(contractAddress);
    console.log(`Token decimals: ${decimals}`);

    // Initialize the Campaign contract
    const abiPath = path.join(__dirname, 'abi.json');
    let abi;
    try {
      abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    } catch (error) {
      console.error('Error reading ABI file:', error);
      res.status(500).json({ success: false, error: 'Internal server error.' });
      return;
    }

    const contract = new ethers.Contract(contractAddress, abi, provider);

    // Fetch deposited amount
    const depositedAmount = await contract.getDepositedAmount(userAddress);

    // Format the amount using the fetched decimals
    const formattedAmount = ethers.utils.formatUnits(depositedAmount, decimals);

    res.status(200).json({
      success: true,
      contractAddress,
      userAddress,
      depositedAmount: formattedAmount,
    });
  } catch (error: any) {
    console.error('Error querying contract:', error);

    if (error.code === 'INVALID_ARGUMENT') {
      res.status(400).json({ success: false, error: 'Invalid arguments provided.' });
      return;
    } else if (error.code === 'CALL_EXCEPTION') {
      res.status(400).json({ success: false, error: 'Contract call failed. Ensure the contract address is correct and the function exists.' });
      return;
    }

    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};


// **New Route: /setAllocations**
const validateSetAllocationsHeaders = [
  (req: Request, res: Response, next: NextFunction): void => {
    const contractAddr = req.headers['x-contract-address'];
    if (typeof contractAddr !== 'string' || !ethers.utils.isAddress(contractAddr)) {
      res.status(400).json({
        success: false,
        message: 'Invalid or missing "x-contract-address" header.',
      });
      return;
    }
    next();
  },
];

const validateSetAllocationsBody = [
  body('userAddresses')
    .isArray({ min: 1 })
    .withMessage('userAddresses must be a non-empty array of Ethereum addresses'),
  body('userAddresses.*')
    .isEthereumAddress()
    .withMessage('Each user address must be a valid Ethereum address'),
  body('allocations')
    .isArray({ min: 1 })
    .withMessage('allocations must be a non-empty array of amounts'),
  body('allocations.*')
    .matches(/^\d+(\.\d+)?$/)
    .withMessage('Each allocation amount must be a string representing a positive number'),
];




// **Handler for Set Allocations**
const setAllocationsHandler = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const contractAddress = req.headers['x-contract-address'] as string;
  const { userAddresses, allocations } = req.body;

  // Convert arrays to comma-separated strings
  const userAddressesCSV = userAddresses.join(",");
  const allocationsCSV = allocations.join(",");

  const envVars: NodeJS.ProcessEnv = {
    ...process.env,
    CONTRACT_ADDRESS: contractAddress,
    USER_ADDRESSES: userAddressesCSV,
    ALLOCATIONS: allocationsCSV,
  };

  try {
    console.log('Executing setAllocations script...');
    const setAllocationsCommand = 'npx hardhat run deploy/allocation.ts --network baseSepolia';
    const setAllocationsOutput = await executeCommand(setAllocationsCommand, process.cwd(), envVars);
    console.log('Set Allocations Output:', setAllocationsOutput);

    res.status(200).json({
      success: true,
      message: 'Allocations set successfully.',
      output: setAllocationsOutput,
    });
  } catch (error: any) {
    console.error('Error setting allocations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to set allocations.',
    });
  }
};


// Validate x-contract-address for getDepositors
const validateGetDepositorsHeaders = [
  (req: Request, res: Response, next: NextFunction): void => {
    const contractAddr = req.headers['x-contract-address'];
    if (typeof contractAddr !== 'string' || !ethers.utils.isAddress(contractAddr)) {
      res.status(400).json({
        success: false,
        message: 'Invalid or missing "x-contract-address" header.',
      });
      return;
    }
    next();
  },
];

// Validate x-contract-address and userAddress for hasAddressClaimed
const validateHasAddressClaimed = [
  body('contractAddress')
    .isEthereumAddress()
    .withMessage('Invalid contract address'),
  body('userAddress')
    .isEthereumAddress()
    .withMessage('Invalid user address'),
];

const getDepositorsHandler = async (req: Request, res: Response): Promise<void> => {
  const contractAddress = req.headers['x-contract-address'] as string;

  try {
    // Fetch token decimals dynamically
    const decimals = await getTokenDecimals(contractAddress);
    console.log(`Token decimals: ${decimals}`);

    // Initialize the Campaign contract
    const abiPath = path.join(__dirname, 'abi.json');
    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

    const contract = new ethers.Contract(contractAddress, abi, provider);

    // Fetch depositors and their amounts
    const [addresses, rawAmounts] = await contract.getDepositors();

    // Convert BigNumber amounts to human-readable format using actual decimals
    const amounts = rawAmounts.map((amount: ethers.BigNumber) =>
      ethers.utils.formatUnits(amount, decimals) // Use fetched decimals
    );

    res.status(200).json({
      success: true,
      depositors: addresses,
      amounts,
    });
  } catch (error: any) {
    console.error('Error fetching depositors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch depositors.',
    });
  }
};



const hasAddressClaimedHandler = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { contractAddress, userAddress } = req.body;

  try {
    const abiPath = path.join(__dirname, 'abi.json');
    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

    const contract = new ethers.Contract(contractAddress, abi, provider);

    const claimed = await contract.hasAddressClaimed(userAddress);

    res.status(200).json({
      success: true,
      userAddress,
      hasClaimed: claimed,
    });
  } catch (error: any) {
    console.error('Error checking claim status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check claim status.',
    });
  }
};


app.post(
  '/setAllocations',
  authenticate,
  validateSetAllocationsHeaders,
  validateSetAllocationsBody,
  setAllocationsHandler
);

// **New Route: /tokenDetails**
const validateTokenDetails = [
  query('address')
    .exists().withMessage('Token contract address is required.')
    .bail()
    .isEthereumAddress().withMessage('Invalid Ethereum address.'),
];

const getTokenDetails = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const address = req.query.address as string;
  const chain = '0x2105'; // Example chain ID, replace with actual

  try {
    // Fetch Token Metadata from Moralis
    const metadataResponse = await Moralis.EvmApi.token.getTokenMetadata({
      chain: chain,
      addresses: [address],
    });

    if (metadataResponse.result.length === 0) {
      res.status(404).json({ success: false, error: 'Token metadata not found for the provided address.' });
      return;
    }

    const tokenMetadata = metadataResponse.raw[0];

    // Fetch Token Price from Moralis
    let tokenPrice: number | null = null;
    try {
      const priceResponse = await Moralis.EvmApi.token.getTokenPrice({
        chain: chain,
        address: address,
        include: 'percent_change',
      });

      if (priceResponse.result) {
        tokenPrice = priceResponse.raw.usdPrice || null;
      }
    } catch (priceError: any) {
      // Handle specific Moralis errors
      if (priceError.code === 'C0006') {
        // No liquidity pools found
        tokenPrice = null;
      } else {
        console.error('Error fetching token price:', priceError);
        throw priceError; // Re-throw other errors
      }
    }

    // Combine Data
    const tokenDetails = {
      name: tokenMetadata.name || null,
      ticker: tokenMetadata.symbol || null,
      price: tokenPrice,
      description: null, // Moralis does not provide a description
      image: tokenMetadata.logo || null,
    };

    res.json({ success: true, ...tokenDetails });
  } catch (error: any) {
    console.error('Error fetching token details:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

// **API Routes**
app.post(
  '/campaigndeploy',
  authenticate,
  validateDeploymentHeaders,
  deployCampaign
);

app.post(
  '/changestatetolive',
  authenticate,
  validateStateChangeHeaders,
  async (req: Request, res: Response) => {
    await changeCampaignState(req, res, 'live.ts', 'Live');
  }
);

app.post(
  '/changestatetoended',
  authenticate,
  validateStateChangeHeaders,
  async (req: Request, res: Response) => {
    await changeCampaignState(req, res, 'ended.ts', 'Ended');
  }
);

app.post(
  '/changestatetorescue',
  authenticate,
  validateStateChangeHeaders,
  async (req: Request, res: Response) => {
    await changeCampaignState(req, res, 'rescue.ts', 'Rescue');
  }
);

app.post(
  '/getDepositedAmount',
  authenticate,
  validateGetDepositedAmount,
  getDepositedAmount
);


app.get(
  '/getDepositors',
  authenticate,
  validateGetDepositorsHeaders,
  getDepositorsHandler
);

app.post(
  '/hasAddressClaimed',
  authenticate,
  validateHasAddressClaimed,
  hasAddressClaimedHandler
);


// **Integrate the New Route**
app.get(
  '/tokenDetails',
  authenticate,
  validateTokenDetails,
  getTokenDetails
);

// **Root Endpoint**
app.get('/', (req: Request, res: Response) => {
  res.send('Campaign API is running.');
});

// **Swagger Documentation Setup**
const swaggerFilePath = path.join(__dirname, 'openapi.yaml');
let swaggerDocument: object;
try {
  const fileContents = fs.readFileSync(swaggerFilePath, 'utf8');
  swaggerDocument = YAML.load(fileContents) as object;
} catch (error) {
  console.error('Error loading Swagger file:', error);
  process.exit(1);
}

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// **Global Error Handler**
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
  });
});

// **Start the Server**
app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(`Swagger UI available at http://${HOST}:${PORT}/api-docs`);
});
