import React, { useState, useEffect } from 'react';
import { AlertCircle, Trophy, Users, DollarSign, CheckCircle, XCircle, Loader } from 'lucide-react';

// PocketBase Configuration
const POCKETBASE_URL = 'http://127.0.0.1:8090'; // Change to your PocketBase URL
const PAYSTACK_PUBLIC_KEY = 'pk_test_xxxxxxxxxxxx'; // Add your Paystack public key

// Default Categories - These will be loaded from PocketBase
const DEFAULT_CATEGORIES = [
  {
    name: 'Best Dressed Male',
    description: 'Most fashionable male student of the year',
    is_active: true
  },
  {
    name: 'Best Dressed Female',
    description: 'Most fashionable female student of the year',
    is_active: true
  },
  {
    name: 'SRC President of the Year',
    description: 'Outstanding SRC leadership and service',
    is_active: true
  },
  {
    name: 'Most Friendly',
    description: 'Most approachable and friendly student',
    is_active: true
  },
  {
    name: 'Most Intelligent',
    description: 'Academic excellence and brilliance',
    is_active: true
  },
  {
    name: 'Most Influential',
    description: 'Student with the most positive impact on campus',
    is_active: true
  },
  {
    name: 'Most Controversial',
    description: 'Student who stirs the most discussions',
    is_active: true
  },
  {
    name: 'Most Popular',
    description: 'Most well-known and liked student',
    is_active: true
  },
  {
    name: 'Best Couple',
    description: 'Most admired student couple on campus',
    is_active: true
  },
  {
    name: 'Best Entertainer',
    description: 'Most talented in music, dance, or comedy',
    is_active: true
  },
  {
    name: 'Sports Personality',
    description: 'Outstanding athlete of the year',
    is_active: true
  },
  {
    name: 'Best Blogger/Content Creator',
    description: 'Most creative digital content creator',
    is_active: true
  }
];

class PocketBaseClient {
  constructor(url) {
    this.url = url;
    this.authToken = null;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` }),
      ...options.headers,
    };

    const response = await fetch(`${this.url}/api/collections${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }

    return response.json();
  }

  async getCategories() {
    return this.request('/categories/records?sort=name');
  }

  async getContestants(categoryId) {
    return this.request(`/contestants/records?filter=(category_id='${categoryId}')&sort=-vote_count`);
  }

