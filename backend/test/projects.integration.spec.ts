import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_DB_PATH = join(__dirname, 'projects-integration-test.db');
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

describe('Projects API (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    // Remove PATENTFORGE_TOKEN so auth guard is disabled for these tests
    delete process.env.PATENTFORGE_TOKEN;

    // Push schema to fresh test database
    execSync('npx prisma db push --force-reset --skip-generate', {
      cwd: join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalGuards(new AuthGuard());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Clean tables in dependency order (cascades handle children)
    await prisma.project.deleteMany();
    await prisma.appSettings.deleteMany();
  });

  describe('POST /api/projects', () => {
    it('creates a project with valid title and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ title: 'Test Project' })
        .expect(201);

      expect(res.body).toMatchObject({
        title: 'Test Project',
        status: 'INTAKE',
      });
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('string');
    });

    it('returns 400 when title is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({})
        .expect(400);
    });

    it('returns 400 when title is empty string', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ title: '' })
        .expect(400);
    });
  });

  describe('GET /api/projects', () => {
    it('returns 200 with an empty array when no projects exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('returns 200 with array containing created projects', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ title: 'Alpha' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ title: 'Beta' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns 200 with the project when id is valid', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ title: 'Lookup Me' })
        .expect(201);

      const { id } = createRes.body;

      const res = await request(app.getHttpServer())
        .get(`/api/projects/${id}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.title).toBe('Lookup Me');
    });

    it('returns 404 when project id does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/projects/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('deletes a project and returns 204, then GET returns 404', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ title: 'Delete Me' })
        .expect(201);

      const { id } = createRes.body;

      await request(app.getHttpServer())
        .delete(`/api/projects/${id}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/projects/${id}`)
        .expect(404);
    });

    it('returns 404 when deleting a non-existent project', async () => {
      await request(app.getHttpServer())
        .delete('/api/projects/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
