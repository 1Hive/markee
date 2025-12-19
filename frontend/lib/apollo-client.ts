import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'
import { SUBGRAPH_URLS, CANONICAL_CHAIN_ID } from './contracts/addresses'

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: SUBGRAPH_URLS[CANONICAL_CHAIN_ID],
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'network-only',
    },
    query: {
      fetchPolicy: 'network-only',
    },
  },
})
