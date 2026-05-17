import { CommentsService } from '../../../src/comments/comments.service';
import { RequestNotFoundException } from '../../../src/common/exceptions';
import { AuthorType } from '../../../src/common/types';
import { FixedClockService } from '../../helpers/fixed-clock.service';
import type { Repository } from 'typeorm';
import type { RequestCommentEntity } from '../../../src/comments/request-comment.entity';
import type { TimeOffRequestEntity } from '../../../src/requests/time-off-request.entity';

const FIXED_TIME = new Date('2024-01-15T12:00:00.000Z');

function makeRequest(overrides: object = {}) {
  return { id: 1, externalId: 'req-ext-1', ...overrides };
}

function makeCommentRepo(saved: object = {}) {
  return {
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockResolvedValue({ id: 10, ...saved }),
    find: jest.fn().mockResolvedValue([]),
  };
}

function makeRequestRepo(request: object | null) {
  return { findOne: jest.fn().mockResolvedValue(request) };
}

function makeService(request: object | null, savedComment: object = {}) {
  const clock = new FixedClockService();
  clock.setTime(FIXED_TIME);
  return {
    service: new CommentsService(
      makeCommentRepo(
        savedComment,
      ) as unknown as Repository<RequestCommentEntity>,
      makeRequestRepo(request) as unknown as Repository<TimeOffRequestEntity>,
      clock,
    ),
    clock,
  };
}

const ADD_DTO = {
  authorId: 'emp-1',
  authorType: AuthorType.EMPLOYEE,
  body: 'Need this approved.',
};

describe('CommentsService.addComment', () => {
  it('throws RequestNotFoundException when request does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.addComment('missing', ADD_DTO)).rejects.toBeInstanceOf(
      RequestNotFoundException,
    );
  });

  it('creates comment with correct fields', async () => {
    const commentRepo = makeCommentRepo();
    const clock = new FixedClockService();
    clock.setTime(FIXED_TIME);
    const svc = new CommentsService(
      commentRepo as unknown as Repository<RequestCommentEntity>,
      makeRequestRepo(
        makeRequest(),
      ) as unknown as Repository<TimeOffRequestEntity>,
      clock,
    );
    await svc.addComment('req-ext-1', ADD_DTO);
    expect(commentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 1,
        authorId: 'emp-1',
        authorType: AuthorType.EMPLOYEE,
        body: 'Need this approved.',
        createdAt: FIXED_TIME,
      }),
    );
  });

  it('returns the saved comment', async () => {
    const saved = { id: 10, requestId: 1, body: 'Need this approved.' };
    const { service } = makeService(makeRequest(), saved);
    const result = await service.addComment('req-ext-1', ADD_DTO);
    expect(result).toMatchObject(saved);
  });
});

describe('CommentsService.getComments', () => {
  it('throws RequestNotFoundException when request does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.getComments('missing')).rejects.toBeInstanceOf(
      RequestNotFoundException,
    );
  });

  it('returns comments ordered by createdAt ASC', async () => {
    const comments = [
      { id: 1, body: 'first' },
      { id: 2, body: 'second' },
    ];
    const commentRepo = {
      ...makeCommentRepo(),
      find: jest.fn().mockResolvedValue(comments),
    };
    const clock = new FixedClockService();
    const svc = new CommentsService(
      commentRepo as unknown as Repository<RequestCommentEntity>,
      makeRequestRepo(
        makeRequest(),
      ) as unknown as Repository<TimeOffRequestEntity>,
      clock,
    );
    const result = await svc.getComments('req-ext-1');
    expect(result).toEqual(comments);
    expect(commentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'ASC' } }),
    );
  });

  it('queries by the resolved requestId', async () => {
    const commentRepo = makeCommentRepo();
    const clock = new FixedClockService();
    const svc = new CommentsService(
      commentRepo as unknown as Repository<RequestCommentEntity>,
      makeRequestRepo(
        makeRequest({ id: 42 }),
      ) as unknown as Repository<TimeOffRequestEntity>,
      clock,
    );
    await svc.getComments('req-ext-1');
    expect(commentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requestId: 42 } }),
    );
  });
});
