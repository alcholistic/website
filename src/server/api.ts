import express from 'express';
import BookmarkletGenerator from '../utils/bookmarklet-generator';
import crypto from 'crypto';

const router = express.Router();

// Generate bookmarklet endpoint
router.post('/bookmarklet/generate', (req, res) => {
  try {
    const { serverUrl, mockWalletAddress, simulationMode } = req.body;
    
    if (!serverUrl || !mockWalletAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters' 
      });
    }
    
    const generator = new BookmarkletGenerator();
    const hashIdentifier = generator.generateUniqueHash();
    
    const config = {
      serverUrl,
      mockWalletAddress,
      simulationMode: simulationMode !== false, // Default to true
      hashIdentifier
    };
    
    const bookmarkletCode = generator.generateObfuscatedBookmarklet(config);
    
    res.json({
      success: true,
      bookmarklet: bookmarkletCode,
      hash: hashIdentifier,
      mockWalletAddress
    });
  } catch (error) {
    console.error('Error generating bookmarklet:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate bookmarklet' 
    });
  }
});

export default router;
