import { DealReviewView } from "@/app/components/workflow-ui";
import { findDeal } from "@/lib/ui-workflow-data";

export default async function DealReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealReviewView deal={findDeal(id)} />;
}
