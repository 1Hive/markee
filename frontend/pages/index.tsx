import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Loader2, Plus, DollarSign, TrendingUp, MessageSquare, Globe2, ExternalLink } from 'lucide-react';

// Mock contract ABIs - replace with actual ABIs when deploying
const MarqueeFactoryABI = ["function getAllMarquees() view returns (address[])", "function getGlobalMessageStats() view returns (string, bool, uint256, uint256, uint256)"];
const MarqueeABI = ["function title() view returns (string)", "function description() view returns (string)", "function getCurrentMessage() view returns (string)", "function getCurrentPrice() view returns (uint256)", "function getAnalytics() view returns (uint256, uint256, uint256, uint256)", "function setMessage(string calldata) payable"];

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
  const [chainId, setChainId] = useState<number>(0);
  const [provider, setProvider] = useState<any>(null);
  const [account, setAccount] = useState<string>('');
  const [topMarquees, setTopMarquees] = useState<MarqueeData[]>([]);
  const [globalMessage, setGlobalMessage] = useState<GlobalMessageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMarquee, setEditingMarquee] = useState<string>('');
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Helper function to format ether values
  const formatEther = (value: any): string => {
    if (!value) return '0';
    // Simple conversion for demonstration - in real app you'd use proper library
    const ethValue = Number(value) / Math.pow(10, 18);
    return ethValue.toString();
  };

  // Helper function to parse ether values
  const parseEther = (value: string): any => {
    // Simple conversion for demonstration - in real app you'd use proper library
    return (parseFloat(value) * Math.pow(10, 18)).toString();
  };
  // Connect wallet
  const connectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
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
      } catch (error) {
        setError('Failed to connect wallet');
      }
    } else {
      setError('Please install MetaMask');
    }
  };

    const isChainSupported = (chainId: number): boolean => {
      return Object.keys(SUPPORTED_CHAINS).includes(chainId.toString());
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
      // Mock data for demonstration
      // In real implementation, you'd call the smart contracts
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
    } catch (error) {
      console.error('Error loading marquees:', error);
      setError('Failed to load marquees');
    }
  };

  // Load data when wallet connects
  useEffect(() => {
    const loadData = async () => {
      if (provider && chainId && isChainSupported(chainId)) {
        setLoading(true);
        await Promise.all([loadGlobalMessage(), loadTopMarquees()]);
        setLoading(false);
      }
    };
    
    loadData();
  }, [provider, chainId]);

  // Edit marquee message
  const editMarqueeMessage = async (marqueeAddress: string) => {
    if (!provider || !account || !newMessage.trim()) {
      setError('Please connect wallet and enter a message');
      return;
    }
    
    setSubmitting(true);
    setError('');
    
    try {
      // Mock implementation - in real app you'd interact with the contract
      console.log('Editing marquee:', marqueeAddress, 'with message:', newMessage);
      
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setSuccess('Message updated successfully!');
      setEditingMarquee('');
      setNewMessage('');
      
      // Reload data
      await loadTopMarquees();
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (error: any) {
      console.error('Error updating message:', error);
      setError('Failed to update message');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit global message
  const editGlobalMessage = async () => {
    if (!provider || !account || !newMessage.trim() || !globalMessage) {
      setError('Please connect wallet and enter a message');
      return;
    }
    
    setSubmitting(true);
    setError('');
    
    try {
      // Mock implementation - in real app you'd interact with the contract
      console.log('Editing global message with:', newMessage);
      
      // Simulate transaction delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setSuccess('Global message updated successfully!');
      setEditingGlobal(false);
      setNewMessage('');
      
      // Reload data
      await loadGlobalMessage();
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (error: any) {
      console.error('Error updating global message:', error);
      setError('Failed to update global message');
    } finally {
      setSubmitting(false);
    }
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

  if (loading) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            The Global Message Board
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Where every message has a price, and the highest bidders control the narrative. 
            Pay to speak, pay more to stay heard.
          </p>
          
          {!account ? (
            <Button onClick={connectWallet} size="lg" className="mt-6">
              Connect Wallet to Participate
            </Button>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-4">
              <Badge variant="outline" className="px-4 py-2">
                {formatAddress(account)}
              </Badge>
              <Badge variant="outline" className="px-4 py-2">
                {chainInfo?.name || 'Unsupported Network'}
              </Badge>
            </div>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 rounded-lg text-red-800">
            {error}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setError('')}
              className="ml-2"
            >
              ×
            </Button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-100 border border-green-200 rounded-lg text-green-800">
            {success}
          </div>
        )}

        {/* Global Message - Front and Center */}
        {globalMessage && (
          <Card className="mb-12 border-2 border-gold bg-gradient-to-r from-yellow-50 to-amber-50">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                <Globe2 className="h-8 w-8 text-amber-600" />
                Global Platform Message
                {globalMessage.isActive && (
                  <Badge className="bg-amber-600">Active</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <div className="bg-white p-6 rounded-lg border-2 border-amber-200">
                <p className="text-2xl font-medium text-gray-800 italic">
                  "{globalMessage.message}"
                </p>
              </div>
              
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <DollarSign className="mx-auto h-6 w-6 text-amber-600 mb-1" />
                  <p className="text-sm text-gray-600">Next Price</p>
                  <p className="text-lg font-bold text-amber-700">
                    {formatCurrency(globalMessage.price)} {chainInfo?.currency}
                  </p>
                </div>
                <div className="text-center">
                  <MessageSquare className="mx-auto h-6 w-6 text-amber-600 mb-1" />
                  <p className="text-sm text-gray-600">Contributors</p>
                  <p className="text-lg font-bold text-amber-700">
                    {globalMessage.contributorCount}
                  </p>
                </div>
              </div>

              {!editingGlobal ? (
                <Button
                  onClick={() => setEditingGlobal(true)}
                  size="lg"
                  className="bg-amber-600 hover:bg-amber-700"
                  disabled={!account}
                >
                  Edit Global Message
                </Button>
              ) : (
                <div className="space-y-4 max-w-md mx-auto">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Your new global message..."
                    maxLength={200}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={editGlobalMessage}
                      disabled={submitting || !newMessage.trim()}
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        `Pay ${formatCurrency(globalMessage.price)} ${chainInfo?.currency}`
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingGlobal(false);
                        setNewMessage('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top Marquees Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Most Valuable Messages
          </h2>
          <p className="text-center text-gray-600 mb-8">
            The messages that have generated the most funds. Pay to take over their narrative.
          </p>
        </div>

        {/* Marquees Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create New Marquee Button */}
          <Card className="border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors cursor-pointer">
            <CardContent className="p-8 text-center h-full flex flex-col justify-center">
              <Plus className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Create Your Marquee
              </h3>
              <p className="text-gray-500 mb-4">
                Start your own fundraising message that others can edit
              </p>
              <Button 
                variant="outline"
                onClick={() => window.location.href = '/dashboard'}
              >
                Get Started
              </Button>
            </CardContent>
          </Card>

          {/* Top Marquees */}
          {topMarquees.map((marquee) => (
            <Card 
              key={marquee.address} 
              className="hover:shadow-lg transition-shadow relative overflow-hidden"
            >
              <div className="absolute top-4 right-4">
                <Badge className="bg-blue-600">
                  #{marquee.rank}
                </Badge>
              </div>
              
              <CardHeader>
                <CardTitle className="pr-12">{marquee.title}</CardTitle>
                <p className="text-sm text-gray-600">{marquee.description}</p>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-center italic text-gray-800">
                    "{marquee.message}"
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <DollarSign className="mx-auto h-5 w-5 text-green-600 mb-1" />
                    <p className="text-xs text-gray-600">Total Raised</p>
                    <p className="font-bold text-green-600">
                      {formatCurrency(marquee.totalFundsRaised)}
                    </p>
                  </div>
                  <div>
                    <TrendingUp className="mx-auto h-5 w-5 text-blue-600 mb-1" />
                    <p className="text-xs text-gray-600">Next Price</p>
                    <p className="font-bold text-blue-600">
                      {formatCurrency(marquee.currentPrice)}
                    </p>
                  </div>
                  <div>
                    <MessageSquare className="mx-auto h-5 w-5 text-purple-600 mb-1" />
                    <p className="text-xs text-gray-600">Changes</p>
                    <p className="font-bold text-purple-600">
                      {marquee.totalMessageChanges}
                    </p>
                  </div>
                </div>

                {editingMarquee === marquee.address ? (
                  <div className="space-y-3">
                    <Textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Your new message..."
                      maxLength={200}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => editMarqueeMessage(marquee.address)}
                        disabled={submitting || !newMessage.trim()}
                        size="sm"
                        className="flex-1"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          `Pay ${formatCurrency(marquee.currentPrice)} ${chainInfo?.currency}`
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMarquee('');
                          setNewMessage('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      onClick={() => setEditingMarquee(marquee.address)}
                      size="sm"
                      className="w-full"
                      disabled={!account}
                    >
                      Edit Message
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open(`https://etherscan.io/address/${marquee.address}`, '_blank')}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Contract
                    </Button>
                  </div>
                )}

                <div className="text-xs text-gray-500 text-center">
                  {formatAddress(marquee.address)}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Fill empty spots with placeholder cards if less than 10 marquees */}
          {Array.from({ length: Math.max(0, 9 - topMarquees.length) }).map((_, index) => (
            <Card key={`placeholder-${index}`} className="border-dashed border-gray-200">
              <CardContent className="p-8 text-center">
                <div className="text-gray-400">
                  <MessageSquare className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">Waiting for more marquees...</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-gray-600">
            Ready to create your own message? 
            <Button variant="link" onClick={() => window.location.href = '/dashboard'}>
              Go to Dashboard
            </Button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainAppPage;
