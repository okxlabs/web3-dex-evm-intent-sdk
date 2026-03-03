# OKX Intent Swap SDK

TypeScript SDK for interacting with the OKX Intent Swap DEX protocol.

## Overview

The OKX Intent Swap SDK provides tools for:

- Creating and signing orders using EIP-712 typed data (domain: `OKX Intent Swap` v1.0.0)
- Managing order UIDs and signatures
- Interacting with the Settlement contract
- Supporting multiple signing schemes (EIP-712, eth_sign, EIP-1271, PreSign)

## Installation

```bash
pnpm add @intentswap/sdk ethers@^5.7.0
```

Or install individual packages:

```bash
pnpm add @intentswap/sdk-common
pnpm add @intentswap/sdk-config
pnpm add @intentswap/sdk-order-signing
pnpm add @intentswap/sdk-trading
pnpm add @intentswap/sdk-ethers-v5-adapter
```

## Quick Start

```typescript
import { TradingSdk, EthersV5Adapter, OrderKind, SupportedChainId } from '@intentswap/sdk';
import { ethers } from 'ethers';

// Setup
const provider = new ethers.providers.JsonRpcProvider('YOUR_RPC_URL');
const wallet = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const adapter = new EthersV5Adapter({ provider, signer: wallet });
const sdk = new TradingSdk(
  {
    chainId: SupportedChainId.MAINNET,
    appCode: 'my-app',
  },
  adapter
);

// Create and sign an order
const signedOrder = await sdk.createOrder({
  swapMode: OrderKind.EXACT_IN,
  fromTokenAddress: '0x...', // Token to sell
  toTokenAddress: '0x...', // Token to buy
  fromTokenAmount: ethers.utils.parseEther('1').toBigInt(),
  toTokenAmount: ethers.utils.parseUnits('1000', 6).toBigInt(),
});

console.log('Order UID:', signedOrder.uid);
console.log('Signature:', signedOrder.signature);
```

## Packages

| Package | Description |
| ------- | ----------- |
| `@intentswap/sdk` | Complete SDK (re-exports all packages) |
| `@intentswap/sdk-common` | Core types, constants, and utilities |
| `@intentswap/sdk-config` | Chain configuration and contract addresses |
| `@intentswap/sdk-contracts` | Contract ABIs and TypeScript bindings |
| `@intentswap/sdk-order-signing` | EIP-712 order signing utilities |
| `@intentswap/sdk-trading` | High-level trading SDK |
| `@intentswap/sdk-ethers-v5-adapter` | Ethers v5 adapter |

## Order Structure

```typescript
interface Order {
  fromTokenAddress: string; // Token to sell
  toTokenAddress: string; // Token to buy
  receiver: string; // Receiver of trade proceeds
  fromTokenAmount: bigint; // Amount to sell
  toTokenAmount: bigint; // Minimum amount to receive
  validTo: number; // Expiry timestamp (unix seconds)
  appData: string; // Application-specific data (bytes32)
  swapMode: OrderKind; // EXACT_IN
  partiallyFillable: boolean; // Allow partial fills
  commissionInfos: CommissionInfo[]; // Fee configurations
}
```

## Signing Schemes

The SDK supports multiple signing schemes:

1. **EIP-712** (default): Standard typed data signing
2. **eth_sign**: Legacy Ethereum message signing
3. **EIP-1271**: Smart contract signatures (for Gnosis Safe, etc.)
4. **PreSign**: On-chain pre-signatures

```typescript
import { SigningScheme } from '@intentswap/sdk';

// Sign with EIP-712 (default)
const order1 = await sdk.signOrder(order, SigningScheme.EIP712);

// Sign with PreSign (gasless)
const order2 = await sdk.signOrder(order, SigningScheme.PRE_SIGN);

// Set pre-signature on-chain
await sdk.setPreSignature(order2.uid, true);
```

## Commission Fees

Add commission fees to orders:

```typescript
import { CommissionFlags } from '@intentswap/sdk';

const order = await sdk.createOrder({
  // ... other params
  commissionInfos: [
    {
      feePercent: 10_000_000n, // 1% fee (in 1e9 precision)
      referrerWalletAddress: '0x...', // Fee recipient
      flag: CommissionFlags.FROM_TOKEN_COMMISSION, // Fee from sell token
    },
  ],
});
```

## Low-Level API

For more control, use `OrderSigningUtils` directly:

```typescript
import { OrderSigningUtils, createDomain } from '@intentswap/sdk';

// Get EIP-712 domain
const domain = OrderSigningUtils.getDomain(chainId, settlementAddress);

// Convert order to EIP-712 message
const message = OrderSigningUtils.orderToMessage(order);

// Compute order UID
const uid = OrderSigningUtils.computeOrderUid(orderDigest, owner, validTo);

// Extract UID params
const { orderDigest, owner, validTo } = OrderSigningUtils.extractOrderUidParams(uid);
```

## EIP-712 Domain

The SDK uses the following EIP-712 domain for order signing:

| Field | Value |
|-------|-------|
| name | `OKX Intent Swap` |
| version | `v1.0.0` |
| chainId | Network chain ID |
| verifyingContract | Settlement contract address |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## E2E Testing

Run the full end-to-end test against a local Anvil node:

```bash
# From the repository root
./scripts/sdk-e2e-anvil.sh
```

Or manually:

```bash
# Terminal 1: Start Anvil
anvil

# Terminal 2: Deploy contracts
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Terminal 3: Build and run E2E
pnpm build
cd examples/nodejs-ethers5
bun run build
bun dist/e2e-settle.js
```

The E2E test will:
1. Create and sign an order as a trader
2. Submit a settlement transaction as a solver
3. Verify token balances changed correctly
4. Output a full execution trace via `cast run`

## Contract Addresses

Update contract addresses in `packages/config/src/contracts.ts` after deployment.

## License

LGPL-3.0-or-later
