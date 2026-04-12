/**
 * Tests for ComplianceService stream helper methods: prepareCheck, saveStreamComplete, markCheckError.
 * Tests for ComplianceController streamCheck SSE endpoint.
 */

import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';

// Mock fetch globally
const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = mockFetch as any;

const makePrisma = () => ({
  complianceCheck: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  complianceResult: { create: jest.fn() },
  claimDraft: { findFirst: jest.fn() },
  feasibilityStage: { findMany: jest.fn().mockResolvedValue([]) },
  feasibilityRun: { findFirst: jest.fn() },
  project: { findUnique: jest.fn() },
  patentApplication: { findMany: jest.fn().mockResolvedValue([]) },
});

const makeSettings = () => ({
  getSettings: jest.fn().mockResolvedValue({
    anthropicApiKey: 'test-key',
    defaultModel: 'claude-haiku-4-5-20251001',
    researchModel: '',
    maxTokens: 16000,
    costCapUsd: 0,
  }),
});

describe('ComplianceService — stream helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: ComplianceService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSettings: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makePrisma();
    mockSettings = makeSettings();
    service = new ComplianceService(mockPrisma, mockSettings);
  });

  describe('prepareCheck', () => {
    it('throws NotFoundException when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      await expect(service.prepareCheck('p1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no completed claims', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Test', description: 'Desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue(null);
      await expect(service.prepareCheck('p1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when check already RUNNING', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Test', description: 'Desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'd1',
        version: 1,
        status: 'COMPLETE',
        claims: [{ claimNumber: 1, claimType: 'INDEPENDENT', parentClaimNumber: null, text: 'A method...' }],
      });
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({ id: 'c1', status: 'RUNNING' });
      await expect(service.prepareCheck('p1')).rejects.toThrow(ConflictException);
    });

    it('returns checkId and requestBody when valid', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Widget', description: 'A widget' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'd1',
        version: 1,
        status: 'COMPLETE',
        claims: [{ claimNumber: 1, claimType: 'INDEPENDENT', parentClaimNumber: null, text: 'A method...' }],
      });
      mockPrisma.complianceCheck.findFirst
        .mockResolvedValueOnce(null) // concurrency check
        .mockResolvedValueOnce(null); // version check
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({
        stages: [{ stageNumber: 1, outputText: 'Stage 1' }],
      });
      mockPrisma.complianceCheck.create.mockResolvedValue({ id: 'new-check', version: 1 });

      const result = await service.prepareCheck('p1');

      expect(result.checkId).toBe('new-check');
      expect(result.requestBody.claims).toHaveLength(1);
      expect(result.requestBody.settings.api_key).toBe('test-key');
      expect(result.requestBody.specification_text).toBe('Stage 1');
    });

    it('throws BadRequestException when cost cap exceeded', async () => {
      mockSettings.getSettings.mockResolvedValue({
        anthropicApiKey: 'test-key',
        defaultModel: 'claude-haiku-4-5-20251001',
        researchModel: '',
        maxTokens: 16000,
        costCapUsd: 1.0,
      });
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Test', description: 'Desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'd1',
        version: 1,
        status: 'COMPLETE',
        claims: [{ claimNumber: 1, claimType: 'INDEPENDENT', parentClaimNumber: null, text: 'text' }],
      });
      mockPrisma.complianceCheck.findFirst.mockResolvedValue(null);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([{ estimatedCostUsd: 2.0 }]);
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);

      await expect(service.prepareCheck('p1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('saveStreamComplete', () => {
    it('saves results and marks check COMPLETE', async () => {
      const payload = {
        status: 'COMPLETE',
        results: [
          { rule: '101_eligibility', status: 'PASS', detail: 'Eligible', claim_number: 1 },
          { rule: '112b_definiteness', status: 'FAIL', detail: 'Vague terms', claim_number: 2, suggestion: 'Clarify' },
        ],
        total_estimated_cost_usd: 0.50,
      };

      await service.saveStreamComplete('check-1', payload);

      expect(mockPrisma.complianceResult.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.complianceCheck.update).toHaveBeenCalledWith({
        where: { id: 'check-1' },
        data: expect.objectContaining({
          status: 'COMPLETE',
          overallPass: false, // has a FAIL result
          estimatedCostUsd: 0.50,
        }),
      });
    });

    it('marks overallPass true when all results PASS', async () => {
      const payload = {
        status: 'COMPLETE',
        results: [{ rule: '101_eligibility', status: 'PASS', detail: 'Eligible' }],
        total_estimated_cost_usd: 0.25,
      };

      await service.saveStreamComplete('check-1', payload);

      expect(mockPrisma.complianceCheck.update).toHaveBeenCalledWith({
        where: { id: 'check-1' },
        data: expect.objectContaining({ overallPass: true }),
      });
    });

    it('marks check ERROR when payload status is ERROR', async () => {
      await service.saveStreamComplete('check-1', {
        status: 'ERROR',
        results: [],
      });

      expect(mockPrisma.complianceCheck.update).toHaveBeenCalledWith({
        where: { id: 'check-1' },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
      expect(mockPrisma.complianceResult.create).not.toHaveBeenCalled();
    });
  });

  describe('markCheckError', () => {
    it('marks a RUNNING check as ERROR', async () => {
      mockPrisma.complianceCheck.findUnique.mockResolvedValue({ id: 'c1', status: 'RUNNING' });

      await service.markCheckError('c1');

      expect(mockPrisma.complianceCheck.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
    });

    it('does not update a non-RUNNING check', async () => {
      mockPrisma.complianceCheck.findUnique.mockResolvedValue({ id: 'c1', status: 'COMPLETE' });
      await service.markCheckError('c1');
      expect(mockPrisma.complianceCheck.update).not.toHaveBeenCalled();
    });
  });
});

describe('ComplianceController — streamCheck SSE', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controller: ComplianceController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockService = {
      prepareCheck: jest.fn(),
      saveStreamComplete: jest.fn(),
      markCheckError: jest.fn(),
    };
    const mockSettingsSvc = { getSettings: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controller = new ComplianceController(mockService, mockSettingsSvc as any);

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      writableEnded: false,
    };
  });

  it('returns error when prepareCheck fails', async () => {
    mockService.prepareCheck.mockRejectedValue(new NotFoundException('Project not found'));

    await controller.streamCheck('p1', {}, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
  });

  it('returns 502 when upstream fetch fails', async () => {
    mockService.prepareCheck.mockResolvedValue({
      checkId: 'check-1',
      requestBody: { settings: { api_key: 'key' } },
    });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await controller.streamCheck('p1', {}, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(502);
    expect(mockService.markCheckError).toHaveBeenCalledWith('check-1');
  });

  it('sets SSE headers and forwards events when upstream succeeds', async () => {
    mockService.prepareCheck.mockResolvedValue({
      checkId: 'check-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    const ssePayload =
      'event: step\ndata: {"step":"eligibility"}\n\n' +
      'event: complete\ndata: {"status":"COMPLETE","results":[{"rule":"101","status":"PASS","detail":"OK"}]}\n\n';

    const encoder = new TextEncoder();
    let readerDone = false;
    const mockReader = {
      read: jest.fn().mockImplementation(() => {
        if (!readerDone) {
          readerDone = true;
          return Promise.resolve({ done: false, value: encoder.encode(ssePayload) });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    await controller.streamCheck('p1', {}, mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('event: step'));
    expect(mockService.saveStreamComplete).toHaveBeenCalledWith('check-1', expect.objectContaining({
      status: 'COMPLETE',
    }));
    expect(mockService.markCheckError).not.toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('marks check as error when stream ends without complete event', async () => {
    mockService.prepareCheck.mockResolvedValue({
      checkId: 'check-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    const ssePayload = 'event: step\ndata: {"step":"eligibility"}\n\n';
    const encoder = new TextEncoder();
    let readerDone = false;
    const mockReader = {
      read: jest.fn().mockImplementation(() => {
        if (!readerDone) {
          readerDone = true;
          return Promise.resolve({ done: false, value: encoder.encode(ssePayload) });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    mockFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    await controller.streamCheck('p1', {}, mockRes);

    expect(mockService.markCheckError).toHaveBeenCalledWith('check-1');
  });
});
