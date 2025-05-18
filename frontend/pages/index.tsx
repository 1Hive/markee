import React from 'react';
import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>Markee - Decentralized Fundraising Platform</title>
        <meta name="description" content="Create embeddable fundraising messages that anyone can edit" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Welcome to Markee
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              The decentralized fundraising platform where anyone can create embeddable messages 
              that others can edit by paying an increasing price.
            </p>
            
            <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200">
                Create Your Markee
              </button>
              <button className="border border-blue-600 text-blue-600 hover:bg-blue-50 font-bold py-3 px-6 rounded-lg transition duration-200">
                Learn More
              </button>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-semibold mb-3">Multi-Chain Support</h3>
              <p className="text-gray-600">
                Deploy on Ethereum, Optimism, Arbitrum, Polygon, Base, Gnosis Chain, and Celo
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-semibold mb-3">Dynamic Pricing</h3>
              <p className="text-gray-600">
                Price increases when someone pays to edit, then decreases over time
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-semibold mb-3">Easy Embedding</h3>
              <p className="text-gray-600">
                Simple JavaScript widgets that can be embedded on any website
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
