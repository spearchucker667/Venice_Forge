// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for WalletPanel: auth mode toggle, wallet address input, network badge, balance card, and top-up rails. */

import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { WalletPanel } from './WalletPanel'
import { useX402Store } from '../../stores/x402-store'

describe('WalletPanel', () => {
  const validEvmAddress = '0x1234567890123456789012345678901234567890'
  const validSolanaAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'

  beforeEach(() => {
    useX402Store.setState({
      walletAddress: '',
      siwxToken: null,
      authMode: 'api_key',
      balance: null,
      paymentRequirements: null,
      transactions: [],
      pagination: { limit: 20, offset: 0, hasMore: false },
      isLoadingBalance: false,
      isLoadingRequirements: false,
      isLoadingTransactions: false,
      isSubmittingTopUp: false,
      lastTopUpResult: null,
      error: null,
    })
  })

  it('renders title, description, and alpha badge', () => {
    render(<WalletPanel />)

    expect(screen.getByRole('heading', { level: 2, name: /Wallet & x402 Rail/i })).toBeInTheDocument()
    expect(screen.getByText(/Alpha \/ Experimental/i)).toBeInTheDocument()
    expect(screen.getByText(/Keyless authentication and payment rail/i)).toBeInTheDocument()
  })

  it('toggles auth mode priority between API Key and Wallet / x402', () => {
    render(<WalletPanel />)

    const apiKeyBtn = screen.getByRole('button', { name: /^API Key$/i })
    const x402Btn = screen.getByRole('button', { name: /^Wallet \/ x402$/i })

    expect(apiKeyBtn).toBeInTheDocument()
    expect(x402Btn).toBeInTheDocument()

    fireEvent.click(x402Btn)
    expect(useX402Store.getState().authMode).toBe('x402')

    fireEvent.click(apiKeyBtn)
    expect(useX402Store.getState().authMode).toBe('api_key')
  })

  it('detects EVM network and displays Base / EVM badge for 0x hex address', () => {
    render(<WalletPanel />)

    const addressInput = screen.getByLabelText(/Wallet Address/i)
    fireEvent.change(addressInput, { target: { value: validEvmAddress } })

    expect(screen.getByText('Base / EVM')).toBeInTheDocument()
  })

  it('detects Solana network and displays Solana badge for Base58 address', () => {
    render(<WalletPanel />)

    const addressInput = screen.getByLabelText(/Wallet Address/i)
    fireEvent.change(addressInput, { target: { value: validSolanaAddress } })

    expect(screen.getByText('Solana')).toBeInTheDocument()
  })

  it('toggles SIWX token visibility between password and text', () => {
    render(<WalletPanel />)

    const tokenInput = screen.getByLabelText(/Sign-in-with-x/i)
    expect(tokenInput).toHaveAttribute('type', 'password')

    const toggleBtn = screen.getByRole('button', { name: /Show token/i })
    fireEvent.click(toggleBtn)

    expect(tokenInput).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: /Hide token/i })).toBeInTheDocument()
  })

  it('renders balance overview card when balance is populated in store', () => {
    useX402Store.setState({
      walletAddress: validEvmAddress,
      siwxToken: 'sample_token',
      balance: {
        walletAddress: validEvmAddress,
        balanceUsd: 125.75,
        canConsume: true,
        minimumTopUpUsd: 5.0,
        suggestedTopUpUsd: 25.0,
        diemBalanceUsd: 45.0,
      },
    })

    render(<WalletPanel />)

    expect(screen.getByText('$125.75')).toBeInTheDocument()
    expect(screen.getByText(/Active/i)).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument()
  })

  it('renders payment requirements rail cards when discovered', () => {
    useX402Store.setState({
      paymentRequirements: {
        x402Version: 2,
        accepts: [
          {
            scheme: 'exact',
            network: 'base:8453',
            amount: '5000000',
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            payTo: '0xVeniceVault123',
            maxTimeoutSeconds: 300,
          },
        ],
      },
    })

    render(<WalletPanel />)

    expect(screen.getByText('Base (EVM)')).toBeInTheDocument()
    expect(screen.getByText(/0xVeniceVault123/i)).toBeInTheDocument()
    expect(screen.getByText(/5000000/i)).toBeInTheDocument()
  })

  it('renders transactions list when present', () => {
    useX402Store.setState({
      transactions: [
        {
          id: 'tx_xyz_999',
          type: 'TOP_UP',
          amount: 50.0,
          balanceAfter: 150.0,
          createdAt: '2026-09-17T12:00:00Z',
          requestId: null,
          modelId: null,
        },
      ],
      pagination: { limit: 20, offset: 0, hasMore: false },
    })

    render(<WalletPanel />)

    expect(screen.getByText('TOP_UP')).toBeInTheDocument()
    expect(screen.getByText('+$50.0000')).toBeInTheDocument()
    expect(screen.getByText('$150.0000')).toBeInTheDocument()
  })
})
