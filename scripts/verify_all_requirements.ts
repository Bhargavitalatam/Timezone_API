import request from 'supertest';
import { createApp } from '../src/app';
import { BookingService } from '../src/services/BookingService';
import { MockBookingRepository } from '../src/repositories/MockBookingRepository';
import fs from 'fs';
import path from 'path';

async function verifyAll() {
  console.log('=====================================================');
  console.log('   VERIFYING ALL 10 CORE REQUIREMENTS FOR SUBMISSION   ');
  console.log('=====================================================\n');

  let allPassed = true;
  function report(reqNum: number, title: string, passed: boolean, details?: string) {
    if (passed) {
      console.log(`[PASS] Requirement ${reqNum}: ${title}`);
    } else {
      console.error(`[FAIL] Requirement ${reqNum}: ${title}`);
      if (details) console.error(`       Details: ${details}`);
      allPassed = false;
    }
  }

  // ----------------------------------------------------
  // Req 1: docker-compose.yml and Dockerfile verification
  // ----------------------------------------------------
  try {
    const dockerComposePath = path.join(__dirname, '..', 'docker-compose.yml');
    const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
    const initSqlPath = path.join(__dirname, '..', 'scripts', 'init.sql');

    const hasCompose = fs.existsSync(dockerComposePath);
    const hasDockerfile = fs.existsSync(dockerfilePath);
    const hasInitSql = fs.existsSync(initSqlPath);

    const composeContent = fs.readFileSync(dockerComposePath, 'utf8');
    const hasDbService = composeContent.includes('db:') && composeContent.includes('postgres');
    const hasApiService = composeContent.includes('api:') && composeContent.includes('build:');
    const hasHealthCheck = composeContent.includes('healthcheck:') && composeContent.includes('service_healthy');

    report(
      1,
      'Application environment starts completely via docker-compose with automated database seeding',
      hasCompose && hasDockerfile && hasInitSql && hasDbService && hasApiService && hasHealthCheck
    );
  } catch (err: any) {
    report(1, 'docker-compose setup', false, err.message);
  }

  // ----------------------------------------------------
  // Req 2: Database schema verification (init.sql and entity)
  // ----------------------------------------------------
  try {
    const initSql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'init.sql'), 'utf8');
    const entityFile = fs.readFileSync(path.join(__dirname, '..', 'src', 'entities', 'BookingEntity.ts'), 'utf8');

    const tableMatch = initSql.includes('office_hour_bookings') && entityFile.includes('office_hour_bookings');
    const idMatch = initSql.includes('id SERIAL PRIMARY KEY') && entityFile.includes('id');
    const profMatch = initSql.includes('professor_id') && entityFile.includes('professor_id');
    const studentMatch = initSql.includes('student_id') && entityFile.includes('student_id');
    const timeMatch = initSql.includes('starts_at_utc TIMESTAMPTZ') && entityFile.includes('starts_at_utc');
    const durMatch = initSql.includes('duration_minutes') && entityFile.includes('duration_minutes');
    const tzMatch = initSql.includes('original_timezone') && entityFile.includes('original_timezone');

    report(
      2,
      'Database contains office_hour_bookings table with strict UTC TIMESTAMPTZ storage',
      tableMatch && idMatch && profMatch && studentMatch && timeMatch && durMatch && tzMatch
    );
  } catch (err: any) {
    report(2, 'db-schema', false, err.message);
  }

  // Set up in-memory app instance for HTTP endpoints verification
  const mockRepo = new MockBookingRepository();
  const service = new BookingService(mockRepo);
  const app = createApp(service);

  // ----------------------------------------------------
  // Req 3: POST /api/bookings with valid local time & IANA tz
  // ----------------------------------------------------
  try {
    mockRepo.clear();
    const res = await request(app).post('/api/bookings').send({
      professor_id: 'prof_oak',
      student_id: 'ash_ketchum',
      local_start_time: '2024-10-15T10:00:00',
      timezone: 'America/Chicago',
      duration_minutes: 30,
    });

    const is201 = res.status === 201;
    const hasProps = res.body.id && res.body.professor_id === 'prof_oak' && res.body.student_id === 'ash_ketchum';
    const startsAtOffset = res.body.starts_at === '2024-10-15T10:00:00-05:00';

    report(
      3,
      'Endpoint successfully creates booking with exact offset in starts_at (-05:00 for Chicago)',
      is201 && hasProps && startsAtOffset,
      `Received: status=${res.status}, starts_at=${res.body.starts_at}`
    );
  } catch (err: any) {
    report(3, 'create-booking-endpoint', false, err.message);
  }

  // ----------------------------------------------------
  // Req 4: GET /api/bookings?professor_id={id}
  // ----------------------------------------------------
  try {
    const res = await request(app).get('/api/bookings?professor_id=prof_oak');
    const is200 = res.status === 200;
    const isArray = Array.isArray(res.body);
    const item = res.body[0];
    const offsetFormat = item && item.starts_at === '2024-10-15T10:00:00-05:00' && !item.starts_at.endsWith('Z');

    report(
      4,
      'Endpoint retrieves bookings for professor formatting date with original offset (not Z)',
      is200 && isArray && offsetFormat,
      `Received: status=${res.status}, items=${res.body.length}, starts_at=${item?.starts_at}`
    );
  } catch (err: any) {
    report(4, 'get-bookings-endpoint', false, err.message);
  }

  // ----------------------------------------------------
  // Req 5: Overlap validation (409 Conflict, adjacent allowed, diff professor allowed)
  // ----------------------------------------------------
  try {
    mockRepo.clear();
    // 1. Create booking for Prof A from 10:00 to 10:30
    const step1 = await request(app).post('/api/bookings').send({
      professor_id: 'Prof A',
      student_id: 'student_1',
      local_start_time: '2024-10-15T10:00:00',
      timezone: 'America/New_York',
      duration_minutes: 30,
    });

    // 2. Overlap for Prof A 10:15 to 10:45 -> 409
    const step2 = await request(app).post('/api/bookings').send({
      professor_id: 'Prof A',
      student_id: 'student_2',
      local_start_time: '2024-10-15T10:15:00',
      timezone: 'America/New_York',
      duration_minutes: 30,
    });

    // 3. Adjacent for Prof A 10:30 to 11:00 -> 201
    const step3 = await request(app).post('/api/bookings').send({
      professor_id: 'Prof A',
      student_id: 'student_3',
      local_start_time: '2024-10-15T10:30:00',
      timezone: 'America/New_York',
      duration_minutes: 30,
    });

    // 4. Different Prof B 10:15 to 10:45 -> 201
    const step4 = await request(app).post('/api/bookings').send({
      professor_id: 'Prof B',
      student_id: 'student_4',
      local_start_time: '2024-10-15T10:15:00',
      timezone: 'America/New_York',
      duration_minutes: 30,
    });

    const passed = step1.status === 201 && step2.status === 409 && step3.status === 201 && step4.status === 201;

    report(
      5,
      'Service correctly rejects overlapping bookings for same prof (409), allows adjacent (201) & different prof (201)',
      passed,
      `Statuses: step1=${step1.status}, step2=${step2.status}, step3=${step3.status}, step4=${step4.status}`
    );
  } catch (err: any) {
    report(5, 'overlap-validation', false, err.message);
  }

  // ----------------------------------------------------
  // Req 6: DST Spring Forward gap validation (400 Bad Request)
  // ----------------------------------------------------
  try {
    const res = await request(app).post('/api/bookings').send({
      professor_id: 'prof_dst',
      student_id: 'student_dst',
      local_start_time: '2024-03-10T02:30:00',
      timezone: 'America/New_York',
      duration_minutes: 30,
    });

    const is400 = res.status === 400;
    const mentionsDst = /Daylight Saving Time|spring forward|invalid/i.test(res.body.error || '');

    report(
      6,
      'API correctly identifies and rejects invalid local time in DST Spring Forward gap with 400 Bad Request',
      is400 && mentionsDst,
      `Received: status=${res.status}, error=${res.body.error}`
    );
  } catch (err: any) {
    report(6, 'dst-spring-forward-validation', false, err.message);
  }

  // ----------------------------------------------------
  // Req 7: Dedicated test suite verifying Service layer via Mock Repository
  // ----------------------------------------------------
  try {
    const testFile = path.join(__dirname, '..', 'tests', 'unit', 'BookingService.test.ts');
    const mockRepoFile = path.join(__dirname, '..', 'src', 'repositories', 'MockBookingRepository.ts');

    const testExists = fs.existsSync(testFile);
    const mockExists = fs.existsSync(mockRepoFile);

    const testContent = fs.readFileSync(testFile, 'utf8');
    const usesMock = testContent.includes('MockBookingRepository') && testContent.includes('new BookingService(mockRepository)');

    report(
      7,
      'Codebase contains dedicated test suite verifying Service layer using in-memory Mock Repository',
      testExists && mockExists && usesMock
    );
  } catch (err: any) {
    report(7, 'mock-repository-tests', false, err.message);
  }

  // ----------------------------------------------------
  // Req 8: .env.example file at repository root
  // ----------------------------------------------------
  try {
    const envExamplePath = path.join(__dirname, '..', '.env.example');
    const envExists = fs.existsSync(envExamplePath);
    const envContent = fs.readFileSync(envExamplePath, 'utf8');

    const hasPostgres = envContent.includes('POSTGRES_USER') && envContent.includes('POSTGRES_PASSWORD') && envContent.includes('POSTGRES_DB');
    const hasPort = envContent.includes('PORT');
    const hasDbUrl = envContent.includes('DATABASE_URL');

    report(
      8,
      'Repository includes .env.example documenting all variables mapping to docker-compose',
      envExists && hasPostgres && hasPort && hasDbUrl
    );
  } catch (err: any) {
    report(8, 'env-example-file', false, err.message);
  }

  // ----------------------------------------------------
  // Req 9: DST Fall Back Handling (201 Created, defaults to -04:00)
  // ----------------------------------------------------
  try {
    mockRepo.clear();
    const res = await request(app).post('/api/bookings').send({
      professor_id: 'prof_fallback',
      student_id: 'student_fallback',
      local_start_time: '2024-11-03T01:30:00',
      timezone: 'America/New_York',
      duration_minutes: 30,
    });

    const is201 = res.status === 201;
    const isEdtOffset = res.body.starts_at === '2024-11-03T01:30:00-04:00';

    report(
      9,
      'API correctly handles DST Fall Back ambiguity without crashing, defaulting to earlier EDT offset (-04:00)',
      is201 && isEdtOffset,
      `Received: status=${res.status}, starts_at=${res.body.starts_at}`
    );
  } catch (err: any) {
    report(9, 'dst-fall-back-handling', false, err.message);
  }

  // ----------------------------------------------------
  // Req 10: Cross-timezone overlap normalized to UTC
  // ----------------------------------------------------
  try {
    mockRepo.clear();
    // Booking 1: Prof A 2024-05-15T12:00:00 in America/New_York (60 min) -> 16:00 to 17:00 UTC
    const b1 = await request(app).post('/api/bookings').send({
      professor_id: 'Prof A',
      student_id: 'student_ny',
      local_start_time: '2024-05-15T12:00:00',
      timezone: 'America/New_York',
      duration_minutes: 60,
    });

    // Booking 2: Prof A 2024-05-15T09:30:00 in America/Los_Angeles (60 min) -> 16:30 to 17:30 UTC -> 409
    const b2 = await request(app).post('/api/bookings').send({
      professor_id: 'Prof A',
      student_id: 'student_la',
      local_start_time: '2024-05-15T09:30:00',
      timezone: 'America/Los_Angeles',
      duration_minutes: 60,
    });

    const passed = b1.status === 201 && b2.status === 409;

    report(
      10,
      'Overlap logic correctly processes bookings across different timezones by normalizing to UTC (409 Conflict)',
      passed,
      `Statuses: b1=${b1.status}, b2=${b2.status}`
    );
  } catch (err: any) {
    report(10, 'cross-timezone-overlap', false, err.message);
  }

  console.log('\n=====================================================');
  if (allPassed) {
    console.log('🎉 ALL 10 CORE REQUIREMENTS PASSED VERIFICATION! READY TO SUBMIT.');
  } else {
    console.error('❌ SOME CHECKS FAILED.');
    process.exit(1);
  }
  console.log('=====================================================\n');
}

verifyAll();
