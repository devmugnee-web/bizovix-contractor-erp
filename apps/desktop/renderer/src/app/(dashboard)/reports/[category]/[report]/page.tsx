import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
import { ProjectProfitLossReport } from "@/components/reports/ProjectProfitLossReport";

export default async function Page({params}:{params:Promise<{category:string;report:string}>}) {
  const {category, report} = await params;

  if (category === "projects" && report === "profit-loss") {
    return <ProjectProfitLossReport />;
  }

  return <ReportWorkspace category={category} report={report}/>;
}
