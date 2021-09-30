/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Keypair,
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
const {
  getTokenAccount,
  createMint,
  createTokenAccount,
  mintToAccount,
} = require("./utilsdir");
import fs from 'mz/fs';
import path from 'path';
import * as borsh from 'borsh';
import { AccountLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getPayer, getRpcUrl, createKeypairFromFile } from './utils';
const anchor = require('@project-serum/anchor');
const { SystemProgram } = anchor.web3;
var web3 = require('@solana/web3.js');
var splToken = require('@solana/spl-token');
/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Keypair associated to the fees' payer
 */
let payer: Keypair;

/**
 * Hello world's program id
 */
let programId: PublicKey;

/**
 * The public key of the account we are saying hello to
 */
let greetedPubkey: PublicKey;

/**
 * Path to program files
 */
const PROGRAM_PATH = path.resolve(__dirname, '../../dist/program');

/**
 * Path to program shared object file which should be deployed on chain.
 * This file is created when running either:
 *   - `npm run build:program-c`
 *   - `npm run build:program-rust`
 */
const PROGRAM_SO_PATH = path.join(PROGRAM_PATH, 'helloworld.so');

/**
 * Path to the keypair of the deployed program.
 * This file is created when running `solana program deploy dist/program/helloworld.so`
 */
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'helloworld-keypair.json');

/**
 * The state of a greeting account managed by the hello world program
 */
class GreetingAccount {
  counter = 0;
  constructor(fields: { counter: number } | undefined = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

class MetaAccountClass {
  name = "";
  symbol = "";
  uri = "";
  constructor(fields: { name: string, symbol: string, uri: string } | undefined = undefined) {
    if (fields) {
      this.name = fields.name;
      this.symbol = fields.symbol;
      this.uri = fields.uri;
    }
  }
}


/**
 * Borsh schema definition for greeting accounts
 */
const GreetingSchema = new Map([
  [GreetingAccount, { kind: 'struct', fields: [['counter', 'u32']] }],
]);

const MetaSchema = new Map([
  [MetaAccountClass, { kind: 'struct', fields: [['name', 'string'], ['symbol', 'string'], ['uri', 'string']] }],
]);

/**
 * The expected size of each greeting account.
 */
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount(),
).length;

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
  const rpcUrl = await getRpcUrl();
  connection = new Connection(rpcUrl, 'confirmed');
  const version = await connection.getVersion();
  console.log('Connection to cluster established:', rpcUrl, version);
}

/**
 * Establish an account to pay for everything
 */
export async function establishPayer(): Promise<void> {
  let fees = 0;
  if (!payer) {
    const { feeCalculator } = await connection.getRecentBlockhash();

    // Calculate the cost to fund the greeter account
    fees += await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);

    // Calculate the cost of sending transactions
    fees += feeCalculator.lamportsPerSignature * 100; // wag

    payer = await getPayer();
  }

  let lamports = await connection.getBalance(payer.publicKey);
  if (lamports < fees) {
    // If current balance is not enough to pay for fees, request an airdrop
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      fees - lamports,
    );
    await connection.confirmTransaction(sig);
    lamports = await connection.getBalance(payer.publicKey);
  }

  console.log(
    'Using account',
    payer.publicKey.toBase58(),
    'containing',
    lamports / LAMPORTS_PER_SOL,
    'SOL to pay for fees',
  );
}

/**
 * Check if the hello world BPF program has been deployed
 */
export async function checkProgram(): Promise<void> {
  // Read program id from keypair file
  try {
    const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err as Error).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``,
    );
  }

  // Check if the program has been deployed
  const programInfo = await connection.getAccountInfo(programId);
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_SO_PATH)) {
      throw new Error(
        'Program needs to be deployed with `solana program deploy dist/program/helloworld.so`',
      );
    } else {
      throw new Error('Program needs to be built and deployed');
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`);
  }
  console.log(`Using program ${programId.toBase58()}`);

  // Derive the address (public key) of a greeting account from the program so that it's easy to find later.
  const GREETING_SEED = 'hello';
  greetedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    GREETING_SEED,
    programId,
  );

  // Check if the greeting account has already been created
  const greetedAccount = await connection.getAccountInfo(greetedPubkey);
  if (greetedAccount === null) {
    console.log(
      'Creating account',
      greetedPubkey.toBase58(),
      'to say hello to',
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE,
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: GREETING_SEED,
        newAccountPubkey: greetedPubkey,
        lamports,
        space: GREETING_SIZE,
        programId,
      }),
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
}

/**
 * Say hello
 */
export async function sayHello(): Promise<void> {

  const [charmpda, _nonce] = await anchor.web3.PublicKey.findProgramAddress(
    ["CharmPDA"],
    programId
  );
  console.log("Charm PDA ", charmpda.toBase58());
  const lamportsRequiredForRentFree = await connection.getMinimumBalanceForRentExemption(82);
  const mint = new PublicKey("xP6sctBveLCrQoJ8gjBrtwa99zeF57e6zGxHQC1THN6");
  const metadataMainAccount = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const [metadataAccount, _nonce1] = await anchor.web3.PublicKey.findProgramAddress(
    ["metadata", metadataMainAccount.toBuffer(), mint.toBuffer()],
    metadataMainAccount
  );
  const [masterEditionAccount, _nonce2] = await anchor.web3.PublicKey.findProgramAddress(
    ["metadata", metadataMainAccount.toBuffer(), mint.toBuffer(), "edition"],
    metadataMainAccount
  );
  console.log("metadataAccount ", metadataAccount.toBase58());
  console.log('Saying hello to', greetedPubkey.toBase58());
  const instruction = new TransactionInstruction({
    keys: [
      
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      { pubkey: metadataAccount, isSigner: false, isWritable: true },
      { pubkey: masterEditionAccount, isSigner: false, isWritable: true },
      { pubkey: metadataMainAccount, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      
    ],
    programId,
    data: Buffer.alloc(74, "NFTCREATEDBYGPATHELAGNFThttps://jsonplaceholder.typicode.com/posts/1234567"), // All instructions are hellos
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer],
  );
}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function reportGreetings(): Promise<void> {
  const accountInfo = await connection.getAccountInfo(greetedPubkey);
  const metaInfo = await connection.getAccountInfo(new PublicKey("7aoGRBSiF9JqUN59bTWY2FGUX4XmgmcRfd7aY4iyoArh"));
  if (accountInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  if (metaInfo === null) {
    throw 'Error: cannot find the greeted account';
  }
  const greeting = borsh.deserialize(
    GreetingSchema,
    GreetingAccount,
    accountInfo.data,
  );
  console.log(
    greetedPubkey.toBase58(),
    'has been greeted',
    greeting.counter,
    'time(s)',
  );

    //const meta = borsh.deserialize(MetaSchema, MetaAccountClass, metaInfo.data)
    //console.log("Meta Info name: " + meta.name);

}
