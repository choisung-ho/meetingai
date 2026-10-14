import {
  MeetingRecordDetailPageUI,
  type MeetingRecordDetailData,
  type MeetingRecordDetailPageUIProps,
} from "./MeetingRecordDetailPage.ui";

type MeetingRecordDetailPageProps = {
  record: MeetingRecordDetailData;
  actions: {
    backToList: () => void;
  } & Omit<MeetingRecordDetailPageUIProps["actions"], "backToList">;
  sidebar: MeetingRecordDetailPageUIProps["sidebar"];
};

export function MeetingRecordDetailPage({
  record,
  actions,
  sidebar,
}: MeetingRecordDetailPageProps) {
  return <MeetingRecordDetailPageUI record={record} actions={actions} sidebar={sidebar} />;
}
