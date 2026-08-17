import { redirect } from "next/navigation";

// Deprecated route — kept as a redirect (not deleted) in case of external bookmarks.
// The canonical Bank Transfer feature lives at /cash-bank/transfers.
export default function BankTransferPage() {
  redirect("/cash-bank/transfers");
}
