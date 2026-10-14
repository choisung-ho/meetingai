import type { IssueStatus } from '../../types/meeting.types';

export const getIssueStatusLabel = (status?: IssueStatus | null) => {
  switch (status) {
    case 'OPEN':
      return '제안';
    case 'IN_PROGRESS':
      return '진행 중';
    case 'CLOSED':
      return '승인';
    default:
      return '-';
  }
};
