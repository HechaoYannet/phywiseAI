import { ProblemConfirmation } from "../../../../components/problem-confirmation";

export default async function ProblemConfirmationPage({
  params
}: {
  params: Promise<{ problemId: string }>;
}) {
  const { problemId } = await params;

  return <ProblemConfirmation problemId={problemId} />;
}
