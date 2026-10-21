import Checkout from './checkout';
export const metadata = { title: 'Pay with Markee', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default function Page({ params }: { params: { id: string } }) {
  return <Checkout id={params.id} />;
}
