/**
 * Unit tests for budget rules and helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeCommitted, canCommit, canCommitOrganization } from './budget';
import { db } from '../db';
import { Decimal } from '@prisma/client/runtime/library';

// Mock database
vi.mock('../db', () => ({
  db: {
    stream: {
      findMany: vi.fn(),
    },
    departmentMember: {
      findMany: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
    },
    departmentBudget: {
      findMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
    },
  },
}));

describe('Budget Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeCommitted', () => {
    it('should compute total committed for active streams', async () => {
      vi.mocked(db.stream.findMany).mockResolvedValue([
        {
          totalAmount: new Decimal('1000000'),
        },
        {
          totalAmount: new Decimal('500000'),
        },
      ]);

      const result = await computeCommitted('org-1', 'token-1');

      expect(result).toBe('1500000');
      expect(db.stream.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          tokenMint: 'token-1',
          status: {
            in: ['ACTIVE', 'PAUSED'],
          },
        },
        select: {
          totalAmount: true,
        },
      });
    });

    it('should return 0 when no streams exist', async () => {
      vi.mocked(db.stream.findMany).mockResolvedValue([]);

      const result = await computeCommitted('org-1', 'token-1');

      expect(result).toBe('0');
    });
  });

  describe('canCommit', () => {
    it('should allow commit when within budget', async () => {
      vi.mocked(db.departmentBudget.findMany).mockResolvedValue([
        {
          budget: {
            capAmount: new Decimal('1000000'),
          },
        },
      ]);

      vi.mocked(db.departmentMember.findMany).mockResolvedValue([
        { userId: 'user-1' },
      ]);

      vi.mocked(db.employee.findMany).mockResolvedValue([
        { id: 'emp-1' },
      ]);

      vi.mocked(db.stream.findMany).mockResolvedValue([
        {
          totalAmount: new Decimal('500000'),
        },
      ]);

      const result = await canCommit('org-1', 'dept-1', 'token-1', '200000');

      expect(result.canCommit).toBe(true);
      expect(result.currentCommitted).toBe('500000');
      expect(result.cap).toBe('1000000');
      expect(parseFloat(result.available)).toBeGreaterThan(0);
    });

    it('should deny commit when exceeding budget', async () => {
      vi.mocked(db.departmentBudget.findMany).mockResolvedValue([
        {
          budget: {
            capAmount: new Decimal('1000000'),
          },
        },
      ]);

      vi.mocked(db.departmentMember.findMany).mockResolvedValue([
        { userId: 'user-1' },
      ]);

      vi.mocked(db.employee.findMany).mockResolvedValue([
        { id: 'emp-1' },
      ]);

      vi.mocked(db.stream.findMany).mockResolvedValue([
        {
          totalAmount: new Decimal('800000'),
        },
      ]);

      const result = await canCommit('org-1', 'dept-1', 'token-1', '300000');

      expect(result.canCommit).toBe(false);
      expect(result.reason).toContain('exceed');
      expect(result.currentCommitted).toBe('800000');
      expect(result.cap).toBe('1000000');
    });

    it('should allow commit when no budget is set', async () => {
      vi.mocked(db.departmentBudget.findMany).mockResolvedValue([]);

      const result = await canCommit('org-1', 'dept-1', 'token-1', '1000000');

      expect(result.canCommit).toBe(true);
      expect(result.reason).toContain('No budget set');
    });
  });

  describe('canCommitOrganization', () => {
    it('should allow commit when within organization budget', async () => {
      vi.mocked(db.budget.findMany).mockResolvedValue([
        {
          capAmount: new Decimal('5000000'),
        },
      ]);

      vi.mocked(db.stream.findMany).mockResolvedValue([
        {
          totalAmount: new Decimal('2000000'),
        },
      ]);

      const result = await canCommitOrganization('org-1', 'token-1', '1000000');

      expect(result.canCommit).toBe(true);
      expect(result.currentCommitted).toBe('2000000');
      expect(result.cap).toBe('5000000');
    });

    it('should deny commit when exceeding organization budget', async () => {
      vi.mocked(db.budget.findMany).mockResolvedValue([
        {
          capAmount: new Decimal('5000000'),
        },
      ]);

      vi.mocked(db.stream.findMany).mockResolvedValue([
        {
          totalAmount: new Decimal('4500000'),
        },
      ]);

      const result = await canCommitOrganization('org-1', 'token-1', '600000');

      expect(result.canCommit).toBe(false);
      expect(result.reason).toContain('exceed');
    });
  });
});


