import { WorkspaceEditor } from "../../../components/workspace-editor";

export default async function WorkspacePage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return <WorkspaceEditor workspaceId={workspaceId} />;
}
