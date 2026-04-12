/**
 * Tests for ClaimDraftService — ownership checks, validation, concurrency guards.
 */

import { NotFoundException, ConflictException } from '@nestjs/common';
import { ClaimDraftService } from './claim-draft.service';

// Mock fetch globally so the fire-and-forget IIFE in startDraft rejects
// immediately and predictably instead of hitting the network.
const mockFetch = jest.fn().mockRejectedValue(new Error('mocked fetch rejection'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- global mock requires any cast
global.fetch = mockFetch as any;

const mockPrisma = {
  claim: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  claimDraft: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  feasibilityStage: { findMany: jest.fn() },
  feasibilityRun: { findFirst: jest.fn() },
  priorArtSearch: { findFirst: jest.fn() },
  patentDetail: { findUnique: jest.fn() },
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

describe('ClaimDraftService', () => {
  let service: ClaimDraftService;

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mocks
    service = new ClaimDraftService(mockPrisma as any, mockSettings as any);
  });

  describe('updateClaim', () => {
    it('updates claim when it belongs to the project', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue({
        id: 'claim-1',
        text: 'old text',
      });
      mockPrisma.claim.update.mockResolvedValue({
        id: 'claim-1',
        text: 'new text',
      });

      const result = await service.updateClaim('project-1', 'claim-1', 'new text');
      expect(result.text).toBe('new text');
      expect(mockPrisma.claim.findFirst).toHaveBeenCalledWith({
        where: { id: 'claim-1', draft: { projectId: 'project-1' } },
      });
    });

    it('throws NotFoundException when claim does not belong to project', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(null);

      await expect(service.updateClaim('project-1', 'claim-999', 'text')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when claim does not exist', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(null);

      await expect(service.updateClaim('project-1', 'nonexistent', 'text')).rejects.toThrow(/not found/);
    });
  });

  describe('startDraft concurrency guard', () => {
    it('rejects when a draft is already RUNNING for the project', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'project-1',
        invention: { title: 'Test', description: 'Test' },
      });
      // A draft is already running
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        status: 'RUNNING',
      });

      await expect(service.startDraft('project-1')).rejects.toThrow(ConflictException);
      await expect(service.startDraft('project-1')).rejects.toThrow(/already running/);
    });

    it('allows starting when no draft is RUNNING', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'project-1',
        invention: { title: 'Test', description: 'Test' },
      });
      // First findFirst: no running draft
      // Second findFirst: last draft for version numbering
      mockPrisma.claimDraft.findFirst
        .mockResolvedValueOnce(null) // concurrency check
        .mockResolvedValueOnce(null); // version check

      mockPrisma.feasibilityRun.findFirst.mockResolvedValue({
        stages: [
          { stageNumber: 5, outputText: 'Stage 5' },
          { stageNumber: 6, outputText: 'Stage 6' },
        ],
      });
      mockPrisma.priorArtSearch.findFirst.mockResolvedValue(null);
      mockPrisma.feasibilityStage.findMany.mockResolvedValue([]);
      mockPrisma.claimDraft.create.mockResolvedValue({
        id: 'new-draft',
        version: 1,
        status: 'RUNNING',
      });

      // Suppress expected console.error from the fire-and-forget IIFE
      // (fetch fails in test env → logs "Pipeline failed for draft...")
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await service.startDraft('project-1');
      expect(result.id).toBe('new-draft');
      // Let the fire-and-forget pipeline IIFE settle (multiple async hops:
      // fetch attempt → catch → console.error → finally → findUnique → update)
      for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));

      errorSpy.mockRestore();
    });
  });

  describe('getLatest — preview vs full', () => {
    const draftWithClaims = {
      id: 'draft-1',
      version: 1,
      status: 'COMPLETE',
      claims: [
        {
          id: 'c1',
          claimNumber: 1,
          claimType: 'INDEPENDENT',
          scopeLevel: 'BROAD',
          parentClaimNumber: null,
          text: 'A'.repeat(400), // 400-char text to verify truncation
          examinerNotes: '',
        },
        {
          id: 'c2',
          claimNumber: 2,
          claimType: 'DEPENDENT',
          scopeLevel: null,
          parentClaimNumber: 1,
          text: 'Short dependent claim text.',
          examinerNotes: '',
        },
      ],
    };

    it('returns preview (first 200 chars) by default, without text field', async () => {
      mockPrisma.claimDraft.findFirst.mockResolvedValue(draftWithClaims);

      const result = await service.getLatest('project-1') as any;
      expect(result.claims).toHaveLength(2);
      // First claim: 400 chars → preview should be 200 chars
      expect(result.claims[0].preview).toBe('A'.repeat(200));
      expect(result.claims[0].text).toBeUndefined();
      // Second claim: short text → preview equals full text
      expect(result.claims[1].preview).toBe('Short dependent claim text.');
      expect(result.claims[1].text).toBeUndefined();
    });

    it('returns full text when full=true, without preview field', async () => {
      mockPrisma.claimDraft.findFirst.mockResolvedValue(draftWithClaims);

      const result = await service.getLatest('project-1', true) as any;
      expect(result.claims).toHaveLength(2);
      expect(result.claims[0].text).toBe('A'.repeat(400));
      expect(result.claims[0].preview).toBeUndefined();
      expect(result.claims[1].text).toBe('Short dependent claim text.');
    });

    it('returns NONE status when no draft exists', async () => {
      mockPrisma.claimDraft.findFirst.mockResolvedValue(null);

      const result = await service.getLatest('project-1');
      expect(result.status).toBe('NONE');
      expect(result.claims).toEqual([]);
    });
  });

  describe('getClaimText', () => {
    it('returns full text for a valid claim', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue({ text: 'Full claim text content here.' });

      const result = await service.getClaimText('project-1', 'claim-1');
      expect(result).toEqual({ text: 'Full claim text content here.' });
      expect(mockPrisma.claim.findFirst).toHaveBeenCalledWith({
        where: { id: 'claim-1', draft: { projectId: 'project-1' } },
        select: { text: true },
      });
    });

    it('throws NotFoundException when claim does not exist', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(null);

      await expect(service.getClaimText('project-1', 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.getClaimText('project-1', 'nonexistent')).rejects.toThrow(/not found/);
    });

    it('throws NotFoundException when claim belongs to a different project', async () => {
      mockPrisma.claim.findFirst.mockResolvedValue(null);

      await expect(service.getClaimText('wrong-project', 'claim-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('regenerateClaim', () => {
    it('throws NotFoundException when no completed draft exists', async () => {
      mockPrisma.claimDraft.findFirst.mockResolvedValue(null);

      await expect(service.regenerateClaim('project-1', 1)).rejects.toThrow(NotFoundException);
      await expect(service.regenerateClaim('project-1', 1)).rejects.toThrow(/No completed claim draft found/);
    });

    it('throws NotFoundException when claim number does not exist in draft', async () => {
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        status: 'COMPLETE',
        claims: [
          { id: 'c1', claimNumber: 1, text: 'Claim 1 text' },
          { id: 'c2', claimNumber: 2, text: 'Claim 2 text' },
        ],
      });

      await expect(service.regenerateClaim('project-1', 99)).rejects.toThrow(NotFoundException);
      await expect(service.regenerateClaim('project-1', 99)).rejects.toThrow(/Claim 99 not found/);
    });

    it('regenerates a claim and updates its text in the database', async () => {
      // 1. Completed draft with claims
      mockPrisma.claimDraft.findFirst.mockResolvedValue({
        id: 'draft-1',
        status: 'COMPLETE',
        claims: [
          { id: 'c1', claimNumber: 1, text: 'Original claim 1 text' },
          { id: 'c2', claimNumber: 2, text: 'Original claim 2 text' },
        ],
      });

      // 2. Settings with API key (already configured via mockSettings default)

      // 3. Project with invention
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'project-1',
        invention: { title: 'Widget', description: 'A novel widget' },
      });

      // 4. Successful fetch response with regenerated claim
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'COMPLETE',
          claims: [{ claim_number: 1, text: 'Regenerated claim 1 text' }],
        }),
      });

      // 5. claim.update returns updated record
      mockPrisma.claim.update.mockResolvedValue({
        id: 'c1',
        claimNumber: 1,
        text: 'Regenerated claim 1 text',
      });

      // 6. Call regenerateClaim
      const result = await service.regenerateClaim('project-1', 1);

      // 7. Verify fetch was called with the claim drafter URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/draft/sync'),
        expect.objectContaining({ method: 'POST' }),
      );

      // 8. Verify claim.update was called with the new text
      expect(mockPrisma.claim.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { text: 'Regenerated claim 1 text' },
      });

      expect(result.text).toBe('Regenerated claim 1 text');
    });
  });
});
