import { redirect } from "next/navigation";

// Deprecated route — kept as a redirect (not deleted) in case of external bookmarks.
// The canonical Bank Accounts feature lives under Cash & Bank.
export default function BankAccountsPage() {
  redirect("/cash-bank/bank-accounts");
}
