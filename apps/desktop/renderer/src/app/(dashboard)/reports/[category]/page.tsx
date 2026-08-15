import { ReportCenter } from "@/components/reports/ReportCenter";
export default async function Page({params}:{params:Promise<{category:string}>}){const {category}=await params;return <ReportCenter category={category}/>}
