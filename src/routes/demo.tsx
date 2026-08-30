import React from 'react';

const DemoPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Axiom Wallet Security Research</h1>
      
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Overview</h2>
          <p className="mb-4">
            This research project focuses on security analysis of the Axiom Trading wallet infrastructure for Solana. 
            Our toolkit enables authorized red team auditing to identify potential vulnerabilities in wallet connections, 
            transaction signing, and RPC communications.
          </p>
          <p className="mb-4">
            The research is conducted in a controlled environment with proper safeguards to prevent any real transactions 
            from affecting user funds. All transaction attempts are intercepted and redirected to mock addresses.
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Methodology</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">1. Wallet Detection</h3>
              <p className="text-gray-700">
                Our bookmarklet uses multiple detection methods to identify Axiom Wallet instances, including checking for 
                specific provider patterns, wallet naming conventions, and unique method signatures.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">2. Transaction Interception</h3>
              <p className="text-gray-700">
                Once detected, the toolkit intercepts transaction signing methods to capture and analyze transaction 
                payloads before they are broadcast to the network.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">3. Mock Redirection</h3>
              <p className="text-gray-700">
                In simulation mode, all transactions are redirected to a controlled mock wallet address 
                (32KtbQ7PYEwaLyEpywGhbYYUZvLyzmXiG43v5NNYyHJ6) to prevent any real fund transfers.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">4. RPC Analysis</h3>
              <p className="text-gray-700">
                The toolkit captures and logs all RPC communications to identify potential vulnerabilities in the 
                wallet's communication with Solana network endpoints.
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Technical Implementation</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium mb-2">Bookmarklet Architecture</h3>
              <p className="text-gray-700 mb-2">
                The bookmarklet uses advanced obfuscation techniques including:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4">
                <li>XOR-based string obfuscation with position-derived keys</li>
                <li>Base64 encoding for payload compression</li>
                <li>Dynamic decompression and execution</li>
                <li>Unique hash identifiers for tracking sessions</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-2">Server-Side Dashboard</h3>
              <p className="text-gray-700 mb-2">
                The backend dashboard provides:
              </p>
              <ul className="list-disc list-inside text-gray-700 ml-4">
                <li>Real-time WebSocket updates for new connections</li>
                <li>Comprehensive logging of all transaction attempts</li>
                <li>RPC endpoint analysis and monitoring</li>
                <li>Kill switch functionality for emergency termination</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Security Safeguards</h2>
          <div className="space-y-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
              <p className="text-yellow-700">
                <strong>Important:</strong> This toolkit is designed for authorized security research only. 
                All activities are conducted in simulation mode with proper safeguards.
              </p>
            </div>
            
            <ul className="list-disc list-inside text-gray-700 ml-4">
              <li>All wallet addresses are clearly marked as TEST/MOCK</li>
              <li>Simulation mode prevents any real transaction broadcasting</li>
              <li>Kill switch functionality allows immediate termination of all testing activities</li>
              <li>Comprehensive logging ensures full audit trail of all activities</li>
              <li>Server-side validation prevents unauthorized use</li>
            </ul>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4">Usage Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Navigate to the <a href="/dashboard" className="text-blue-500 hover:underline">Dashboard</a> page</li>
            <li>Generate a new bookmarklet using the Bookmarklet Generator</li>
            <li>Drag the generated bookmarklet to your bookmarks bar</li>
            <li>Navigate to a site with Axiom Wallet integration</li>
            <li>Connect your Axiom Wallet to the site</li>
            <li>Click the bookmarklet to initiate the security audit</li>
            <li>Monitor results in the dashboard in real-time</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default DemoPage;
