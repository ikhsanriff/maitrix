import { JsonRpcProvider, Wallet, Contract, parseUnits, formatUnits, formatEther, AbiCoder } from 'ethers';
import axios from 'axios';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function sendReport(reportMsg) {
  console.log(chalk.blue('Mengirim laporan:', reportMsg));
  return true;
}

function formatStakingReport(token, amount, txHash) {
  return (
    `${chalk.green('🚀🎉 *Staking Berhasil!* 🎉🚀')}\n` +
    `*Token:* ${token}\n` +
    `*Jumlah:* ${amount}\n` +
    `*TxHash:* \`${txHash}\``
  );
}

const globalConfig = {
  rpc: 'https://sepolia-rollup.arbitrum.io/rpc ',
  chainId: 421614,
  tokens: {
    virtual: '0xFF27D611ab162d7827bbbA59F140C1E7aE56e95C',
    ath:     '0x1428444Eacdc0Fd115dd4318FcE65B61Cd1ef399',
    ausd:    '0x78De28aABBD5198657B26A8dc9777f441551B477',
    usde:    '0xf4BE938070f59764C85fAcE374F92A4670ff3877',
    lvlusd:  '0x8802b7bcF8EedCc9E1bA6C20E139bEe89dd98E83',
    vusd:    '0xc14A8E2Fc341A97a57524000bF0F7F1bA4de4802',
    vnusd:   '0xBEbF4E25652e7F23CCdCCcaaCB32004501c4BfF8',
    ai16z:   '0x2d5a4f5634041f50180A25F26b2A8364452E3152',
    azUSD:   '0x5966cd11aED7D68705C9692e74e5688C892cb162'
  },
  routers: {
    virtual: '0x3dCACa90A714498624067948C092Dd0373f08265',
    ath:     '0x2cFDeE1d5f04dD235AEA47E1aD2fB66e3A61C13e',
    vnusd:   '0xEfbAE3A68b17a61f21C7809Edfa8Aa3CA7B2546f',
    ai16z:   '0xb0b53d8b4ef06f9bbe5db624113c6a5d35bb7522'
  },
  stakeContracts: {
    ausd:  '0x054de909723ECda2d119E31583D40a52a332f85c',
    usde:  '0x3988053b7c748023a1ae19a8ed4c1bf217932bdb',
    lvlusd:'0x5De3fBd40D4c3892914c3b67b5B529D776A1483A',
    vusd:  '0x5bb9Fa02a3DCCDB4E9099b48e8Ba5841D2e59d51',
    vnusd: '0x2608A88219BFB34519f635Dd9Ca2Ae971539ca60',
    azUSD: '0xf45fde3f484c44cc35bdc2a7fca3ddde0c8f252e'
  },
  methodIds: {
    virtualSwap: '0xa6d67510',
    athSwap:     '0x1bf6318b',
    vnusdSwap:   '0xa6d67510',
    ai16zSwap:   '0xa6d67510',
    stake:       '0xa694fc3a'
  },
  gasLimit: 5000000,
  gasPrice: parseUnits('7', 'gwei'),
  delayMs: 17000
};

const erc20Abi = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

function getPrivateKeys() {
  const privateKeys = [];
  let idx = 1;
  while (true) {
    const key = process.env[`PRIVATE_KEY_${idx}`];
    if (!key) break;
    privateKeys.push(key);
    idx++;
  }
  if (privateKeys.length === 0 && process.env.PRIVATE_KEY) {
    privateKeys.push(process.env.PRIVATE_KEY);
  }
  return privateKeys;
}

