/**
 * Runs the mock OpenID Provider on a fixed port for manual, browser-based
 * walkthroughs of the login flow.
 *
 *   npm run dev:mock-account
 *
 * It is a **development fixture**, never something to point production at.
 * Anything that works here still has to be re-verified against the real
 * account center; see the checklist in docs/authentication.md.
 */
import { MockAccountCenter } from './oidc-provider-mock.js'
import { createLogger } from '../logger.js'

const PORT = Number.parseInt(process.env.MOCK_ACCOUNT_PORT ?? '4400', 10)
const logger = createLogger()

async function main(): Promise<void> {
  const provider = new MockAccountCenter({
    clientId: process.env.ACCOUNT_CLIENT_ID ?? 'rishi',
    clientSecret: process.env.ACCOUNT_CLIENT_SECRET ?? 'local-mock-client-secret',
  })

  await provider.start(PORT)
  provider.userInfoClaims = {
    sub: 'usr_VJQ4V0D7H5W0JYKEGSR7VQ670V',
    name: '林小柚',
    email: 'xiaoyou@example.com',
  }

  logger.info('mock-account-center.listening', { issuer: provider.issuer })
}

void main()
