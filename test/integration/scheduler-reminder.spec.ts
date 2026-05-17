import type { Server } from 'http';
import request from 'supertest';
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
  BalanceKey,
} from './setup';

describe('RG-8b: reminder job notifies managers only for non-expired PENDING requests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let module: TestingModule;

  beforeAll(async () => {
    await startMockServer();
    ({ app, dataSource, module } = await buildTestModule());
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
  });

  it('notifyPendingRequests called with only today+future requests, not past', async () => {
    await seedHcmConfig(dataSource);

    const seedAndSubmit = async (
      employeeId: string,
      startDate: string,
      endDate: string,
    ) => {
      const key: BalanceKey = { ...DEFAULT_KEY, employeeId };
      await hcmMock.seed(key, 80);
      const res = await request(app.getHttpServer() as Server)
        .post('/requests')
        .send({
          employeeId,
          employerId: DEFAULT_KEY.employerId,
          locationId: DEFAULT_KEY.locationId,
          leaveType: DEFAULT_KEY.leaveType,
          year: DEFAULT_KEY.year,
          startDate,
          endDate,
          requestedHours: 8,
          submittedById: employeeId,
          managerId: 'mgr-1',
        })
        .expect(201);
      return (res.body as { externalId: string }).externalId;
    };

    const pastId = await seedAndSubmit('emp-1', '2024-01-14', '2024-01-14');
    const todayId = await seedAndSubmit('emp-2', '2024-01-15', '2024-01-15');
    const futureId = await seedAndSubmit('emp-3', '2024-01-16', '2024-01-16');

    const notifications = module.get(NotificationsService);
    const spy = jest.spyOn(notifications, 'notifyPendingRequests');

    const scheduler = module.get(SchedulerService);
    await scheduler.runReminderJob();

    expect(spy).toHaveBeenCalledTimes(1);
    const notifiedRequests = spy.mock.calls[0][1];
    const notifiedIds = (notifiedRequests as Array<{ externalId: string }>).map(
      (r) => r.externalId,
    );

    expect(notifiedIds).toContain(todayId);
    expect(notifiedIds).toContain(futureId);
    expect(notifiedIds).not.toContain(pastId);

    spy.mockRestore();
  });
});
