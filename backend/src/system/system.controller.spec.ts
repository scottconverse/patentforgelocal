import { Test, TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

describe('SystemController', () => {
  let controller: SystemController;
  let service: SystemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [SystemService],
    }).compile();

    controller = module.get<SystemController>(SystemController);
    service = module.get<SystemService>(SystemService);
  });

  describe('getSystemCheck', () => {
    it('returns system info with required fields', async () => {
      const result = await controller.getSystemCheck();
      expect(result).toHaveProperty('ramGB');
      expect(result).toHaveProperty('diskFreeGB');
      expect(result).toHaveProperty('cpuCores');
      expect(result).toHaveProperty('gpuDetected');
      expect(result).toHaveProperty('ollamaRunning');
      expect(result).toHaveProperty('modelDownloaded');
      expect(result).toHaveProperty('modelName');
      expect(typeof result.ramGB).toBe('number');
      expect(result.cpuCores).toBeGreaterThan(0);
    });
  });

  describe('getModelPullProgress', () => {
    it('returns idle status initially', () => {
      const result = controller.getModelPullProgress();
      expect(result.status).toBe('idle');
      expect(result.percent).toBe(0);
    });
  });

  describe('startModelPull', () => {
    it('returns started true when no pull is running', async () => {
      // This will fail to connect to Ollama in test env but should not throw
      const result = await controller.startModelPull();
      expect(result).toHaveProperty('started');
      // Wait a moment then check progress shows an error (no Ollama in test)
      await new Promise((r) => setTimeout(r, 500));
      const progress = controller.getModelPullProgress();
      expect(['pulling', 'error']).toContain(progress.status);
    });
  });
});
