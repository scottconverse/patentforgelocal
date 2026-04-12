import { Test, TestingModule } from '@nestjs/testing';
import { FeasibilityService, STAGE_NAMES } from './feasibility.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('FeasibilityService.rerunFromStage', () => {
  let service: FeasibilityService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  let prisma: any;

  const mockStages = STAGE_NAMES.map((name, i) => ({
    id: `stage-${i + 1}`,
    stageNumber: i + 1,
    stageName: name,
    status: 'COMPLETE',
    outputText: `Output for stage ${i + 1}`,
    model: 'claude-sonnet-4-20250514',
    webSearchUsed: i === 1, // stage 2 uses web search
    startedAt: new Date('2026-03-30T10:00:00Z'),
    completedAt: new Date('2026-03-30T10:02:00Z'),
    inputTokens: 5000,
    outputTokens: 2000,
    estimatedCostUsd: 0.15,
  }));

  const mockLatestRun = {
    id: 'run-1',
    projectId: 'proj-1',
    version: 1,
    status: 'COMPLETE',
    stages: mockStages,
  };

  beforeEach(async () => {
    prisma = {
      feasibilityRun: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FeasibilityService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<FeasibilityService>(FeasibilityService);
  });

  it('creates a new run with incremented version', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(mockLatestRun);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    prisma.feasibilityRun.create.mockImplementation(async ({ data, include: _include }: any) => ({
      id: 'run-2',
      projectId: data.projectId,
      version: data.version,
      status: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stage mapping
      stages: data.stages.create.map((s: any, i: number) => ({ id: `new-stage-${i}`, ...s })),
    }));

    const result = await service.rerunFromStage('proj-1', 3);
    expect(result.version).toBe(2);
  });

  it('copies completed stages before fromStage', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(mockLatestRun);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    prisma.feasibilityRun.create.mockImplementation(async ({ data }: any) => ({
      id: 'run-2',
      projectId: data.projectId,
      version: data.version,
      status: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stage mapping
      stages: data.stages.create.map((s: any, i: number) => ({ id: `new-stage-${i}`, ...s })),
    }));

    const result = await service.rerunFromStage('proj-1', 3);

    // Stages 1 and 2 should be copied as COMPLETE
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion cast
    const stage1 = result.stages.find((s: any) => s.stageNumber === 1)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion cast
    const stage2 = result.stages.find((s: any) => s.stageNumber === 2)!;
    expect(stage1.status).toBe('COMPLETE');
    expect(stage1.outputText).toBe('Output for stage 1');
    expect(stage2.status).toBe('COMPLETE');
    expect(stage2.outputText).toBe('Output for stage 2');
    expect(stage2.webSearchUsed).toBe(true);
  });

  it('sets stages from fromStage onward to PENDING', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(mockLatestRun);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    prisma.feasibilityRun.create.mockImplementation(async ({ data }: any) => ({
      id: 'run-2',
      projectId: data.projectId,
      version: data.version,
      status: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stage mapping
      stages: data.stages.create.map((s: any, i: number) => ({ id: `new-stage-${i}`, ...s })),
    }));

    const result = await service.rerunFromStage('proj-1', 3);

    // Stages 3-6 should be PENDING
    for (let i = 3; i <= 6; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion cast
      const stage = result.stages.find((s: any) => s.stageNumber === i)!;
      expect(stage.status).toBe('PENDING');
      expect(stage.outputText).toBeUndefined();
    }
  });

  it('creates exactly 6 stages', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(mockLatestRun);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    prisma.feasibilityRun.create.mockImplementation(async ({ data }: any) => ({
      id: 'run-2',
      projectId: data.projectId,
      version: data.version,
      status: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stage mapping
      stages: data.stages.create.map((s: any, i: number) => ({ id: `new-stage-${i}`, ...s })),
    }));

    const result = await service.rerunFromStage('proj-1', 1);
    expect(result.stages).toHaveLength(6);
  });

  it('throws when fromStage is out of range', async () => {
    await expect(service.rerunFromStage('proj-1', 0)).rejects.toThrow('fromStage must be between 1 and 6');
    await expect(service.rerunFromStage('proj-1', 7)).rejects.toThrow('fromStage must be between 1 and 6');
  });

  it('throws when no prior run exists', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(null);
    await expect(service.rerunFromStage('proj-1', 3)).rejects.toThrow(NotFoundException);
  });

  it('throws when a prior stage is not complete', async () => {
    const incompleteRun = {
      ...mockLatestRun,
      stages: mockStages.map((s) => (s.stageNumber === 2 ? { ...s, status: 'ERROR', outputText: null } : s)),
    };
    prisma.feasibilityRun.findFirst.mockResolvedValue(incompleteRun);

    await expect(service.rerunFromStage('proj-1', 3)).rejects.toThrow(
      'Stage 2 must be complete before re-running from Stage 3',
    );
  });

  it('copies token counts and cost from prior stages', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(mockLatestRun);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    prisma.feasibilityRun.create.mockImplementation(async ({ data }: any) => ({
      id: 'run-2',
      projectId: data.projectId,
      version: data.version,
      status: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stage mapping
      stages: data.stages.create.map((s: any, i: number) => ({ id: `new-stage-${i}`, ...s })),
    }));

    const result = await service.rerunFromStage('proj-1', 4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertion cast
    const stage1 = result.stages.find((s: any) => s.stageNumber === 1)!;
    expect(stage1.inputTokens).toBe(5000);
    expect(stage1.outputTokens).toBe(2000);
    expect(stage1.estimatedCostUsd).toBe(0.15);
    expect(stage1.model).toBe('claude-sonnet-4-20250514');
  });

  it('re-running from stage 1 sets all stages to PENDING', async () => {
    prisma.feasibilityRun.findFirst.mockResolvedValue(mockLatestRun);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    prisma.feasibilityRun.create.mockImplementation(async ({ data }: any) => ({
      id: 'run-2',
      projectId: data.projectId,
      version: data.version,
      status: data.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stage mapping
      stages: data.stages.create.map((s: any, i: number) => ({ id: `new-stage-${i}`, ...s })),
    }));

    const result = await service.rerunFromStage('proj-1', 1);
    for (const stage of result.stages) {
      expect(stage.status).toBe('PENDING');
    }
  });
});
