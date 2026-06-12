import { FailureRepository } from './failure.repository';

const FAILURE_DATA = {
  lineHash: 'a'.repeat(64),
  rawLine: '{invalid json',
  errorMessage: 'Unexpected token i in JSON at position 1',
};

describe('FailureRepository', () => {
  it('calls prisma.gatewayLogFailure.create with the three correct fields', async () => {
    const createMock = jest.fn().mockResolvedValue(undefined);
    const prisma = { gatewayLogFailure: { create: createMock } };
    const repo = new FailureRepository(prisma as never);

    await repo.save(FAILURE_DATA);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        line_hash: FAILURE_DATA.lineHash,
        raw_line: FAILURE_DATA.rawLine,
        error_message: FAILURE_DATA.errorMessage,
      },
    });
  });
});
