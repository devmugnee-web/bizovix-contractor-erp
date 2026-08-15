import { ReportWorkspace } from "@/components/reports/ReportWorkspace";
export default async function Page({params}:{params:Promise<{category:string;report:string}>}){const {category,report}=await params;return <ReportWorkspace category={category} report={report}/>}
