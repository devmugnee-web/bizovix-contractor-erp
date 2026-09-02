import { VoucherEntryScreen } from "@/features/screens/voucher-entry-screen";
import type { VoucherType } from "@/types/domain";

export default async function AppVoucherPage({
  params,
}: {
  params: Promise<{ type: VoucherType }>;
}) {
  const { type } = await params;

  return <VoucherEntryScreen voucherType={type} />;
}
