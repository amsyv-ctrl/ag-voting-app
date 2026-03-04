import type { Handler } from '@netlify/functions'
import { supabaseAdmin, supabaseAnon } from './_supabase'

export const handler: Handler = async (event) => {
  const slug = event.queryStringParameters?.slug
  const includeResults = event.queryStringParameters?.results === '1'

  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug' }) }
  }

  const { data: ballotRow, error: ballotLookupError } = await supabaseAdmin
    .from('ballots')
    .select('id,deleted_at')
    .eq('slug', slug)
    .maybeSingle()

  if (ballotLookupError || !ballotRow || ballotRow.deleted_at) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Ballot not found' }) }
  }

  const rpcName = includeResults ? 'get_ballot_results_public' : 'get_ballot_public'
  const { data, error } = await supabaseAnon.rpc(rpcName, { p_slug: slug })

  if (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }
}
