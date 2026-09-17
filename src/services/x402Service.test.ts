// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for x402Service: wallet validation, network detection, balance, top-up, transactions. */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateWalletAddress,
  detectWalletNetworkType,
  formatWalletAddress,
  getX402Balance,
  getX402PaymentRequirements,
  submitX402TopUp,
  getX402Transactions,
} from './x402Service'
import { veniceFetch } from './veniceClient/fetch'
import type { VeniceApiError } from './veniceClient/errors'

function createVeniceApiError(message: string, status: number, responseBody?: unknown): VeniceApiError {
  const error = new Error(message) as VeniceApiError
  error.status = status
  error.responseBody = responseBody
  return error
}

vi.mock('./veniceClient/fetch', () => ({
  veniceFetch: vi.fn(),
}))

describe('x402Service', () => {
  const validEvmAddress = '0x1234567890123456789012345678901234567890'
  const validSolanaAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
  const sampleSiwxToken = 'eyJuZXR3b3JrIjoiZXZtIiwic2lnbmF0dXJlIjoiMHgxMjMifQ=='

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateWalletAddress', () => {
    it('accepts valid 40-hex-character EVM addresses with 0x prefix', () => {
      expect(validateWalletAddress(validEvmAddress)).toBe(true)
      expect(validateWalletAddress('0xabcdefABCDEF1234567890123456789012345678')).toBe(true)
    })

    it('accepts valid Base58 Solana addresses (32-44 chars)', () => {
      expect(validateWalletAddress(validSolanaAddress)).toBe(true)
      expect(validateWalletAddress('11111111111111111111111111111111')).toBe(true) // 32 chars
    })

    it('rejects invalid or malformed wallet addresses', () => {
      expect(validateWalletAddress('')).toBe(false)
      expect(validateWalletAddress('not-an-address')).toBe(false)
      expect(validateWalletAddress('0x123')).toBe(false) // too short
      expect(validateWalletAddress('0xGGGG567890123456789012345678901234567890')).toBe(false) // non-hex
      expect(validateWalletAddress(null as unknown as string)).toBe(false)
      expect(validateWalletAddress(undefined as unknown as string)).toBe(false)
    })
  })

  describe('detectWalletNetworkType', () => {
    it('detects EVM network for 0x hex addresses', () => {
      expect(detectWalletNetworkType(validEvmAddress)).toBe('evm')
    })

    it('detects Solana network for Base58 addresses', () => {
      expect(detectWalletNetworkType(validSolanaAddress)).toBe('solana')
    })

    it('returns unknown for invalid addresses', () => {
      expect(detectWalletNetworkType('invalid-address')).toBe('unknown')
      expect(detectWalletNetworkType('')).toBe('unknown')
    })
  })

  describe('formatWalletAddress', () => {
    it('truncates middle characters for long addresses', () => {
      const formatted = formatWalletAddress(validEvmAddress)
      expect(formatted).toBe('0x1234...7890')
      expect(formatWalletAddress(validSolanaAddress)).toBe('9WzDXw...AWWM')
    })

    it('returns empty string for empty input and leaves short string unchanged', () => {
      expect(formatWalletAddress('')).toBe('')
      expect(formatWalletAddress('short')).toBe('short')
    })
  })

  describe('getX402Balance', () => {
    it('rejects invalid wallet address before making network requests', async () => {
      await expect(getX402Balance('invalid', sampleSiwxToken)).rejects.toThrow(
        /Invalid EVM or Solana wallet address format/,
      )
      expect(veniceFetch).not.toHaveBeenCalled()
    })

    it('rejects empty SIWX token', async () => {
      await expect(getX402Balance(validEvmAddress, '')).rejects.toThrow(
        /Sign-in-with-x token is required/,
      )
      expect(veniceFetch).not.toHaveBeenCalled()
    })

    it('fetches balance with SIGN-IN-WITH-X header on valid request', async () => {
      const mockBalanceData: X402BalanceData = {
        walletAddress: validEvmAddress,
        balanceUsd: 150.5,
        canConsume: true,
        minimumTopUpUsd: 5.0,
        suggestedTopUpUsd: 25.0,
        diemBalanceUsd: 50.0,
      }
      vi.mocked(veniceFetch).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockBalanceData,
        },
        status: 200,
        headers: {},
      })

      const result = await getX402Balance(validEvmAddress, sampleSiwxToken)
      expect(result).toEqual(mockBalanceData)
      expect(veniceFetch).toHaveBeenCalledWith(
        `/x402/balance/${encodeURIComponent(validEvmAddress)}`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'SIGN-IN-WITH-X': sampleSiwxToken,
          },
        }),
      )
    })
  })

  describe('getX402PaymentRequirements', () => {
    it('catches HTTP 402 with requirements body and returns accepted options', async () => {
      const mockRequirements = {
        x402Version: 2,
        accepts: [
          {
            network: 'base',
            chainId: 8453,
            asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            payTo: '0xVenicePaymentVaultAddress12345678901234',
            decimals: 6,
            minAmount: '5.00',
            maxAmount: '500.00',
          },
        ],
      }
      const err = createVeniceApiError('Payment required', 402, mockRequirements)
      vi.mocked(veniceFetch).mockRejectedValueOnce(err)

      const result = await getX402PaymentRequirements()
      expect(result).toEqual(mockRequirements)
    })

    it('returns data directly if 200 response is returned', async () => {
      const mockRequirements = {
        x402Version: 2,
        accepts: [],
      }
      vi.mocked(veniceFetch).mockResolvedValueOnce({
        data: mockRequirements,
        status: 200,
        headers: {},
      })

      const result = await getX402PaymentRequirements()
      expect(result).toEqual(mockRequirements)
    })

    it('rethrows non-402 API errors', async () => {
      const err = createVeniceApiError('Internal Server Error', 500)
      vi.mocked(veniceFetch).mockRejectedValueOnce(err)

      await expect(getX402PaymentRequirements()).rejects.toThrow('Internal Server Error')
    })
  })

  describe('submitX402TopUp', () => {
    it('rejects empty payment signature', async () => {
      await expect(submitX402TopUp('')).rejects.toThrow(/Payment signature is required/)
      expect(veniceFetch).not.toHaveBeenCalled()
    })

    it('submits payment signature with PAYMENT-SIGNATURE header', async () => {
      const mockTopUpData: X402TopUpData = {
        walletAddress: validEvmAddress,
        amountCredited: 25.0,
        newBalance: 175.5,
        paymentId: 'pay_xyz123',
      }
      vi.mocked(veniceFetch).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockTopUpData,
        },
        status: 200,
        headers: {
          'payment-response': 'sig_resp_xyz987',
        },
      })

      const result = await submitX402TopUp('sig_client_payload_123')
      expect(result.data).toEqual(mockTopUpData)
      expect(result.paymentResponseHeader).toBe('sig_resp_xyz987')
      expect(veniceFetch).toHaveBeenCalledWith('/x402/top-up', {
        method: 'POST',
        headers: {
          'PAYMENT-SIGNATURE': 'sig_client_payload_123',
        },
        body: {},
      })
    })
  })

  describe('getX402Transactions', () => {
    it('rejects invalid address or missing token', async () => {
      await expect(getX402Transactions('invalid', sampleSiwxToken)).rejects.toThrow(
        /Invalid EVM or Solana wallet address format/,
      )
      await expect(getX402Transactions(validEvmAddress, '')).rejects.toThrow(
        /Sign-in-with-x token is required/,
      )
    })

    it('fetches transactions with limit and offset query params', async () => {
      const mockTransactionsData: X402TransactionsData = {
        walletAddress: validEvmAddress,
        currentBalance: 175.5,
        transactions: [
          {
            id: 'tx_01',
            type: 'TOP_UP',
            amount: 50.0,
            balanceAfter: 175.5,
            createdAt: '2026-09-17T15:00:00Z',
            requestId: null,
            modelId: null,
          },
        ],
        pagination: {
          total: 1,
          limit: 10,
          offset: 0,
          hasMore: false,
        } as unknown as X402TransactionsData['pagination'],
      }
      vi.mocked(veniceFetch).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockTransactionsData,
        },
        status: 200,
        headers: {},
      })

      const result = await getX402Transactions(validEvmAddress, sampleSiwxToken, {
        limit: 10,
        offset: 0,
      })
      expect(result).toEqual(mockTransactionsData)
      expect(veniceFetch).toHaveBeenCalledWith(
        `/x402/transactions/${encodeURIComponent(validEvmAddress)}?limit=10&offset=0`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            'SIGN-IN-WITH-X': sampleSiwxToken,
          },
        }),
      )
    })
  })
})
