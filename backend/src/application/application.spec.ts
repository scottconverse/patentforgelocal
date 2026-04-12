import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationService } from './application.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ApplicationService', () => {
  let service: ApplicationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mocks are idiomatic in NestJS unit tests
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let settings: any;

  beforeEach(async () => {
    prisma = {
      patentApplication: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      project: { findUnique: jest.fn() },
      claimDraft: { findFirst: jest.fn() },
      feasibilityRun: { findFirst: jest.fn() },
      feasibilityStage: { findMany: jest.fn() },
      priorArtSearch: { findFirst: jest.fn() },
      patentDetail: { findUnique: jest.fn() },
      complianceCheck: { findMany: jest.fn() },
    };
    settings = {
      getSettings: jest.fn().mockResolvedValue({
        anthropicApiKey: 'test-key',
        defaultModel: 'claude-haiku-4-5-20251001',
        researchModel: '',
        maxTokens: 16000,
        costCapUsd: 5.0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get<ApplicationService>(ApplicationService);
  });

  describe('startGeneration', () => {
    it('should reject when project not found', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.startGeneration('p1')).rejects.toThrow(NotFoundException);
    });

    it('should reject when no invention form exists', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', title: 'Test', invention: null });
      await expect(service.startGeneration('p1')).rejects.toThrow(NotFoundException);
    });

    it('should reject when no completed claims exist', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        title: 'Test',
        invention: { title: 'T', description: 'D' },
      });
      prisma.claimDraft.findFirst.mockResolvedValue(null);
      await expect(service.startGeneration('p1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLatest', () => {
    it('should return NONE when no application exists', async () => {
      prisma.patentApplication.findFirst.mockResolvedValue(null);
      const result = await service.getLatest('p1');
      expect(result).toEqual({ status: 'NONE' });
    });

    it('should return latest application', async () => {
      const app = { id: 'a1', version: 2, status: 'COMPLETE' };
      prisma.patentApplication.findFirst.mockResolvedValue(app);
      const result = await service.getLatest('p1');
      expect(result).toEqual(app);
    });
  });

  describe('getByVersion', () => {
    it('should throw 404 when version not found', async () => {
      prisma.patentApplication.findFirst.mockResolvedValue(null);
      await expect(service.getByVersion('p1', 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSection', () => {
    it('should reject invalid section name', async () => {
      prisma.patentApplication.findFirst.mockResolvedValue({ id: 'a1' });
      await expect(service.updateSection('p1', 'invalidSection', 'text')).rejects.toThrow(BadRequestException);
    });

    it('should reject when no application exists', async () => {
      prisma.patentApplication.findFirst.mockResolvedValue(null);
      await expect(service.updateSection('p1', 'background', 'text')).rejects.toThrow(NotFoundException);
    });

    it('should update valid section', async () => {
      const app = { id: 'a1', background: 'old' };
      prisma.patentApplication.findFirst.mockResolvedValue(app);
      prisma.patentApplication.update.mockResolvedValue({ ...app, background: 'new' });
      await service.updateSection('p1', 'background', 'new');
      expect(prisma.patentApplication.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { background: 'new' },
      });
    });
  });

  describe('onModuleInit', () => {
    it('should clean up stuck RUNNING applications', async () => {
      prisma.patentApplication.updateMany.mockResolvedValue({ count: 2 });
      await service.onModuleInit();
      expect(prisma.patentApplication.updateMany).toHaveBeenCalledWith({
        where: { status: 'RUNNING' },
        data: expect.objectContaining({ status: 'ERROR', errorMessage: 'Interrupted by server restart' }),
      });
    });
  });
});
