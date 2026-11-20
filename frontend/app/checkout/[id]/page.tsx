import Checkout from './checkout';
export const metadata = { title: 'Pay with Markee', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Checkout id={id} />;
}
