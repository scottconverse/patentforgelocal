/**
 * Tests for ComplianceService -- ownership checks, validation, concurrency guards.
 */

import { NotFoundException, ConflictException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

// Mock fetch globally so the fire-and-forget IIFE in startCheck rejects
// immediately and predictably instead of hitting the network.
const mockFetch = jest.fn().mockRejectedValue(new Error('mocked fetch rejection'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- global mock requires any cast
global.fetch = mockFetch as any;

const mockPrisma = {
  complianceCheck: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  complianceResult: {
    create: jest.fn(),
  },
  claimDraft: {
    findFirst: jest.fn(),
  },
  feasibilityStage: { findMany: jest.fn() },
  feasibilityRun: { findFirst: jest.fn() },
  project: { findUnique: jest.fn() },
};

const mockSettings = {
  getSettings: jest.fn().mockResolvedValue({
    anthropicApiKey: 'test-key',
    defaultModel: 'claude-haiku-4-5-20251001',
    researchModel: '',
    maxTokens: 16000,
    costCapUsd: 0,
  }),
};

describe('ComplianceService', () => {
  let service: ComplianceService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset updateMany default for onModuleInit
    mockPrisma.complianceCheck.updateMany.mockResolvedValue({ count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mocks
    service = new ComplianceService(mockPrisma as any, mockSettings as any);
  });

  describe('onModuleInit', () => {
    it('marks stuck RUNNING checks as ERROR', async () => {
      mockPrisma.complianceCheck.updateMany.mockResolvedValue({ count: 2 });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await service.onModuleInit();

      expect(mockPrisma.complianceCheck.updateMany).toHaveBeenCalledWith({
        where: { status: 'RUNNING' },
        data: { status: 'ERROR', completedAt: expect.any(Date) },
      });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaned up 2 stuck RUNNING check(s)'));
      warnSpy.mockRestore();
    });

    it('does nothing when no stuck checks exist', async () => {
      mockPrisma.complianceCheck.updateMany.mockResolvedValue({ count: 0 });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await service.onModuleInit();

      expect(mockPrisma.complianceCheck.updateMany).toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('startCheck', () => {
    it('returns 404 when no completed claim draft exists', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'project-1',
        invention: { title: 'Test', description: 'Test' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue(null);

      await expect(service.startCheck('project-1')).rejects.toThrow(NotFoundException);
      await expect(service.startCheck('project-1')).rejects.toThrow(/No completed claim draft found/);
    });

    it('returns 404 when project does not exist', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.startCheck('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.startCheck('nonexistent')).rejects.toThrow(/not found/);
    });

    it('returns 409 when a check is already RUNNING', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'project-1',
        invention: { title: 'Test', description: 'Test' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        version: 1,
        status: 'COMPLETE',
        claims: [{ claimNumber: 1, claimType: 'independent', parentClaimNumber: null, text: 'A method...' }],
      });
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'check-1',
        status: 'RUNNING',
      });

      await expect(service.startCheck('project-1')).rejects.toThrow(ConflictException);
      await expect(service.startCheck('project-1')).rejects.toThrow(/already running/);
    });

    it('creates a ComplianceCheck record and returns it', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'project-1',
        invention: { title: 'Test', description: 'Test desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        version: 1,
        status: 'COMPLETE',
        claims: [{ claimNumber: 1, claimType: 'independent', parentClaimNumber: null, text: 'A method...' }],
      });
      // First findFirst: no running check (concurrency guard)
      // Second findFirst: last check for version numbering
      mockPrisma.complianceCheck.findFirst
        .mockResolvedValueOnce(null) // concurrency check
        .mockResolvedValueOnce(null); // version check

      mockPrisma.feasibilityStage.findMany.mockResolvedValue([]);
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue(null);
      mockPrisma.complianceCheck.create.mockResolvedValue({
        id: 'new-check',
        version: 1,
        status: 'RUNNING',
        draftVersion: 1,
      });

      // Suppress expected console.error from the fire-and-forget IIFE
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await service.startCheck('project-1');
      expect(result.id).toBe('new-check');
      expect(result.version).toBe(1);
      expect(result.status).toBe('RUNNING');

      // Let the fire-and-forget pipeline IIFE settle
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));

      errorSpy.mockRestore();
    });
  });

  describe('getLatest', () => {
    it('returns the latest ComplianceCheck with results', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'check-1',
        version: 2,
        status: 'COMPLETE',
        overallPass: true,
        results: [{ rule: '35 USC 101', status: 'PASS', detail: 'Eligible subject matter' }],
      });

      const result = await service.getLatest('project-1');
      expect(result.status).toBe('COMPLETE');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing mock return shape
      expect((result as any).id).toBe('check-1');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).version).toBe(2);
      expect(result.results).toHaveLength(1);
      expect(mockPrisma.complianceCheck.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        orderBy: { version: 'desc' },
        include: { results: true },
      });
    });

    it('returns { status: NONE, results: [] } when no checks exist', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue(null);

      const result = await service.getLatest('project-1');
      expect(result).toEqual({ status: 'NONE', results: [] });
    });
  });

  describe('getByVersion', () => {
    it('returns specific version with results', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'check-1',
        version: 3,
        status: 'COMPLETE',
        results: [],
      });

      const result = await service.getByVersion('project-1', 3);
      expect(result.version).toBe(3);
      expect(mockPrisma.complianceCheck.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'project-1', version: 3 },
        include: { results: true },
      });
    });

    it('returns 404 for nonexistent version', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue(null);

      await expect(service.getByVersion('project-1', 99)).rejects.toThrow(NotFoundException);
      await expect(service.getByVersion('project-1', 99)).rejects.toThrow(/version 99 not found/);
    });
  });
});
