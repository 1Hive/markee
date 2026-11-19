export async function register() {
  // Opt-in, temporary measurement: logs each server RPC request's host and methods per route.
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.LOG_RPC_CALLS !== '1') return
  const { installRpcLogging } = await import('./lib/server/rpcLogging')
  installRpcLogging()
}
