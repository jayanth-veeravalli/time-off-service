import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubmitRequestDto } from '../../../src/requests/dto/submit-request.dto';
import { AddCommentDto } from '../../../src/comments/dto/add-comment.dto';
import { LeaveType, AuthorType } from '../../../src/common/types';

function valid(): Record<string, unknown> {
  return {
    employeeId: 'emp-1',
    employerId: 'er-1',
    locationId: 'loc-1',
    leaveType: LeaveType.VACATION,
    year: 2024,
    startDate: '2024-03-01',
    endDate: '2024-03-05',
    requestedHours: 40,
    submittedById: 'emp-1',
    managerId: 'mgr-1',
  };
}

async function errors(plain: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SubmitRequestDto, plain);
  const result = await validate(dto);
  return result.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('SubmitRequestDto validation', () => {
  it('passes with all valid fields', async () => {
    const errs = await errors(valid());
    expect(errs).toHaveLength(0);
  });

  it('rejects when employeeId is missing', async () => {
    const body = valid();
    delete body['employeeId'];
    const errs = await errors(body);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects an invalid leaveType', async () => {
    const errs = await errors({ ...valid(), leaveType: 'HOLIDAY' });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects requestedHours of 0', async () => {
    const errs = await errors({ ...valid(), requestedHours: 0 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects negative requestedHours', async () => {
    const errs = await errors({ ...valid(), requestedHours: -8 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects endDate before startDate', async () => {
    const errs = await errors({
      ...valid(),
      startDate: '2024-03-10',
      endDate: '2024-03-05',
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('accepts endDate equal to startDate', async () => {
    const errs = await errors({
      ...valid(),
      startDate: '2024-03-05',
      endDate: '2024-03-05',
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects a non-integer year', async () => {
    const errs = await errors({ ...valid(), year: 2024.5 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects when managerId is missing', async () => {
    const body = valid();
    delete body['managerId'];
    const errs = await errors(body);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects when managerId is an empty string', async () => {
    const errs = await errors({ ...valid(), managerId: '' });
    expect(errs.length).toBeGreaterThan(0);
  });
});

describe('AddCommentDto validation', () => {
  it('passes with all valid fields', async () => {
    const dto = plainToInstance(AddCommentDto, {
      authorId: 'emp-1',
      authorType: AuthorType.EMPLOYEE,
      body: 'Please review',
    });
    const result = await validate(dto);
    expect(result).toHaveLength(0);
  });

  it('rejects empty body', async () => {
    const dto = plainToInstance(AddCommentDto, {
      authorId: 'emp-1',
      authorType: AuthorType.EMPLOYEE,
      body: '',
    });
    const result = await validate(dto);
    expect(result.length).toBeGreaterThan(0);
  });

  it('rejects invalid authorType', async () => {
    const dto = plainToInstance(AddCommentDto, {
      authorId: 'emp-1',
      authorType: 'SYSTEM',
      body: 'Some comment',
    });
    const result = await validate(dto);
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts MANAGER authorType', async () => {
    const dto = plainToInstance(AddCommentDto, {
      authorId: 'mgr-1',
      authorType: AuthorType.MANAGER,
      body: 'Budget frozen',
    });
    const result = await validate(dto);
    expect(result).toHaveLength(0);
  });
});
