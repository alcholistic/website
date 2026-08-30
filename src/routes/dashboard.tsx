import React from 'react';
import AxiomAuditDashboard from '../components/AxiomAuditDashboard';

const DashboardPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Security Research Dashboard</h1>
      
      <div className="mb-8">
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <div className="flex">
            <div className="py-1">
              <p className="text-sm text-blue-700">
                This dashboard is for authorized security research purposes only. 
                All activities are logged and monitored.
              </p>
            </div>
          </div>
        </div>
        
        <AxiomAuditDashboard />
      </div>
    </div>
  );
};

export default DashboardPage;
