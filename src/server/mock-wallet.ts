import { Connection, PublicKey, Transaction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import crypto from 'crypto';

export class MockWallet {
  private keypair: Keypair;
  private connection: Connection;
  private logs: any[] = [];

  constructor(connectionUrl: string = 'https://api.mainnet-beta.solana.com') {
    this.keypair = Keypair.generate();
    this.connection = new Connection(connectionUrl);
  }

  getPublicKey(): string {
    return this.keypair.publicKey.toString();
  }

  async getBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    this.logTransaction(transaction, 'signTransaction');
    
    // In simulation mode, just return the transaction
    return transaction;
  }

  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    this.logTransaction(transactions[0], 'signAllTransactions');
    
    // In simulation mode, just return the transactions
    return transactions;
  }

  async sendTransaction(transaction: Transaction): Promise<{ signature: string }> {
    this.logTransaction(transaction, 'sendTransaction');
    
    // In simulation mode, return a mock signature
    const mockSignature = 'mock-' + crypto.randomBytes(32).toString('hex');
    return { signature: mockSignature };
  }

  private logTransaction(transaction: Transaction, method: string): void {
    const log = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: new Date().toISOString(),
      method,
      publicKey: this.getPublicKey(),
      transaction: transaction.serialize().toString('base64'),
      instructions: transaction.instructions.map(ix => ({
        programId: ix.programId.toString(),
        keys: ix.keys.map(k => ({
          pubkey: k.pubkey.toString(),
          isSigner: k.isSigner,
          isWritable: k.isWritable
        })),
        data: ix.data.toString('base64')
      }))
    };
    
    this.logs.push(log);
    console.log('Transaction logged:', log);
  }

  getLogs(): any[] {
    return this.logs;
  }

  clearLogs(): void {
    this.logs = [];
  }
}