  async createVote(data) {
    return this.request('/votes/records', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async incrementVoteCount(contestantId) {
    const contestant = await this.request(`/contestants/records/${contestantId}`);
    return this.request(`/contestants/records/${contestantId}`, {
      method: 'PATCH',
      body: JSON.stringify({ vote_count: (contestant.vote_count || 0) + 1 }),
    });
  }

  getFileUrl(record, filename) {
    return `${this.url}/api/files/${record.collectionId}/${record.id}/${filename}`;
  }
}

const pb = new PocketBaseClient(POCKETBASE_URL);

// Paystack Integration
class PaystackService {
  static loadScript() {
    return new Promise((resolve) => {
      if (document.getElementById('paystack-script')) {
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.id = 'paystack-script';
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  static async initiatePayment(email, amount, metadata) {
    await this.loadScript();

    return new Promise((resolve, reject) => {
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount: amount * 100, // Convert to pesewas
        currency: 'GHS',
        metadata,
        channels: ['mobile_money', 'card'], // Enable both MoMo and card payments
        callback: function(response) {
          resolve({
            success: true,
            reference: response.reference,
            message: 'Payment successful'
          });
        },
        onClose: function() {
          resolve({
            success: false,
            message: 'Payment cancelled'
          });
        }
      });

      handler.openIframe();
    });
  }

  static async verifyPayment(reference) {
    // In production, verify server-side via webhook
    return { success: true, verified: true };
  }
}

// Main App Component
function App() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [voterEmail, setVoterEmail] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedContestant, setSelectedContestant] = useState(null);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadContestants(selectedCategory.id);
    }
  }, [selectedCategory]);

  async function loadCategories() {
    setLoading(true);
    try {
      const data = await pb.getCategories();
      const activeCats = (data.items || []).filter(c => c.is_active !== false);
      setCategories(activeCats);
      if (activeCats.length > 0) {
        setSelectedCategory(activeCats[0]);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      // If no categories in database, could show message to admin
    }
    setLoading(false);
  }

  async function loadContestants(categoryId) {
    try {
      const data = await pb.getContestants(categoryId);
      setContestants(data.items || []);
    } catch (error) {
      console.error('Error loading contestants:', error);
    }
  }

  function initiateVote(contestant) {
    setSelectedContestant(contestant);
    setShowEmailModal(true);
  }

  async function processVote() {
    if (!voterEmail || !voterEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    setProcessing(true);
    setPaymentStatus(null);
    setShowEmailModal(false);

    try {
      const metadata = {
        contestant_id: selectedContestant.id,
        contestant_name: selectedContestant.name,
        category_id: selectedCategory.id,
        category_name: selectedCategory.name,
        voter_email: voterEmail,
        custom_fields: [
          { display_name: 'Contestant', variable_name: 'contestant_name', value: selectedContestant.name },
          { display_name: 'Category', variable_name: 'category_name', value: selectedCategory.name },
          { display_name: 'Award', variable_name: 'award', value: selectedCategory.name }
        ]
      };

      const paymentResult = await PaystackService.initiatePayment(
        voterEmail, 
        1.00, 
        metadata
      );

      if (paymentResult.success) {
        const verification = await PaystackService.verifyPayment(paymentResult.reference);

        if (verification.success) {
          // Record vote in database
          await pb.createVote({
            contestant_id: selectedContestant.id,
            category_id: selectedCategory.id,
            payment_reference: paymentResult.reference,
            amount: 1.00,
            payment_status: 'success',
            voter_email: voterEmail
          });

          // Increment vote count
          await pb.incrementVoteCount(selectedContestant.id);
          
          // Reload contestants to show updated count
          loadContestants(selectedCategory.id);

          setPaymentStatus({
            type: 'success',
            message: `🎉 Vote recorded successfully for ${selectedContestant.name}! Thank you for voting.`
          });

          // Clear email for next vote
          setVoterEmail('');
        }
      } else {
        setPaymentStatus({
          type: 'error',
          message: 'Payment was cancelled or failed. Please try again.'
        });
      }
    } catch (error) {
      console.error('Voting error:', error);
      setPaymentStatus({
        type: 'error',
        message: 'An error occurred while processing your vote. Please try again.'
      });
    }

    setProcessing(false);
    setSelectedContestant(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading SRC Awards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center gap-4">
            <Trophy className="w-12 h-12" />
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-2">SRC Awards 2026</h1>
              <p className="text-lg md:text-xl text-purple-100">
                Vote for Your Favorite Students • GHS 1 per Vote
              </p>
            </div>
            <Trophy className="w-12 h-12" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Payment Status Alert */}
        {paymentStatus && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 shadow-lg ${
            paymentStatus.type === 'success' 
              ? 'bg-green-50 border-2 border-green-400' 
              : 'bg-red-50 border-2 border-red-400'
          }`}>
            {paymentStatus.type === 'success' ? (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            )}
            <p className={`font-medium ${paymentStatus.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
              {paymentStatus.message}
            </p>
            <button 
              onClick={() => setPaymentStatus(null)}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-8 bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-600">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">How to Vote:</h3>
              <ol className="text-gray-700 space-y-1 list-decimal list-inside">
                <li>Select a category from the tabs below</li>
                <li>Choose your favorite contestant</li>
                <li>Click "Vote Now" and pay GHS 1 via Mobile Money or Card</li>
                <li>Your vote will be counted immediately after payment</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="mb-8 bg-white rounded-xl shadow-lg p-3">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                className={`px-6 py-3 rounded-lg font-semibold whitespace-nowrap transition-all ${
                  selectedCategory?.id === category.id
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category Description */}
        {selectedCategory && (
          <div className="mb-6 bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              🏆 {selectedCategory.name}
            </h2>
            <p className="text-gray-600 text-lg">{selectedCategory.description}</p>
          </div>
        )}

        {/* Contestants Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contestants.map(contestant => (
            <div key={contestant.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all transform hover:-translate-y-1">
              {/* Photo */}
              <div className="relative bg-gradient-to-br from-purple-100 via-pink-100 to-orange-100 h-64 flex items-center justify-center overflow-hidden">
                {contestant.photo ? (
                  <img
                    src={pb.getFileUrl(contestant, contestant.photo)}
                    alt={contestant.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-8xl">👤</div>
                )}
                
                {/* Vote Badge */}
                <div className="absolute top-4 right-4 bg-white rounded-full px-4 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    <span className="font-bold text-lg text-gray-900">{contestant.vote_count || 0}</span>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">
                  {contestant.name}
                </h3>

                {/* Vote Button */}
                <button
                  onClick={() => initiateVote(contestant)}
                  disabled={processing}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                >
                  {processing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-5 h-5" />
                      Vote Now - GHS 1
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* No Contestants Message */}
        {contestants.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Contestants Yet</h3>
            <p className="text-gray-600">
              Contestants will appear here once they are added by the admin.
            </p>
          </div>
        )}

        {/* Empty State for Categories */}
        {categories.length === 0 && !loading && (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Categories Available</h3>
            <p className="text-gray-600 mb-4">
              Please contact the administrator to set up voting categories.
            </p>
            <p className="text-sm text-gray-500">
              Admin access: Login to PocketBase admin panel
            </p>
          </div>
        )}
      </main>

      {/* Email Input Modal */}
      {showEmailModal && selectedContestant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Trophy className="w-10 h-10 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cast Your Vote</h2>
              <p className="text-gray-600">
                Voting for <span className="font-semibold text-purple-600">{selectedContestant.name}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Enter Your Email Address
                </label>
                <input
                  type="email"
                  value={voterEmail}
                  onChange={(e) => setVoterEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full p-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && processVote()}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Your email is needed for payment processing only
                </p>
              </div>

              <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-bold text-gray-900">GHS 1.00</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Payment Method:</span>
                  <span className="font-semibold text-purple-600">Mobile Money / Card</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={processVote}
                  disabled={!voterEmail || processing}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
                >
                  Proceed to Payment
                </button>
                <button
                  onClick={() => {
                    setShowEmailModal(false);
                    setSelectedContestant(null);
                    setVoterEmail('');
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-4 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-16 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">
              Powered by Paystack • Secure Payment Gateway
            </p>
            <p className="text-purple-100">
              © 2026 SRC Awards. All rights reserved.
            </p>
            <p className="text-sm text-purple-200 mt-4">
              Admin: Access PocketBase admin panel to manage categories and contestants
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
