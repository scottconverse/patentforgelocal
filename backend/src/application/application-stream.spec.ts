/**
 * Tests for ApplicationService stream helper methods: prepareGeneration, saveStreamComplete, markAppError.
 * Tests for ApplicationController streamGeneration SSE endpoint.
 */

import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ApplicationService } from './application.service';
import { ApplicationController } from './application.controller';

// Mock fetch globally
const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = mockFetch as any;

const makePrisma = () => ({
  patentApplication: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  project: { findUnique: jest.fn() },
  claimDraft: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  feasibilityRun: { findFirst: jest.fn() },
  feasibilityStage: { findMany: jest.fn().mockResolvedValue([]) },
  priorArtSearch: { findFirst: jest.fn() },
  patentDetail: { findUnique: jest.fn() },
  complianceCheck: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('ApplicationService — stream helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: ApplicationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSettings: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makePrisma();
    mockSettings = makeSettings();
    service = new ApplicationService(mockPrisma, mockSettings);
  });

  describe('prepareGeneration', () => {
    it('throws NotFoundException when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      await expect(service.prepareGeneration('p1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no invention exists', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', invention: null });
      await expect(service.prepareGeneration('p1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no completed claims', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Test', description: 'Desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue(null);
      await expect(service.prepareGeneration('p1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when app is already RUNNING', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Test', description: 'Desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'd1',
        version: 1,
        status: 'COMPLETE',
        specLanguage: 'en',
        claims: [{ claimNumber: 1, text: 'A method...' }],
      });
      mockPrisma.patentApplication.findFirst.mockResolvedValue({ id: 'a1', status: 'RUNNING' });
      await expect(service.prepareGeneration('p1')).rejects.toThrow(ConflictException);
    });

    it('returns appId and requestBody when valid', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Widget', description: 'A widget' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'd1',
        version: 1,
        status: 'COMPLETE',
        specLanguage: 'en',
        claims: [{ claimNumber: 1, text: 'A method of widgeting' }],
      });
      mockPrisma.patentApplication.findFirst
        .mockResolvedValueOnce(null) // concurrency check
        .mockResolvedValueOnce(null); // version check
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({
        stages: [
          { stageNumber: 1, outputText: 'Stage 1' },
          { stageNumber: 5, outputText: 'Stage 5' },
          { stageNumber: 6, outputText: 'Stage 6' },
        ],
      });
      mockPrisma.priorArtSearch.findFirst.mockResolvedValue(null);
      mockPrisma.patentApplication.create.mockResolvedValue({ id: 'new-app', version: 1 });

      const result = await service.prepareGeneration('p1');

      expect(result.appId).toBe('new-app');
      expect(result.requestBody.invention_narrative).toContain('Widget');
      expect(result.requestBody.claims_text).toContain('A method of widgeting');
      expect(result.requestBody.settings.api_key).toBe('test-key');
      expect(result.requestBody.feasibility_stage_1).toBe('Stage 1');
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
        specLanguage: null,
        claims: [{ claimNumber: 1, text: 'text' }],
      });
      mockPrisma.patentApplication.findFirst.mockResolvedValue(null);
      mockPrisma.patentApplication.findMany.mockResolvedValue([{ estimatedCostUsd: 2.0 }]);

      await expect(service.prepareGeneration('p1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('saveStreamComplete', () => {
    it('saves sections and marks app COMPLETE on success', async () => {
      const payload = {
        status: 'COMPLETE',
        title: 'Widget Patent',
        abstract: 'A novel widget...',
        background: 'Background text',
        summary: 'Summary text',
        detailed_description: 'Detailed description',
        claims: 'Claims text',
        figure_descriptions: 'Figure descriptions',
        cross_references: 'None',
        ids_table: 'IDS table',
        total_estimated_cost_usd: 1.50,
      };

      await service.saveStreamComplete('app-1', payload);

      expect(mockPrisma.patentApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: expect.objectContaining({
          status: 'COMPLETE',
          title: 'Widget Patent',
          abstract: 'A novel widget...',
          background: 'Background text',
          estimatedCostUsd: 1.50,
        }),
      });
    });

    it('marks app ERROR when payload status is ERROR', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await service.saveStreamComplete('app-1', {
        status: 'ERROR',
        error_message: 'API rate limited',
      });

      expect(mockPrisma.patentApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-1' },
        data: expect.objectContaining({
          status: 'ERROR',
          errorMessage: 'API rate limited',
        }),
      });

      errorSpy.mockRestore();
    });
  });

  describe('markAppError', () => {
    it('marks a RUNNING app as ERROR', async () => {
      mockPrisma.patentApplication.findUnique.mockResolvedValue({ id: 'a1', status: 'RUNNING' });

      await service.markAppError('a1');

      expect(mockPrisma.patentApplication.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
    });

    it('does not update a non-RUNNING app', async () => {
      mockPrisma.patentApplication.findUnique.mockResolvedValue({ id: 'a1', status: 'COMPLETE' });
      await service.markAppError('a1');
      expect(mockPrisma.patentApplication.update).not.toHaveBeenCalled();
    });
  });
});

describe('ApplicationController — streamGeneration SSE', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controller: ApplicationController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockService = {
      prepareGeneration: jest.fn(),
      saveStreamComplete: jest.fn(),
      markAppError: jest.fn(),
    };
    const mockSettingsSvc = { getSettings: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controller = new ApplicationController(mockService, mockSettingsSvc as any);

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

  it('returns error when prepareGeneration fails', async () => {
    mockService.prepareGeneration.mockRejectedValue(new NotFoundException('Project not found'));

    await controller.streamGeneration('p1', mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
  });

  it('returns 502 when upstream fetch fails', async () => {
    mockService.prepareGeneration.mockResolvedValue({
      appId: 'app-1',
      requestBody: { settings: { api_key: 'key' } },
    });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await controller.streamGeneration('p1', mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(502);
    expect(mockService.markAppError).toHaveBeenCalledWith('app-1');
  });

  it('sets SSE headers and forwards events when upstream succeeds', async () => {
    mockService.prepareGeneration.mockResolvedValue({
      appId: 'app-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    const ssePayload =
      'event: step\ndata: {"step":"background"}\n\n' +
      'event: complete\ndata: {"status":"COMPLETE","title":"Widget Patent","abstract":"Novel widget"}\n\n';

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

    await controller.streamGeneration('p1', mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('event: step'));
    expect(mockService.saveStreamComplete).toHaveBeenCalledWith('app-1', expect.objectContaining({
      status: 'COMPLETE',
      title: 'Widget Patent',
    }));
    expect(mockService.markAppError).not.toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('marks app as error when upstream returns non-OK status', async () => {
    mockService.prepareGeneration.mockResolvedValue({
      appId: 'app-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Validation failed',
    });

    await controller.streamGeneration('p1', mockRes);

    expect(mockService.markAppError).toHaveBeenCalledWith('app-1');
    expect(mockRes.status).toHaveBeenCalledWith(422);
  });

  it('marks app as error when stream ends without complete event', async () => {
    mockService.prepareGeneration.mockResolvedValue({
      appId: 'app-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    const ssePayload = 'event: step\ndata: {"step":"background"}\n\n';
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

    await controller.streamGeneration('p1', mockRes);

    expect(mockService.markAppError).toHaveBeenCalledWith('app-1');
  });
});
