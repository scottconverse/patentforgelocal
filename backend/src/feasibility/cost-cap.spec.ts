/**
 * Tests for server-side cost cap enforcement.
 * Covers:
 * 1. Cumulative cost calculation (service layer)
 * 2. Pre-flight cost cap check in controller (integration)
 * 3. Mid-pipeline cost cap check in patchStage (integration)
 */

import { BadRequestException } from '@nestjs/common';
import { FeasibilityService } from './feasibility.service';
import { FeasibilityController } from './feasibility.controller';

// Mock PrismaService
const mockPrisma = {
  feasibilityStage: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  feasibilityRun: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
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
  inventionInput: {
    findUnique: jest.fn(),
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

describe('Cost Cap Enforcement', () => {
  let service: FeasibilityService;
  let controller: FeasibilityController;

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    service = new FeasibilityService(mockPrisma as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mocks
    controller = new FeasibilityController(service, mockSettings as any, mockPriorArt as any);
  });

  // ─── Service: getProjectCumulativeCost ──────────────────────────────

  describe('getProjectCumulativeCost', () => {
    it('returns 0 when no stages have cost data', async () => {
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);
      expect(await service.getProjectCumulativeCost('p1')).toBe(0);
    });

    it('sums estimatedCostUsd across all stages', async () => {
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([
        { estimatedCostUsd: 0.5 },
        { estimatedCostUsd: 0.75 },
        { estimatedCostUsd: 0.25 },
        { estimatedCostUsd: 1.0 },
      ]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);
      expect(await service.getProjectCumulativeCost('p1')).toBe(2.5);
    });

    it('handles null estimatedCostUsd values', async () => {
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([
        { estimatedCostUsd: 0.5 },
        { estimatedCostUsd: null },
        { estimatedCostUsd: 1.0 },
      ]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);
      expect(await service.getProjectCumulativeCost('p1')).toBe(1.5);
    });

    it('aggregates costs across all pipelines (feasibility + compliance + application + claim-draft)', async () => {
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([{ estimatedCostUsd: 1.0 }, { estimatedCostUsd: 0.5 }]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([{ estimatedCostUsd: 0.75 }]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([{ estimatedCostUsd: 2.0 }]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([{ estimatedCostUsd: 0.30 }]);
      expect(await service.getProjectCumulativeCost('p1')).toBeCloseTo(4.55);
    });
  });

  // ─── Controller: startRun pre-flight check ──────────────────────────

  describe('startRun cost cap enforcement', () => {
    // All startRun tests need a valid invention description (>= 50 words)
    const validDescription = Array(50).fill('word').join(' ');

    beforeEach(() => {
      mockPrisma.inventionInput.findUnique.mockResolvedValue({ description: validDescription });
    });

    it('blocks run when cumulative cost exceeds cap', async () => {
      mockSettings.getSettings.mockResolvedValue({
        costCapUsd: 5.0,
        anthropicApiKey: 'key',
      });
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([{ estimatedCostUsd: 3.0 }, { estimatedCostUsd: 2.5 }]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);

      await expect(controller.startRun('p1', {})).rejects.toThrow(BadRequestException);
      await expect(controller.startRun('p1', {})).rejects.toThrow(/Cost cap exceeded/);
    });

    it('allows run when cost is under cap', async () => {
      mockSettings.getSettings.mockResolvedValue({
        costCapUsd: 10.0,
        anthropicApiKey: 'key',
      });
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([{ estimatedCostUsd: 1.0 }]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);
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

    it('skips check when costCapUsd is 0 (disabled)', async () => {
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

      // Should NOT call getProjectCumulativeCost
      const result = await controller.startRun('p1', {});
      expect(result).toBeDefined();
      expect(mockPrisma.feasibilityStage.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── Controller: patchStage mid-pipeline check ──────────────────────

  describe('patchStage cost cap check', () => {
    it('returns costCapExceeded=true when cap is breached after stage', async () => {
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({ id: 'run-1' });
      mockPrisma.feasibilityRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        finalReport: null,
        stages: [],
      });
      mockPrisma.feasibilityStage.findFirst.mockResolvedValue({ id: 'stage-1' });
      mockPrisma.feasibilityStage.update.mockResolvedValue({ id: 'stage-1', stageNumber: 3 });
      mockSettings.getSettings.mockResolvedValue({ costCapUsd: 2.0 });
      // After this stage, cumulative cost is $3.00 which exceeds $2.00 cap
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([
        { estimatedCostUsd: 1.5 },
        { estimatedCostUsd: 1.0 },
        { estimatedCostUsd: 0.5 },
      ]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);

      const result = await controller.patchStage('p1', 3, {
        status: 'COMPLETE',
        estimatedCostUsd: 0.5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial DTO
      } as any);

      expect(result.costCapExceeded).toBe(true);
      expect(result.cumulativeCost).toBe(3.0);
      expect(result.costCapUsd).toBe(2.0);
    });

    it('returns costCapExceeded=false when under cap', async () => {
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({ id: 'run-1' });
      mockPrisma.feasibilityRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        finalReport: null,
        stages: [],
      });
      mockPrisma.feasibilityStage.findFirst.mockResolvedValue({ id: 'stage-1' });
      mockPrisma.feasibilityStage.update.mockResolvedValue({ id: 'stage-1', stageNumber: 1 });
      mockSettings.getSettings.mockResolvedValue({ costCapUsd: 10.0 });
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([{ estimatedCostUsd: 0.5 }]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.findMany.mockResolvedValue([]);

      const result = await controller.patchStage('p1', 1, {
        status: 'COMPLETE',
        estimatedCostUsd: 0.5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial DTO
      } as any);

      expect(result.costCapExceeded).toBe(false);
    });

    it('skips cost check when no cost data in patch', async () => {
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({ id: 'run-1' });
      mockPrisma.feasibilityStage.findFirst.mockResolvedValue({ id: 'stage-1' });
      mockPrisma.feasibilityStage.update.mockResolvedValue({ id: 'stage-1', stageNumber: 1 });

      const result = await controller.patchStage('p1', 1, {
        status: 'RUNNING',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial DTO
      } as any);

      // No cost data → no settings lookup needed
      expect(result.costCapExceeded).toBe(false);
      expect(mockSettings.getSettings).not.toHaveBeenCalled();
    });
  });
});
