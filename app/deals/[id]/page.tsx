import { DealReviewView, findDeal } from "@/app/components/workflow-ui";

export default async function DealReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealReviewView deal={findDeal(id)} />;
}
