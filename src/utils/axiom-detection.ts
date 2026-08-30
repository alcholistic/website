export class AxiomDetection {
  static detectAxiomWallet(): boolean {
    if (typeof window === 'undefined') return false;
    
    // Primary detection methods
    if (window.axiom !== undefined) return true;
    if (window.solana && window.solana.isAxiom) return true;
    
    // Secondary detection methods
    if (window.solana && window.solana._walletName && 
        window.solana._walletName.toLowerCase().includes('axiom')) {
      return true;
    }
    
    // Tertiary detection by checking provider structure
    if (window.solana) {
      const hasRequiredMethods = 
        window.solana.connect && 
        window.solana.disconnect && 
        window.solana.signTransaction &&
        window.solana.signAllTransactions;
      
      if (hasRequiredMethods) {
        // Check for Axiom-specific patterns in the provider
        if (window.solana._publicKey && 
            window.solana._publicKey.toString().startsWith('Axiom')) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  static extractAxiomProvider(): any {
    if (window.axiom) return window.axiom;
    if (window.solana && this.detectAxiomWallet()) return window.solana;
    return null;
  }
}
