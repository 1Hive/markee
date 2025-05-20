import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Loader2, Plus, DollarSign, TrendingUp, MessageSquare, Globe2, ExternalLink } from 'lucide-react';

// Network configuration
const SUPPORTED_CHAINS = {
  1: { name: 'Ethereum', currency: 'ETH', factory: '0x...' },
  10: { name: 'Optimism', currency: 'ETH', factory: '0x...' },
  42161: { name: 'Arbitrum', currency: 'ETH', factory: '0x...' },
  137: { name: 'Polygon', currency: 'MATIC', factory: '0x...' },
  8453: { name: 'Base', currency: 'ETH', factory: '0x...' },
  100: { name: 'Gnosis', currency: 'xDAI', factory: '0x...' },
  42220: { name: 'Celo', currency: 'CELO', factory: '0x...' }
};

interface MarqueeData {
  address: string;
  title: string;
  description: string;
  message: string;
  currentPrice: string;
  totalFundsRaised: string;
  totalMessageChanges: number;
  uniqueContributors: number;
  rank: number;
}

interface GlobalMessageData {
  message: string;
  price: string;
  isActive: boolean;
  contributorCount: number;
}

const MainAppPage: React.FC = () => {
  // App state
  const [initialized, setInitialized] = useState(false);
  const [chainId, setChainId] = useState<number>(0);
  const [provider, setProvider] = useState<any>(null);
  const [account, setAccount] = useState<string>('');
  const [topMarquees, setTopMarquees] = useState<MarqueeData[]>([]);
  const [globalMessage, setGlobalMessage] = useState<GlobalMessageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingMarquee, setEditingMarquee] = useState<string>('');
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Helper function for chain support check
  const isChainSupported = (chainId: number): boolean => {
    return Object.keys(SUPPORTED_CHAINS).includes(chainId.toString());
  };

  // Helper functions
  const formatEther = (value: any): string => {
    if (!value) return '0';
    const ethValue = Number(value) / Math.pow(10, 18);
    return ethValue.toString();
  };

  const parseEther = (value: string): any => {
    return (parseFloat(value) * Math.pow(10, 18)).toString();
  };

  // Load mock data for demo purposes
  const loadMockData = () => {
    // Set mock global message
    setGlobalMessage({
      message: "Welcome to Markee - The future of decentralized messaging!",
      price: "1.0",
      isActive: true,
      contributorCount: 42
    });
    
    // Set mock marquees
    const mockMarquees: MarqueeData[] = [
      {
        address: "0x1234567890123456789012345678901234567890",
        title: "Help Save the Ocean",
        description: "Funding ocean cleanup initiatives",
        message: "Every drop counts in our mission to clean the oceans!",
        currentPrice: "0.1",
        totalFundsRaised: "12.5",
        totalMessageChanges: 156,
        uniqueContributors: 89,
        rank: 1
      },
      {
        address: "0x2345678901234567890123456789012345678901",
        title: "Open Source Development",
        description: "Supporting developers building the future",
        message: "Code is poetry, and we're writing the next verse of innovation.",
        currentPrice: "0.05",
        totalFundsRaised: "8.3",
        totalMessageChanges: 94,
        uniqueContributors: 67,
        rank: 2
      },
      {
        address: "0x3456789012345678901234567890123456789012",
        title: "Education for All",
        description: "Making quality education accessible globally",
        message: "Knowledge is the greatest equalizer in human society.",
        currentPrice: "0.2",
        totalFundsRaised: "6.7",
        totalMessageChanges: 71,
        uniqueContributors: 45,
        rank: 3
      },
      {
        address: "0x4567890123456789012345678901234567890123",
        title: "Climate Action Fund",
        description: "Fighting climate change through grassroots action",
        message: "The Earth doesn't belong to us - we belong to the Earth.",
        currentPrice: "0.08",
        totalFundsRaised: "4.9",
        totalMessageChanges: 38,
        uniqueContributors: 29,
        rank: 4
      },
      {
        address: "0x5678901234567890123456789012345678901234",
        title: "Local Community Garden",
        description: "Growing fresh food in urban spaces",
        message: "Sowing seeds of change, one garden at a time.",
        currentPrice: "0.03",
        totalFundsRaised: "2.1",
        totalMessageChanges: 22,
        uniqueContributors: 18,
        rank: 5
      }
    ];
    
    setTopMarquees(mockMarquees);
  };

  // Connect wallet
  const connectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        setLoading(true);
        // Request account access
        await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        
        // Get the provider
        const provider = (window as any).ethereum;
        
        // Get account
        const accounts = await provider.request({ method: 'eth_accounts' });
        const account = accounts[0];
        
        // Get chain ID
        const chainId = await provider.request({ method: 'eth_chainId' });
        
        setProvider(provider);
        setAccount(account);
        setChainId(parseInt(chainId, 16));
        
        // Load data after wallet connection
        await Promise.all([loadGlobalMessage(), loadTopMarquees()]);
        setLoading(false);
      } catch (error) {
        setError('Failed to connect wallet');
        setLoading(false);
      }
    } else {
      setError('Please install MetaMask');
    }
  };
    
  // Load global message
  const loadGlobalMessage = async () => {
    if (!provider || !isChainSupported(chainId)) return;
    
    try {
      // Mock data for demonstration
      // In real implementation, you'd call the smart contract
      setGlobalMessage({
        message: "Welcome to Markee - The future of decentralized messaging!",
        price: "1.0",
        isActive: true,
        contributorCount: 42
      });
    } catch (error) {
      console.error('Error loading global message:', error);
    }
  };

  // Load top marquees by funds raised
  const loadTopMarquees = async () => {
    if (!provider || !isChainSupported(chainId)) return;
    
    try {
      // Mock data for demonstration - we're using the mock data function
      loadMockData();
    } catch (error) {
      console.error('Error loading marquees:', error);
      setError('Failed to load marquees');
    }
  };

  // Initialize the app
  useEffect(() => {
    // Always load mock data right away for demo purposes
    loadMockData();
    
    // Attempt to connect to wallet if available
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum
        .request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            connectWallet();
          }
        })
        .catch((err: any) => {
          console.error('Error checking for wallet:', err);
        });
    }
    
    // Mark as initialized after a short delay to prevent flash of loading screen
    setTimeout(() => {
      setInitialized(true);
    }, 500);
  }, []);

  // Rest of your component remains the same...
  // (omitting for brevity, keep all the existing functions and UI code)

  // Edit marquee message
  const editMarqueeMessage = async (marqueeAddress: string) => {
    // ... your existing code ...
  };

  // Edit global message
  const editGlobalMessage = async () => {
    // ... your existing code ...
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    if (num === 0) return '0';
    if (num < 0.001) return '<0.001';
    if (num < 1) return num.toFixed(3);
    return num.toFixed(2);
  };

  // Display loading screen if app is initializing
  if (!initialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
          <p className="mt-4 text-lg text-gray-600">Loading the universe of messages...</p>
        </div>
      </div>
    );
  }

  // Get the chain info safely
  const chainInfo = chainId && isChainSupported(chainId) 
    ? SUPPORTED_CHAINS[chainId as unknown as keyof typeof SUPPORTED_CHAINS] 
    : null;

  // Rest of your render code
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Your existing UI code */}
      {/* ... */}
    </div>
  );
};

export default MainAppPage;
