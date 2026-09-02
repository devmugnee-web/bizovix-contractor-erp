import { LcDetailWorkspace } from "@/components/lc/LcWorkspaces";

export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <LcDetailWorkspace id={id} />; }
