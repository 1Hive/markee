import type { Metadata } from 'next'
import { IntegrationAudit } from './view'

export const metadata: Metadata = {
  title: 'Integration audit | Markee',
  robots: { index: false, follow: false },
}

export default function IntegrationAuditPage() {
  return <IntegrationAudit />
}
