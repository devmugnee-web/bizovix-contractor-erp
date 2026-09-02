import { AccountClassDetailScreen } from "@/features/screens/account-class-detail-screen";

export default async function AccountClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AccountClassDetailScreen classId={id} />;
}
