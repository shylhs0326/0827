import PageHeader from '@/components/shell/page-header';
import ChatForm from './chat-form';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AgentPage() {
  await requireUser();
  const enabled = Boolean(
    process.env.OPENAI_BASE_URL?.trim()
    && process.env.OPENAI_API_KEY?.trim()
    && process.env.OPENAI_MODEL?.trim(),
  );

  return <div className="content"><PageHeader title="AI 운영 어시스턴트" description="실데이터 근거와 Tool trace를 바탕으로 SCM 질문에 답합니다." /><ChatForm enabled={enabled} /></div>;
}
