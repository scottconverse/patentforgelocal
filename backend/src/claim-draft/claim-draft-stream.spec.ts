/**
 * Tests for ClaimDraftService stream helper methods: prepareDraft, saveStreamComplete, markDraftError.
 * Tests for ClaimDraftController streamDraft SSE endpoint.
 */

import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ClaimDraftService } from './claim-draft.service';
import { ClaimDraftController } from './claim-draft.controller';

// Mock fetch globally
const mockFetch = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = mockFetch as any;

const makePrisma = () => ({
  claim: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  claimDraft: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  feasibilityStage: { findMany: jest.fn().mockResolvedValue([]) },
  feasibilityRun: { findFirst: jest.fn() },
  priorArtSearch: { findFirst: jest.fn() },
  patentDetail: { findUnique: jest.fn() },
  project: { findUnique: jest.fn() },
  complianceCheck: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('ClaimDraftService — stream helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: ClaimDraftService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSettings: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = makePrisma();
    mockSettings = makeSettings();
    service = new ClaimDraftService(mockPrisma, mockSettings);
  });

  describe('prepareDraft', () => {
    it('throws NotFoundException when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);
      await expect(service.prepareDraft('p1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when no invention exists', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', invention: null });
      await expect(service.prepareDraft('p1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when a draft is already RUNNING', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Test', description: 'Desc' },
      });
      mockPrisma.claimDraft.findFirst.mockResolvedValue({ id: 'd1', status: 'RUNNING' });
      await expect(service.prepareDraft('p1')).rejects.toThrow(ConflictException);
    });

    it('returns draftId and requestBody when valid', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        invention: { title: 'Widget', description: 'A widget' },
      });
      mockPrisma.claimDraft.findFirst
        .mockResolvedValueOnce(null) // concurrency check
        .mockResolvedValueOnce(null); // version check
      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({
        stages: [
          { stageNumber: 5, outputText: 'Stage 5 output' },
          { stageNumber: 6, outputText: 'Stage 6 output' },
        ],
      });
      mockPrisma.priorArtSearch.findFirst.mockResolvedValue(null);
      mockPrisma.claimDraft.create.mockResolvedValue({ id: 'new-draft', version: 1 });

      const result = await service.prepareDraft('p1');

      expect(result.draftId).toBe('new-draft');
      expect(result.requestBody.invention_narrative).toContain('Widget');
      expect(result.requestBody.settings.api_key).toBe('test-key');
      expect(result.requestBody.feasibility_stage_5).toBe('Stage 5 output');
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
      mockPrisma.claimDraft.findFirst.mockResolvedValue(null); // no running draft
      mockPrisma.claimDraft.findMany.mockResolvedValue([{ estimatedCostUsd: 2.0 }]);
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([]);
      mockPrisma.complianceCheck.findMany.mockResolvedValue([]);
      mockPrisma.patentApplication.findMany.mockResolvedValue([]);

      await expect(service.prepareDraft('p1')).rejects.toThrow(BadRequestException);
      await expect(service.prepareDraft('p1')).rejects.toThrow(/Cost cap exceeded/);
    });
  });

  describe('saveStreamComplete', () => {
    it('saves claims and marks draft COMPLETE on success', async () => {
      const payload = {
        status: 'COMPLETE',
        claims: [
          { claim_number: 1, claim_type: 'INDEPENDENT', text: 'A method...', examiner_notes: 'Looks good' },
          { claim_number: 2, claim_type: 'DEPENDENT', parent_claim_number: 1, text: 'The method of claim 1...' },
        ],
        specification_language: 'en',
        planner_strategy: 'broad-to-narrow',
        total_estimated_cost_usd: 0.75,
      };

      await service.saveStreamComplete('draft-1', payload);

      expect(mockPrisma.claim.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.claim.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          draftId: 'draft-1',
          claimNumber: 1,
          claimType: 'INDEPENDENT',
          text: 'A method...',
        }),
      });
      expect(mockPrisma.claimDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: expect.objectContaining({
          status: 'COMPLETE',
          specLanguage: 'en',
          estimatedCostUsd: 0.75,
        }),
      });
    });

    it('marks draft ERROR when payload status is ERROR', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await service.saveStreamComplete('draft-1', {
        status: 'ERROR',
        error_message: 'API rate limited',
        claims: [],
      });

      expect(mockPrisma.claimDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
      expect(mockPrisma.claim.create).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('markDraftError', () => {
    it('marks a RUNNING draft as ERROR', async () => {
      mockPrisma.claimDraft.findUnique.mockResolvedValue({ id: 'draft-1', status: 'RUNNING' });

      await service.markDraftError('draft-1');

      expect(mockPrisma.claimDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
    });

    it('does not update a non-RUNNING draft', async () => {
      mockPrisma.claimDraft.findUnique.mockResolvedValue({ id: 'draft-1', status: 'COMPLETE' });

      await service.markDraftError('draft-1');

      expect(mockPrisma.claimDraft.update).not.toHaveBeenCalled();
    });

    it('does not throw when draft not found', async () => {
      mockPrisma.claimDraft.findUnique.mockResolvedValue(null);

      await expect(service.markDraftError('nonexistent')).resolves.not.toThrow();
    });
  });
});

describe('ClaimDraftController — streamDraft SSE', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let controller: ClaimDraftController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSettingsSvc: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRes: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockService = {
      prepareDraft: jest.fn(),
      saveStreamComplete: jest.fn(),
      markDraftError: jest.fn(),
    };
    mockSettingsSvc = { getSettings: jest.fn() };
    controller = new ClaimDraftController(mockService, mockSettingsSvc);

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

  it('returns error when prepareDraft fails', async () => {
    const err = new NotFoundException('Project not found');
    mockService.prepareDraft.mockRejectedValue(err);

    await controller.streamDraft('p1', mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Project not found' });
  });

  it('returns 502 when upstream fetch fails (connection refused)', async () => {
    mockService.prepareDraft.mockResolvedValue({
      draftId: 'draft-1',
      requestBody: { settings: { api_key: 'key' } },
    });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await controller.streamDraft('p1', mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(502);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('ECONNREFUSED') }),
    );
    expect(mockService.markDraftError).toHaveBeenCalledWith('draft-1');
  });

  it('sets SSE headers and forwards events when upstream succeeds', async () => {
    mockService.prepareDraft.mockResolvedValue({
      draftId: 'draft-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    // Simulate an SSE stream with step + complete events
    const ssePayload =
      'event: step\ndata: {"step":"plan"}\n\n' +
      'event: complete\ndata: {"status":"COMPLETE","claims":[{"claim_number":1,"claim_type":"INDEPENDENT","text":"A method"}]}\n\n';

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

    await controller.streamDraft('p1', mockRes);

    // Verify SSE headers set
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(mockRes.flushHeaders).toHaveBeenCalled();

    // Verify events forwarded to client
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('event: step'));
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('event: complete'));

    // Verify DB save on complete
    expect(mockService.saveStreamComplete).toHaveBeenCalledWith('draft-1', expect.objectContaining({
      status: 'COMPLETE',
      claims: expect.arrayContaining([expect.objectContaining({ claim_number: 1 })]),
    }));

    // markDraftError should NOT have been called since complete was saved
    expect(mockService.markDraftError).not.toHaveBeenCalled();

    expect(mockRes.end).toHaveBeenCalled();
  });

  it('marks draft as error when upstream returns non-OK status', async () => {
    mockService.prepareDraft.mockResolvedValue({
      draftId: 'draft-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await controller.streamDraft('p1', mockRes);

    expect(mockService.markDraftError).toHaveBeenCalledWith('draft-1');
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  it('marks draft as error when stream ends without complete event', async () => {
    mockService.prepareDraft.mockResolvedValue({
      draftId: 'draft-1',
      requestBody: { settings: { api_key: 'key' } },
    });

    // Stream with only step events, no complete
    const ssePayload = 'event: step\ndata: {"step":"plan"}\n\n';
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

    await controller.streamDraft('p1', mockRes);

    expect(mockService.markDraftError).toHaveBeenCalledWith('draft-1');
  });
});
