import request = require('supertest');
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TestingModule } from '@nestjs/testing';
import { SchedulerService } from '../../src/scheduler/scheduler.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import {
  buildTestModule,
  deterministicUuid,
  fixedClock,
  hcmMock,
  resetDb,
  seedHcmConfig,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
} from './setup';

const BASE_SUBMIT = {
  employeeId: DEFAULT_KEY.employeeId,
  employerId: DEFAULT_KEY.employerId,
  locationId: DEFAULT_KEY.locationId,
  leaveType: DEFAULT_KEY.leaveType,
  year: DEFAULT_KEY.year,
  requestedHours: 8,
  submittedById: 'emp-1',
  managerId: 'mgr-1',
};

async function submitRequest(app: INestApplication, startDate: string, endDate: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/requests')
    .send({ ...BASE_SUBMIT, startDate, endDate })
    .expect(201);
  return (res.body as { externalId: string }).externalId;
}

describe('RG-11: employee notified on all terminal transitions', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let module: TestingModule;
  let notifications: NotificationsService;

  beforeAll(async () => {
    await startMockServer();
    ({ app, dataSource, module } = await buildTestModule());
    notifications = module.get(NotificationsService);
  });

  afterAll(async () => {
    await app.close();
    await stopMockServer();
  });

  beforeEach(async () => {
    await resetDb(dataSource);
    await hcmMock.reset();
    deterministicUuid.reset();
    fixedClock.setTime(new Date('2024-01-15T12:00:00.000Z'));
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);
  });

  it('approve → notifyEmployee(employeeId, APPROVED, externalId) called once after DB write', async () => {
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app, '2024-03-01', '2024-03-01');
    await request(app.getHttpServer())
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const approvedCalls = spy.mock.calls.filter((c) => c[1] === 'APPROVED');
    expect(approvedCalls).toHaveLength(1);
    expect(approvedCalls[0]).toEqual([DEFAULT_KEY.employeeId, 'APPROVED', externalId]);

    spy.mockRestore();
  });

  it('reject → notifyEmployee(employeeId, REJECTED, externalId) called once', async () => {
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app, '2024-03-01', '2024-03-01');
    await request(app.getHttpServer())
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const calls = spy.mock.calls.filter((c) => c[1] === 'REJECTED');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([DEFAULT_KEY.employeeId, 'REJECTED', externalId]);

    spy.mockRestore();
  });

  it('withdraw PENDING → notifyEmployee(employeeId, WITHDRAWN, externalId) called once', async () => {
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app, '2024-03-01', '2024-03-01');
    await request(app.getHttpServer())
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(200);

    const calls = spy.mock.calls.filter((c) => c[1] === 'WITHDRAWN');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([DEFAULT_KEY.employeeId, 'WITHDRAWN', externalId]);

    spy.mockRestore();
  });

  it('scheduler cancel → notifyEmployee(employeeId, CANCELLED, externalId) called once', async () => {
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    // past startDate so scheduler will cancel it
    const externalId = await submitRequest(app, '2024-01-14', '2024-01-14');

    const scheduler = module.get(SchedulerService);
    await scheduler.runCancellationJob();

    const calls = spy.mock.calls.filter((c) => c[1] === 'CANCELLED');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([DEFAULT_KEY.employeeId, 'CANCELLED', externalId]);

    spy.mockRestore();
  });
});
