/** Pure view-counter keys shared by the API route and server-side daily statistics. */
export const dayOf = (ms: number = Date.now()) => new Date(ms).toISOString().slice(0, 10)
export const dailyViewsKey = (address: string) => `views:daily:${address.toLowerCase()}`
export const VIEWS_SINCE_KEY = 'views:daily:since'
