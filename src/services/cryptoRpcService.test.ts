// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Unit tests for cryptoRpcService: slug validation, JSON-RPC schema, read tools, and guarded write relay. */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateNetworkSlug,
  validateIdempotencyKey,
  generateIdempotencyKey,
  validateJsonRpcRequest,
  validateJsonRpcBatch,
  getCryptoRpcNetworks,
  sendJsonRpcRequest,
  sendJsonRpcBatch,
  rpcGetBlockNumber,
  rpcGetBalance,
  rpcCall,
  rpcGetTransactionReceipt,
  rpcGetChainId,
  rpcGetLogs,
  rpcSolanaGetBalance,
  rpcSolanaGetAccountInfo,
  rpcSendRawTransaction,
} from './cryptoRpcService'
import { veniceFetch } from './veniceClient/fetch'
import type { JsonRpcRequest } from '../types/cryptoRpc'

function mockFetchResponse<T>(data: T, headers: Record<string, string> = {}) {
  return {
    data,
    headers,
    response: {} as Response,
    diagnostics: {},
  } as any
}

vi.mock('./veniceClient/fetch', () => ({
  veniceFetch: vi.fn(),
}))

describe('cryptoRpcService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateNetworkSlug', () => {
    it('accepts valid network slugs', () => {
      expect(validateNetworkSlug('ethereum-mainnet')).toBe(true)
      expect(validateNetworkSlug('base-sepolia')).toBe(true)
      expect(validateNetworkSlug('solana-mainnet')).toBe(true)
      expect(validateNetworkSlug('arbitrum-one')).toBe(true)
    })

    it('rejects invalid or malformed network slugs', () => {
      expect(validateNetworkSlug('')).toBe(false)
      expect(validateNetworkSlug('Ethereum-Mainnet')).toBe(false)
      expect(validateNetworkSlug('has.dot')).toBe(false)
      expect(validateNetworkSlug('has_underscore')).toBe(false)
      expect(validateNetworkSlug('a'.repeat(65))).toBe(false)
      expect(validateNetworkSlug(null as unknown as string)).toBe(false)
    })
  })

  describe('validateIdempotencyKey and generateIdempotencyKey', () => {
    it('validates idempotency key format', () => {
      expect(validateIdempotencyKey('tx-12345-abcde')).toBe(true)
      expect(validateIdempotencyKey('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
      expect(validateIdempotencyKey('')).toBe(false)
      expect(validateIdempotencyKey('has spaces')).toBe(false)
      expect(validateIdempotencyKey('has@special!')).toBe(false)
    })

    it('generates a valid idempotency key', () => {
      const key = generateIdempotencyKey('test')
      expect(validateIdempotencyKey(key)).toBe(true)
      expect(key.startsWith('test-')).toBe(true)
    })
  })

  describe('validateJsonRpcRequest', () => {
    it('accepts standard JSON-RPC 2.0 requests', () => {
      expect(() =>
        validateJsonRpcRequest({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      ).not.toThrow()
    })

    it('rejects invalid jsonrpc protocol versions', () => {
      expect(() =>
        validateJsonRpcRequest({
          jsonrpc: '1.0' as unknown as '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      ).toThrow(/version/i)
    })

    it('rejects empty or oversized method names', () => {
      expect(() =>
        validateJsonRpcRequest({
          jsonrpc: '2.0',
          method: '',
          id: 1,
        }),
      ).toThrow(/method/i)

      expect(() =>
        validateJsonRpcRequest({
          jsonrpc: '2.0',
          method: 'a'.repeat(129),
          id: 1,
        }),
      ).toThrow(/too long/i)
    })

    it('rejects unsupported stateful filter methods', () => {
      expect(() =>
        validateJsonRpcRequest({
          jsonrpc: '2.0',
          method: 'eth_newFilter',
          params: [{}],
          id: 1,
        }),
      ).toThrow(/load-balanced proxy.*eth_getLogs/i)
    })

    it('rejects unsupported WebSocket subscription methods', () => {
      expect(() =>
        validateJsonRpcRequest({
          jsonrpc: '2.0',
          method: 'eth_subscribe',
          params: ['newHeads'],
          id: 1,
        }),
      ).toThrow(/WebSocket.*HTTP-only/i)
    })
  })

  describe('validateJsonRpcBatch', () => {
    it('validates a correct batch of requests', () => {
      const batch: JsonRpcRequest[] = [
        { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
        { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 2 },
      ]
      expect(() => validateJsonRpcBatch(batch)).not.toThrow()
    })

    it('rejects empty batches or batches exceeding 100 items', () => {
      expect(() => validateJsonRpcBatch([])).toThrow(/empty/i)

      const hugeBatch: JsonRpcRequest[] = Array.from({ length: 101 }, (_, i) => ({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: i,
      }))
      expect(() => validateJsonRpcBatch(hugeBatch)).toThrow(/maximum allowed size of 100/i)
    })
  })

  describe('getCryptoRpcNetworks', () => {
    it('fetches supported networks list from public endpoint', async () => {
      const mockNetworks = ['arbitrum-mainnet', 'base-mainnet', 'ethereum-mainnet', 'solana-mainnet']
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ networks: mockNetworks }),
      )

      const result = await getCryptoRpcNetworks()
      expect(result).toEqual(mockNetworks)
      expect(veniceFetch).toHaveBeenCalledWith('/crypto/rpc/networks', {
        method: 'GET',
      })
    })
  })

  describe('sendJsonRpcRequest and sendJsonRpcBatch', () => {
    it('sends single request with Idempotency-Key and SIGN-IN-WITH-X headers', async () => {
      const mockResponse = {
        jsonrpc: '2.0' as const,
        id: 1,
        result: '0x10d4f',
      }
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse(mockResponse),
      )

      const req: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }

      const result = await sendJsonRpcRequest('ethereum-mainnet', req, {
        idempotencyKey: 'idemp-12345',
        siwxToken: 'siwx_auth_payload',
      })

      expect(result).toEqual(mockResponse)
      expect(veniceFetch).toHaveBeenCalledWith(
        '/crypto/rpc/ethereum-mainnet',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': 'idemp-12345',
            'SIGN-IN-WITH-X': 'siwx_auth_payload',
          }),
          body: req,
        }),
      )
    })

    it('rejects invalid network slugs before making requests', async () => {
      await expect(
        sendJsonRpcRequest('INVALID-SLUG', {
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      ).rejects.toThrow(/Invalid network slug/)
      expect(veniceFetch).not.toHaveBeenCalled()
    })

    it('sends batch requests', async () => {
      const mockResponses = [
        { jsonrpc: '2.0' as const, id: 1, result: '0x10d4f' },
        { jsonrpc: '2.0' as const, id: 2, result: '0x1' },
      ]
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse(mockResponses),
      )

      const batch: JsonRpcRequest[] = [
        { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
        { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 2 },
      ]

      const result = await sendJsonRpcBatch('base-mainnet', batch)
      expect(result).toEqual(mockResponses)
      expect(veniceFetch).toHaveBeenCalledWith(
        '/crypto/rpc/base-mainnet',
        expect.objectContaining({
          method: 'POST',
          body: batch,
        }),
      )
    })
  })

  describe('High-Level Read Tools', () => {
    it('rpcGetBlockNumber returns hex string', async () => {
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: '0x12a3b' }),
      )
      const block = await rpcGetBlockNumber('base-mainnet')
      expect(block).toBe('0x12a3b')
    })

    it('rpcGetBalance returns balance hex', async () => {
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' }),
      )
      const balance = await rpcGetBalance('ethereum-mainnet', '0x1234567890123456789012345678901234567890')
      expect(balance).toBe('0xde0b6b3a7640000')
    })

    it('rpcCall returns hex execution result', async () => {
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' }),
      )
      const res = await rpcCall('ethereum-mainnet', {
        to: '0x1234567890123456789012345678901234567890',
        data: '0x70a08231',
      })
      expect(res).toBe('0x0000000000000000000000000000000000000000000000000de0b6b3a7640000')
    })

    it('rpcGetTransactionReceipt returns receipt record', async () => {
      const mockReceipt = { status: '0x1', blockNumber: '0x100', transactionHash: '0xabc' }
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: mockReceipt }),
      )
      const receipt = await rpcGetTransactionReceipt('ethereum-mainnet', '0xabc')
      expect(receipt).toEqual(mockReceipt)
    })

    it('rpcGetChainId returns chain id hex', async () => {
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: '0x2105' }), // 8453 for Base
      )
      const chainId = await rpcGetChainId('base-mainnet')
      expect(chainId).toBe('0x2105')
    })

    it('rpcGetLogs queries event logs', async () => {
      const mockLogs = [{ address: '0x123', topics: ['0xabc'], data: '0x0' }]
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: mockLogs }),
      )
      const logs = await rpcGetLogs('base-mainnet', {
        address: '0x123',
        fromBlock: 'latest',
      })
      expect(logs).toEqual(mockLogs)
    })

    it('rpcSolanaGetBalance returns lamports number', async () => {
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: { value: 5000000000 } }),
      )
      const lamports = await rpcSolanaGetBalance('solana-mainnet', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
      expect(lamports).toBe(5000000000)
    })

    it('rpcSolanaGetAccountInfo returns account info record', async () => {
      const mockAccount = { lamports: 1000, data: ['base64payload', 'base64'], owner: '111111' }
      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: { value: mockAccount } }),
      )
      const account = await rpcSolanaGetAccountInfo('solana-mainnet', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
      expect(account).toEqual(mockAccount)
    })
  })

  describe('Guarded Write Relay (rpcSendRawTransaction)', () => {
    it('throws error when user confirmation is not provided', async () => {
      await expect(
        rpcSendRawTransaction(
          'base-mainnet',
          '0x02f870822105...',
          { confirmedByUser: false },
        ),
      ).rejects.toThrow(/explicit user confirmation/i)
      expect(veniceFetch).not.toHaveBeenCalled()
    })

    it('throws error when transaction payload format is invalid', async () => {
      await expect(
        rpcSendRawTransaction(
          'base-mainnet',
          'not-a-valid-signed-tx',
          { confirmedByUser: true },
        ),
      ).rejects.toThrow(/signed transaction must be a hex string/i)
      expect(veniceFetch).not.toHaveBeenCalled()
    })

    it('relays valid signed EVM transaction with idempotency key', async () => {
      const validTxHex = '0x02f87082210515843b9aca008502540be40082520894'
      const mockTxHash = '0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef'

      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: mockTxHash }),
      )

      const result = await rpcSendRawTransaction('base-mainnet', validTxHex, {
        confirmedByUser: true,
        idempotencyKey: 'tx-custom-idemp-1',
      })

      expect(result).toBe(mockTxHash)
      expect(veniceFetch).toHaveBeenCalledWith(
        '/crypto/rpc/base-mainnet',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': 'tx-custom-idemp-1',
          }),
          body: {
            jsonrpc: '2.0',
            method: 'eth_sendRawTransaction',
            params: [validTxHex],
            id: 1,
          },
        }),
      )
    })

    it('uses sendTransaction for Solana networks', async () => {
      const validSolanaTx = 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      const mockSignature = '5K9Y...signature'

      vi.mocked(veniceFetch).mockResolvedValueOnce(
        mockFetchResponse({ jsonrpc: '2.0', id: 1, result: mockSignature }),
      )

      const result = await rpcSendRawTransaction('solana-mainnet', validSolanaTx, {
        confirmedByUser: true,
      })

      expect(result).toBe(mockSignature)
      expect(veniceFetch).toHaveBeenCalledWith(
        '/crypto/rpc/solana-mainnet',
        expect.objectContaining({
          body: expect.objectContaining({
            method: 'sendTransaction',
          }),
        }),
      )
    })
  })
})