class WalletBot {
  constructor(privateKey, config) {
    this.config = globalConfig;
    this.provider = new JsonRpcProvider(config.rpc);
    this.wallet = new Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
    this.abiCoder = new AbiCoder();
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getTokenBalance(tokenAddr) {
    const c = new Contract(tokenAddr, erc20Abi, this.wallet);
    const decimals = await c.decimals();
    const bal = await c.balanceOf(this.address);
    let symbol;
    try { symbol = await c.symbol(); } catch { symbol = 'TOKEN'; }
    return {
      balance: bal,
      decimals,
      formatted: formatUnits(bal, decimals),
      symbol
    };
  }

  async getEthBalance() {
    const w = await this.provider.getBalance(this.address);
    return { balance: w, formatted: formatEther(w) };
  }

  async swapToken(tokenName) {
    try {
      console.log(`\n--- Swap ${tokenName} for ${this.address} ---`);
      const tokenAddr = this.config.tokens[tokenName];
      const router    = this.config.routers[tokenName];
      const methodId  = this.config.methodIds[`${tokenName}Swap`];
      if (!router || !methodId) {
        console.warn(chalk.red(`Router atau methodId tidak ditemukan untuk ${tokenName}`));
        return false;
      }

      const { balance, formatted, symbol } = await this.getTokenBalance(tokenAddr);
      if (balance === 0n) {
        console.log(chalk.red(`Tidak ada saldo ${symbol} untuk ditukar.`));
        return false;
      }

      console.log(chalk.yellow(`Approving ${symbol}...`));

      const tokenContract = new Contract(tokenAddr, erc20Abi, this.wallet);
      const allowance = await tokenContract.allowance(this.wallet.address, router);
      console.log(`Current allowance: ${formatUnits(allowance, 18)}`);
      console.log(`Balance to approve: ${formatUnits(balance, 18)}`);

      if (allowance < balance) {
        const approveTx = await tokenContract.approve(router, balance, {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        });
        console.log(chalk.cyan(`Approve tx sent: ${approveTx.hash}`));
        await approveTx.wait();
        console.log(chalk.green(`Approve tx confirmed`));
      } else {
        console.log(`Allowance cukup, tidak perlu approve`);
      }

      await this.delay(this.config.delayMs);

      console.log(chalk.yellow(`Mengirim transaksi swap...`));
      const data = methodId + this.abiCoder.encode(['uint256'], [balance]).slice(2);
      const tx = await this.wallet.sendTransaction({
        to: router,
        data,
        gasLimit: this.config.gasLimit,
        gasPrice: this.config.gasPrice
      });
      console.log(chalk.cyan(`Swap tx sent: ${tx.hash}`));
      await tx.wait();
      console.log(chalk.green(`Swap tx confirmed`));

      await this.delay(this.config.delayMs);

      console.log(chalk.green(`Swapped ${formatted} ${symbol}`));
      return true;
    } catch (e) {
      console.error(chalk.red(`swapToken error for ${tokenName}:`), e);
      return false;
    }
  }

  async stakeToken(tokenName, customAddr = null) {
    try {
      const tokenAddr = customAddr || this.config.tokens[tokenName];
      console.log(`▶ Using tokenAddress ${tokenAddr} for staking ${tokenName}`);
      const stakeCt = this.config.stakeContracts[tokenName];
      if (!stakeCt) return false;

      const { balance, formatted, symbol } = await this.getTokenBalance(tokenAddr);
      if (balance === 0n) return false;

      console.log(chalk.yellow(`Approving staking untuk ${symbol}...`));
      const approveTx = await new Contract(tokenAddr, erc20Abi, this.wallet)
        .approve(stakeCt, balance, {
          gasLimit: this.config.gasLimit,
          gasPrice: this.config.gasPrice
        });
      await approveTx.wait();
      await this.delay(this.config.delayMs);

      const data = this.config.methodIds.stake + this.abiCoder.encode(['uint256'], [balance]).slice(2);
      const tx = await this.wallet.sendTransaction({ to: stakeCt, data, gasLimit: this.config.gasLimit, gasPrice: this.config.gasPrice });
      await tx.wait();
      await this.delay(this.config.delayMs);

      console.log(chalk.green(`Staked ${formatted} ${symbol}`));
      const reportMsg = formatStakingReport(symbol, formatted, tx.hash);
      await sendReport(reportMsg);
      return true;
    } catch (e) {
      console.error(chalk.red(`stakeToken error for ${tokenName}:`), e);
      return false;
    }
  }

  async checkWalletStatus() {
    console.log(chalk.blue(`\n=== Status ${this.address} ===`));
    const eth = await this.getEthBalance();
    console.log(`ETH: ${eth.formatted}`);
    for (const [name, addr] of Object.entries(this.config.tokens)) {
      const { formatted, symbol } = await this.getTokenBalance(addr);
      console.log(`${symbol} (${name}): ${formatted}`);
    }
  }

  async claimFaucets() {
    console.log(chalk.blue(`\n=== Claim Faucets for ${this.address} ===`));
    const endpoints = {
      ath:     'https://app.x-network.io/maitrix-faucet/faucet ',
      usde:    'https://app.x-network.io/maitrix-usde/faucet ',
      lvlusd:  'https://app.x-network.io/maitrix-lvl/faucet ',
      virtual: 'https://app.x-network.io/maitrix-virtual/faucet ',
      vana:    'https://app.x-network.io/maitrix-vana/faucet ',
      ai16z:   'https://app.x-network.io/maitrix-ai16z/faucet'
    };
    for (const [tk, url] of Object.entries(endpoints)) {
      try {
        const res = await axios.post(url, { address: this.address });
        if (res.status === 200) console.log(chalk.green(`✅ Claimed ${tk}`));
      } catch (e) {
        console.error(chalk.red(`❌ Claim ${tk} gagal:`), e.response?.data || e.message);
      }
      await this.delay(this.config.delayMs);
    }
  }

  async runBot() {
    console.log(chalk.blue(`\n>>> Running bot for ${this.address}`));
    await this.checkWalletStatus();
    await this.claimFaucets();

    if (this.config.routers.virtual) await this.swapToken('virtual');
    if (this.config.routers.ath)     await this.swapToken('ath');
    if (this.config.routers.vnusd)   await this.swapToken('vnusd');
    if (this.config.routers.vnusd)   await this.swapToken('ai16z');

    for (const name of Object.keys(this.config.stakeContracts)) {
      if (name === 'vnusd') {
        await this.stakeToken(name, '0x46a6585a0Ad1750d37B4e6810EB59cBDf591Dc30');
      } else {
        await this.stakeToken(name);
      }
    }

    await this.checkWalletStatus();
    console.log(chalk.blue(`<<< Finished ${this.address}`));
  }
}

const runAllBots = async () => {
  console.log(chalk.bgBlue.white('\n=== Starting multi-account bot ==='));
  const keys = getPrivateKeys();
  if (!keys.length) {
    console.error(chalk.bgRed.white('No private keys found!'));
    return;
  }
  for (let i = 0; i < keys.length; i++) {
    console.log(`\n--- Processing account ${i+1}/${keys.length} ---`);
    const bot = new WalletBot(keys[i], globalConfig);
    await bot.runBot();
    await bot.delay(bot.config.delayMs);
  }
  console.log(chalk.bgBlue.white('=== SEMUA WALLET UDAH BANG, AH AH.. ==='));
};

runAllBots()
  .then(() => console.log(chalk.green('udah bang, selamat ISTIRAHAT')))
  .catch(e => console.error(chalk.red('Error:'), e));

const INTERVAL_MS = 24 * 60 * 60 * 1000;
console.log(`Next run: ${new Date(Date.now() + INTERVAL_MS).toLocaleString()}`);
setInterval(runAllBots, INTERVAL_MS);