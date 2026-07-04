const { Connection, Keypair, VersionedTransaction, TransactionMessage } = require("@solana/web3.js");

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const RPC_URL = process.env.SOLANA_RPC || "https://api.devnet.solana.com";

const connection = new Connection(RPC_URL, "confirmed");

// Use env var keypair, or generate one for devnet
let wallet;
const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
if (privateKeyStr) {
  const secret = Uint8Array.from(JSON.parse(privateKeyStr));
  wallet = Keypair.fromSecretKey(secret);
} else {
  wallet = Keypair.generate();
  console.log(`⚠ No SOLANA_PRIVATE_KEY set. Using ephemeral keypair: ${wallet.publicKey.toBase58()}`);
  console.log(`  Fund it at https://faucet.solana.com/?cluster=devnet for transactions`);
}

async function submitHash(hash, metadata) {
  const memoText = `ALTAR-EYES:${hash}${metadata?.videoPath ? `:${metadata.videoPath}` : ""}`;

  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
      instructions: [
        {
          programId: MEMO_PROGRAM_ID,
          keys: [],
          data: Buffer.from(memoText, "utf8"),
        },
      ],
    }).compileToV0Message(),
  );

  tx.sign([wallet]);
  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature, "confirmed");

  return {
    transactionId: signature,
    hash,
    timestamp: Math.floor(Date.now() / 1000),
    proofType: "transaction",
    memo: memoText,
    network: connection.rpcEndpoint,
  };
}

module.exports = { submitHash, wallet, connection };
