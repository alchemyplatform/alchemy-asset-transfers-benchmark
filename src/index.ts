import { AssetTransfersCategory, createAlchemyWeb3 } from "@alch/alchemy-web3";
import yargs from "yargs";
import { range } from "transducist";
import { runConcurrently } from "./async";

const WETH_ADDR = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// If a token follows the ERC20/ERC721 standard it will store this value in topic0 when it emits a transfer event
export const TOKEN_TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function numToHexStr(num: number): string {
  return "0x" + num.toString(16);
}

export function hexAddressToHex64Str(str: string): string {
  return "0x" + "0".repeat(24) + str.substr(-40);
}

async function main(): Promise<void> {
  const argv = yargs(process.argv.slice(2)).options({
    api_key: { type: "string", alias: "Alchemy API Key", required: true },
    from_block: { type: "number", alias: "From Block", default: 11000000 },
    to_block: { type: "number", alias: "To Block", default: 11005000 },
    to_address: { type: "string", alias: "To Address", default: WETH_ADDR },
  }).argv;

  const web3 = createAlchemyWeb3(
    `https://eth-mainnet.alchemyapi.io/v2/${argv.api_key}`,
  );

  let pKey = "";

  const startAssetTransfers = Date.now();
  try {
    while (true) {
      const filters = {
        fromBlock: numToHexStr(argv.from_block),
        toBlock: numToHexStr(argv.to_block),
        toAddress: argv.to_address,
        pageKey: pKey === "" ? undefined : pKey,
        excludeZeroValue: false,
        category: [
          AssetTransfersCategory.EXTERNAL,
          AssetTransfersCategory.TOKEN,
        ],
      };
      const assetTransfers = await web3.alchemy.getAssetTransfers(filters);
      if (!assetTransfers.pageKey) {
        break;
      } else {
        pKey = assetTransfers.pageKey;
      }
    }
  } catch (error) {
    console.log(error);
  }
  const endAssetTransfers = Date.now();
  console.log(
    `Calling alchemy_getAssetTransfers to fetch all transfers sent to ${
      argv.to_address
    } from block ${argv.from_block} to ${argv.to_block} took: ${
      endAssetTransfers - startAssetTransfers
    } ms`,
  );

  const startBlockByBlock = Date.now();

  const getBlockTransactions = async (blockNum: number) => {
    try {
      await web3.eth.getBlock(blockNum, true);
    } catch {
      // we aren't even going to retry because we will still be faster ;)
    }
  };
  try {
    // How you used to have to get external transfers
    await runConcurrently(
      // We are going to skip the custom filtering you'd still have to do here to filter for the to address because it's a hassle
      // Plus we know we will still be faster ;)
      [...range(argv.from_block, argv.to_block + 1)],
      getBlockTransactions,
      { maxConcurrency: 5 },
    );
    // How you used to have to get token transfers
    await web3.eth.getPastLogs({
      fromBlock: argv.from_block,
      toBlock: argv.to_block,
      topics: [
        TOKEN_TRANSFER_TOPIC0,
        null,
        hexAddressToHex64Str(argv.to_address),
      ],
    });
  } catch (error) {
    console.log(error);
  }
  const endBlockByBlock = Date.now();
  console.log(
    `Calling eth_getBlockByNumber and eth_getLogs to fetch all transfers sent to ${
      argv.to_address
    } from block ${argv.from_block} to ${argv.to_block} took: ${
      endBlockByBlock - startBlockByBlock
    } ms`,
  );
}

main();
