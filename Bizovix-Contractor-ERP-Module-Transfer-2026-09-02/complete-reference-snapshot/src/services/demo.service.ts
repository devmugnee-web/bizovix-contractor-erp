import { getDataProvider } from "@/services/data-provider";

export function resetDemoData() {
  return getDataProvider("demo").demo.reset();
}
