import { Address, parseUnits, WalletClient, zeroAddress } from 'viem';
// import { createViemPublicClient } from '../../utils/createViemPublicClient';
// import { createViemWalletClient } from '../../utils/createViemWalletClient';
import { ToolConfig } from '../allTools';
import {
  KodiakSwapRouter02ABI,
  KodiakUniswapV2Router02ABI,
} from '../../constants/kodiakABI';
// import { TokenABI } from '../../constants/tokenABI';
import {
  checkAndApproveAllowance,
  fetchTokenDecimals,
} from '../../utils/helpers';
import { log } from '../../utils/logger';
import { ConfigChain } from '../../constants/chain';

// TODO: In the futures, we should detect tokenIn by token name or symbol. So that user can easy to use
interface KodiakSwapArgs {
  amountIn: number;
  amountOutMin: number;
  tokenIn?: Address; // Optional input token, defaults to ETH if null or undefined
  tokenOut: Address; // Output token address
  to?: Address; // Optional recipient address
}

export const kodiakSwapTool: ToolConfig<KodiakSwapArgs> = {
  definition: {
    type: 'function',
    function: {
      name: 'kodiak_swap',
      description: 'Perform a token swap on Kodiak',
      parameters: {
        type: 'object',
        properties: {
          amountIn: {
            type: 'number',
            description: 'The amount of input tokens to swap',
          },
          amountOutMin: {
            type: 'number',
            description: 'The minimum amount of output tokens expected',
          },
          tokenIn: {
            type: ['string'],
            pattern: '^0x[a-fA-F0-9]{40}$',
            description:
              'Address of the input token (optional, defaults to bera native token if null)',
          },
          tokenOut: {
            type: 'string',
            pattern: '^0x[a-fA-F0-9]{40}$',
            description: 'Address of the output token',
          },
          to: {
            type: 'string',
            pattern: '^0x[a-fA-F0-9]{40}$',
            description:
              "The optional recipient's public address for the output tokens. Default is the wallet address",
          },
        },
        required: ['amountIn', 'amountOutMin', 'tokenOut'],
      },
    },
  },
  handler: async (args, config: ConfigChain, walletClient?: WalletClient) => {
    try {
      if (!walletClient || !walletClient.account) {
        throw new Error('Wallet client is not provided');
      }

      const recipient =
        args.to && args.to !== zeroAddress
          ? args.to
          : walletClient.account.address;
      const isNativeSwap = !args.tokenIn || args.tokenIn === zeroAddress;

      log.info(
        `[INFO] Initiating Kodiak swap: ${args.amountIn} ${isNativeSwap ? 'BERA' : args.tokenIn} for ${args.tokenOut} to ${recipient}`,
      );

      const deadline = Math.floor(Date.now() / 1000) + 1200;

      let tx;
      const inputTokenDecimals = await fetchTokenDecimals(
        walletClient,
        args.tokenIn!,
      );

      if (isNativeSwap) {
        const parsedAmountOutMin = parseUnits(
          args.amountOutMin.toString(),
          Number(inputTokenDecimals),
        );
        tx = await walletClient.writeContract({
          address: config.CONTRACT.KodiakUniswapV2Router02,
          abi: KodiakUniswapV2Router02ABI,
          functionName: 'swapExactETHForTokens',
          args: [
            parsedAmountOutMin,
            [config.TOKEN.WBERA, args.tokenOut],
            recipient,
            BigInt(deadline),
          ],
          chain: walletClient.chain,
          account: walletClient.account,
          value: parseUnits(
            args.amountIn.toString(),
            Number(inputTokenDecimals),
          ),
        });
      } else {
        const parsedAmountIn = parseUnits(
          args.amountIn.toString(),
          Number(inputTokenDecimals),
        );
        const parsedAmountOutMin = parseUnits(
          args.amountOutMin.toString(),
          Number(inputTokenDecimals),
        );

        await checkAndApproveAllowance(
          walletClient,
          args.tokenIn!,
          config.CONTRACT.KodiakSwapRouter02,
          parsedAmountIn,
        );

        tx = await walletClient.writeContract({
          address: config.CONTRACT.KodiakSwapRouter02,
          abi: KodiakSwapRouter02ABI,
          functionName: 'swapExactTokensForTokens',
          args: [
            parsedAmountIn,
            parsedAmountOutMin,
            [args.tokenIn!, args.tokenOut] as const,
            recipient,
          ],
          chain: walletClient.chain,
          account: walletClient.account,
        });
      }

      // const receipt = await walletClient.waitForTransactionReceipt({
      //   hash: tx as `0x${string}`,
      // });

      // if (receipt.status !== "success") {
      //   throw new Error(
      //     `Swap transaction failed with status: ${receipt.status}`,
      //   );
      // }

      log.info(`[INFO] Kodiak swap successful: Transaction hash: ${tx}`);
      return tx;
    } catch (error: any) {
      log.error(`[ERROR] Kodiak swap failed: ${error.message}`);
      throw new Error(`Swap failed: ${error.message}`);
    }
  },
};
