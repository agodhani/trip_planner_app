import ComingSoonPage from '@/components/coming-soon';

export default function Page({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  return <ComingSoonPage params={params} title="Getting around" />;
}
