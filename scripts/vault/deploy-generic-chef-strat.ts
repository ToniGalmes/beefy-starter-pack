import hardhat, { ethers, web3 } from "hardhat";
import { addressBook } from "blockchain-addressbook";
import { predictAddresses } from "../../utils/predictAddresses";
import { setCorrectCallFee } from "../../utils/setCorrectCallFee";
import { setPendingRewardsFunctionName } from "../../utils/setPendingRewardsFunctionName";
import { verifyContracts } from "../../utils/verifyContracts";

// const registerSubsidy = require("../../utils/registerSubsidy");

const {
  CRYSTL: { address: CRYSTL },
  WMATIC: { address: WMATIC },
  BANANA: { address: BANANA },
} = addressBook.polygon.tokens;
const { apeswap, beefyfinance } = addressBook.polygon.platforms;

const shouldVerifyOnEtherscan = false;

const want = web3.utils.toChecksumAddress("0xb8e54c9ea1616beebe11505a419dd8df1000e02a");

const vaultParams = {
  mooName: "Moo Apeswap WMATIC-CRYSTL",
  mooSymbol: "mooApeswapWMATIC-CRYSTL",
  delay: 21600,
};

const strategyParams = {
  want,
  poolId: 7,
  chef: apeswap.minichef,
  unirouter: apeswap.router,
  strategist: "0xBa4cB13Ed28C6511d9fa29A0570Fd2f2C9D08cE3", // some address
  keeper: beefyfinance.keeper,
  beefyFeeRecipient: beefyfinance.beefyFeeRecipient,
  outputToNativeRoute: [BANANA, WMATIC],
  rewardToOutputRoute: [BANANA, BANANA],
  outputToLp0Route: [BANANA, WMATIC],
  outputToLp1Route: [BANANA, CRYSTL],
  pendingRewardsFunctionName: "pendingBanana", // used for rewardsAvailable(), use correct function name from masterchef
};

const contractNames = {
  vault: "BeefyVaultV6",
  strategy: "StrategyMiniChefLP",
};

async function main() {
  if (
    Object.values(vaultParams).some(v => v === undefined) ||
    Object.values(strategyParams).some(v => v === undefined) ||
    Object.values(contractNames).some(v => v === undefined)
  ) {
    console.error("one of config values undefined");
    return;
  }

  await hardhat.run("compile");

  const Vault = await ethers.getContractFactory(contractNames.vault);
  const Strategy = await ethers.getContractFactory(contractNames.strategy);

  const [deployer] = await ethers.getSigners();

  console.log("Deploying:", vaultParams.mooName);

  const predictedAddresses = await predictAddresses({ creator: deployer.address });

  const vaultConstructorArguments = [
    predictedAddresses.strategy,
    vaultParams.mooName,
    vaultParams.mooSymbol,
    vaultParams.delay,
    {gasPrice: 800000000 * 10}
  ];
  const vault = await Vault.deploy(...vaultConstructorArguments);
  await vault.deployed();

  const strategyConstructorArguments = [
    strategyParams.want,
    strategyParams.poolId,
    strategyParams.chef,
    vault.address,
    strategyParams.unirouter,
    strategyParams.keeper,
    strategyParams.strategist,
    strategyParams.beefyFeeRecipient,
    strategyParams.outputToNativeRoute,
    strategyParams.rewardToOutputRoute,
    strategyParams.outputToLp0Route,
    strategyParams.outputToLp1Route,
    {gasPrice: 800000000 * 10,
    gasLimit: 10000000}
  ];
  const strategy = await Strategy.deploy(...strategyConstructorArguments);
  await strategy.deployed();

  // add this info to PR
  console.log();
  console.log("Vault:", vault.address);
  console.log("Strategy:", strategy.address);
  console.log("Want:", strategyParams.want);
  console.log("PoolId:", strategyParams.poolId);

  console.log();
  console.log("Running post deployment");

  if (shouldVerifyOnEtherscan) {
    verifyContracts(vault, vaultConstructorArguments, strategy, strategyConstructorArguments);
  }
  await setPendingRewardsFunctionName(strategy, strategyParams.pendingRewardsFunctionName);
  await setCorrectCallFee(strategy, hardhat.network.name);
  console.log();

  // if (hardhat.network.name === "bsc") {
  //   await registerSubsidy(vault.address, deployer);
  //   await registerSubsidy(strategy.address, deployer);
  // }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
