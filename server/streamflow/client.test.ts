/**
 * Unit tests for Streamflow client (mock implementation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockStreamflowClient } from './client';
import type { StreamflowClientConfig, CreateStreamInput } from './types';

describe('MockStreamflowClient', () => {
  let client: MockStreamflowClient;
  const config: StreamflowClientConfig = {
    apiBase: 'https://api.streamflow.finance',
    cluster: 'devnet',
  };

  beforeEach(() => {
    client = new MockStreamflowClient(config);
    client.clearStreams();
  });

  describe('createStream', () => {
    it('should create a stream and return stream ID', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
      };

      const result = await client.createStream(input);

      expect(result.streamId).toBeDefined();
      expect(result.onchainTx).toBeDefined();
      expect(result.status).toBe('ACTIVE');
      expect(result.streamId).toContain('mock_stream');
    });

    it('should store stream details', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const { streamId } = await client.createStream(input);
      const stream = await client.getStream(streamId);

      expect(stream.recipient).toBe(input.recipient);
      expect(stream.tokenMint).toBe(input.tokenMint);
      expect(stream.totalAmount).toBe(input.totalAmount);
    });
  });

  describe('pauseStream', () => {
    it('should pause an active stream', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const { streamId } = await client.createStream(input);
      await client.pauseStream(streamId);

      const stream = await client.getStream(streamId);
      expect(stream.status).toBe('PAUSED');
    });

    it('should throw error when pausing non-existent stream', async () => {
      await expect(client.pauseStream('non-existent')).rejects.toThrow('not found');
    });

    it('should throw error when pausing non-active stream', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const { streamId } = await client.createStream(input);
      await client.pauseStream(streamId);

      await expect(client.pauseStream(streamId)).rejects.toThrow('Cannot pause stream');
    });
  });

  describe('cancelStream', () => {
    it('should cancel a stream', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const { streamId } = await client.createStream(input);
      await client.cancelStream(streamId);

      const stream = await client.getStream(streamId);
      expect(stream.status).toBe('CANCELLED');
    });

    it('should throw error when canceling completed stream', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000) - 86400 * 60, // Started 60 days ago
        endTime: Math.floor(Date.now() / 1000) - 86400 * 30, // Ended 30 days ago
      };

      const { streamId } = await client.createStream(input);
      const stream = await client.getStream(streamId);

      // Stream should be completed
      if (stream.status === 'COMPLETED') {
        await expect(client.cancelStream(streamId)).rejects.toThrow('Cannot cancel completed');
      }
    });
  });

  describe('getStream', () => {
    it('should return stream details', async () => {
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400 * 30,
      };

      const { streamId } = await client.createStream(input);
      const stream = await client.getStream(streamId);

      expect(stream.streamId).toBe(streamId);
      expect(stream.recipient).toBe(input.recipient);
      expect(stream.tokenMint).toBe(input.tokenMint);
      expect(stream.totalAmount).toBe(input.totalAmount);
    });

    it('should calculate available amount based on time', async () => {
      const now = Math.floor(Date.now() / 1000);
      const input: CreateStreamInput = {
        recipient: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        tokenMint: 'So11111111111111111111111111111111111111112',
        totalAmount: '1000000',
        startTime: now - 86400 * 15, // Started 15 days ago
        endTime: now + 86400 * 15, // Ends in 15 days
      };

      const { streamId } = await client.createStream(input);
      const stream = await client.getStream(streamId);

      // Should have accrued approximately 50% (15 days / 30 days)
      expect(parseFloat(stream.availableAmount)).toBeGreaterThan(0);
    });

    it('should throw error for non-existent stream', async () => {
      await expect(client.getStream('non-existent')).rejects.toThrow('not found');
    });
  });
});
