/**
 * Tests for server-side invention description minimum word count enforcement.
 * Covers:
 * 1. countWords utility function
 * 2. getInventionDescription service method
 * 3. startRun pre-flight description length check in controller
 */

import { BadRequestException } from '@nestjs/common';
import { FeasibilityService } from './feasibility.service';
import { FeasibilityController } from './feasibility.controller';
import { countWords } from '../utils/word-count';

// Mock PrismaService
const mockPrisma = {
  inventionInput: {
    findUnique: jest.fn(),
  },
  feasibilityStage: {
    findMany: jest.fn(),
  },
  feasibilityRun: {
    count: jest.fn(),
    create: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  complianceCheck: {
    findMany: jest.fn(),
  },
  patentApplication: {
    findMany: jest.fn(),
  },
  claimDraft: {
    findMany: jest.fn(),
  },
};

// Mock SettingsService
const mockSettings = {
  getSettings: jest.fn(),
};

// Mock PriorArtService
const mockPriorArt = {
  startSearch: jest.fn(),
};

describe('Invention Description Minimum Enforcement', () => {
  let service: FeasibilityService;
  let controller: FeasibilityController;

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    service = new FeasibilityService(mockPrisma as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mocks
    controller = new FeasibilityController(service, mockSettings as any, mockPriorArt as any);
  });

  // ─── Utility: countWords ───────────────────────────────────────────

  describe('countWords', () => {
    it('counts words in a normal sentence', () => {
      expect(countWords('hello world foo bar')).toBe(4);
    });

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
      expect(countWords('   \t\n  ')).toBe(0);
    });

    it('handles multiple spaces between words', () => {
      expect(countWords('one   two    three')).toBe(3);
    });

    it('handles leading and trailing whitespace', () => {
      expect(countWords('  hello world  ')).toBe(2);
    });

    it('counts exactly 50 words', () => {
      const fiftyWords = Array(50).fill('word').join(' ');
      expect(countWords(fiftyWords)).toBe(50);
    });

    it('counts 49 words correctly', () => {
      const fortyNine = Array(49).fill('word').join(' ');
      expect(countWords(fortyNine)).toBe(49);
    });
  });

  // ─── Service: getInventionDescription ──────────────────────────────

  describe('getInventionDescription', () => {
    it('returns the description when invention exists', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: 'A detailed invention description',
      });
      const result = await service.getInventionDescription('p1');
      expect(result).toBe('A detailed invention description');
      expect(mockPrisma.inventionInput.findUnique).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
        select: { description: true },
      });
    });

    it('returns null when no invention exists', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue(null);
      const result = await service.getInventionDescription('p1');
      expect(result).toBeNull();
    });
  });

  // ─── Controller: startRun description check ────────────────────────

  describe('startRun description minimum enforcement', () => {
    const fiftyWords = Array(50).fill('word').join(' ');
    const fortyNineWords = Array(49).fill('word').join(' ');

    it('blocks run when description has fewer than 50 words', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: 'Too short description',
      });

      await expect(controller.startRun('p1', {})).rejects.toThrow(BadRequestException);
      await expect(controller.startRun('p1', {})).rejects.toThrow(
        /Invention description must be at least 50 words/,
      );
    });

    it('includes current word count in error message', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: 'one two three',
      });

      await expect(controller.startRun('p1', {})).rejects.toThrow(
        /Current word count: 3/,
      );
    });

    it('blocks run when no invention input exists', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue(null);

      await expect(controller.startRun('p1', {})).rejects.toThrow(BadRequestException);
      await expect(controller.startRun('p1', {})).rejects.toThrow(
        /Current word count: 0/,
      );
    });

    it('blocks run when description is exactly 49 words', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: fortyNineWords,
      });

      await expect(controller.startRun('p1', {})).rejects.toThrow(BadRequestException);
      await expect(controller.startRun('p1', {})).rejects.toThrow(
        /Current word count: 49/,
      );
    });

    it('allows run when description is exactly 50 words', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: fiftyWords,
      });
      mockSettings.getSettings.mockResolvedValue({
        costCapUsd: 0,
        anthropicApiKey: 'key',
      });
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
      mockPrisma.feasibilityRun.count.mockResolvedValue(0);
      mockPrisma.feasibilityRun.create.mockResolvedValue({
        id: 'run-1',
        version: 1,
        status: 'PENDING',
        stages: [],
      });
      mockPrisma.project.update.mockResolvedValue({});

      const result = await controller.startRun('p1', {});
      expect(result).toBeDefined();
      expect(result.id).toBe('run-1');
    });

    it('allows run when description exceeds 50 words', async () => {
      const manyWords = Array(100).fill('word').join(' ');
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: manyWords,
      });
      mockSettings.getSettings.mockResolvedValue({
        costCapUsd: 0,
        anthropicApiKey: 'key',
      });
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
      mockPrisma.feasibilityRun.count.mockResolvedValue(0);
      mockPrisma.feasibilityRun.create.mockResolvedValue({
        id: 'run-1',
        version: 1,
        status: 'PENDING',
        stages: [],
      });
      mockPrisma.project.update.mockResolvedValue({});

      const result = await controller.startRun('p1', {});
      expect(result).toBeDefined();
      expect(result.id).toBe('run-1');
    });

    it('checks description before cost cap', async () => {
      // Description too short — should fail before cost cap is checked
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: 'short',
      });

      await expect(controller.startRun('p1', {})).rejects.toThrow(
        /Invention description must be at least 50 words/,
      );

      // Settings should never have been fetched (description check comes first)
      expect(mockSettings.getSettings).not.toHaveBeenCalled();
    });

    it('blocks run when description is empty string', async () => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({
        description: '',
      });

      await expect(controller.startRun('p1', {})).rejects.toThrow(BadRequestException);
      await expect(controller.startRun('p1', {})).rejects.toThrow(
        /Current word count: 0/,
      );
    });
  });
});
