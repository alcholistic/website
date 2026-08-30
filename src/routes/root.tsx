import React, { useState, useEffect } from 'react';

const RootPage: React.FC = () => {
  const [serverStatus, setServerStatus] = useState({
    active: false,
    connections: 0,
    successfulInjections: 0,
    lastUpdated: ''
  });
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    fetch('/api/bookmarklet/status')
      .then(res => res.json())
      .then(data => {
        setServerStatus(data);
        setKillSwitchActive(!data.active);
      })
      .catch(err => console.error('Error fetching status:', err));
  }, []);

  const activateKillSwitch = async () => {
    setIsActivating(true);
    
    try {
      const response = await fetch('/api/kill-switch', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setKillSwitchActive(true);
        setServerStatus(prev => ({
          ...prev,
          active: false
        }));
      }
    } catch (error) {
      console.error('Error activating kill switch:', error);
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Axiom Wallet Security Research</h1>
      
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">System Status</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className={`p-4 rounded-lg \${killSwitchActive ? 'bg-red-50' : 'bg-green-50'}`}>
              <h3 className="font-semibold mb-2">Server Status</h3>
              <p className={`text-2xl font-bold \${killSwitchActive ? 'text-red-600' : 'text-green-600'}`}>
                {killSwitchActive ? 'Inactive' : 'Active'}
              </p>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Active Connections</h3>
              <p className="text-2xl font-bold text-blue-600">{serverStatus.connections}</p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Successful Injections</h3>
              <p className="text-2xl font-bold text-purple-600">{serverStatus.successfulInjections}</p>
            </div>
          </div>
          
          <div className="mb-4">
            <p className="text-gray-700 mb-2">
              Last updated: {serverStatus.lastUpdated ? new Date(serverStatus.lastUpdated).toLocaleString() : 'Never'}
            </p>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={activateKillSwitch}
              disabled={killSwitchActive || isActivating}
              className={`px-4 py-2 rounded font-medium \${
                killSwitchActive 
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {isActivating ? 'Activating...' : killSwitchActive ? 'Kill Switch Active' : 'Activate Kill Switch'}
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Project Overview</h2>
          <p className="mb-4">
            This is a security research toolkit for authorized red team auditing of Axiom Trading wallet infrastructure. 
            The toolkit is designed to identify potential vulnerabilities in wallet connections, transaction signing, 
            and RPC communications.
          </p>
          <p className="mb-4">
            All activities are conducted in a controlled environment with proper safeguards to prevent any real 
            transactions from affecting user funds.
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-4">Navigation</h2>
          <div className="space-y-2">
            <a href="/dashboard" className="block py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 text-center">
              Dashboard
            </a>
            <a href="/demo" className="block py-2 px-4 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-center">
              Demo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RootPage;
                 
