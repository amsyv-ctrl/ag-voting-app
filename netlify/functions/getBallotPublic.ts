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

  if (error && !includeResults && error.message === 'Ballot is not open') {
    const { data: ballotData, error: fallbackError } = await supabaseAdmin
      .from('ballots')
      .select('id,slug,title,incumbent_name,description,ballot_type,majority_rule,status,opens_at,closes_at,vote_round,requires_pin,event_id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (fallbackError || !ballotData) {
      return { statusCode: 400, body: JSON.stringify({ error: fallbackError?.message ?? error.message }) }
    }

    const { data: eventData, error: eventError } = await supabaseAdmin
      .from('events')
      .select('name')
      .eq('id', ballotData.event_id)
      .single()

    if (eventError || !eventData) {
      return { statusCode: 400, body: JSON.stringify({ error: eventError?.message ?? 'Event not found' }) }
    }

    const { data: choicesData, error: choicesError } = await supabaseAdmin
      .from('choices')
      .select('id,label,sort_order')
      .eq('ballot_id', ballotData.id)
      .eq('is_withdrawn', false)
      .order('sort_order', { ascending: true })

    if (choicesError) {
      return { statusCode: 400, body: JSON.stringify({ error: choicesError.message }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ballot_id: ballotData.id,
        event_name: eventData.name,
        slug: ballotData.slug,
        title: ballotData.title,
        incumbent_name: ballotData.incumbent_name,
        description: ballotData.description,
        ballot_type: ballotData.ballot_type,
        majority_rule: ballotData.majority_rule,
        status: ballotData.status,
        opens_at: ballotData.opens_at,
        closes_at: ballotData.closes_at,
        vote_round: ballotData.vote_round,
        requires_pin: ballotData.requires_pin,
        choices: choicesData ?? []
      })
    }
  }

  if (error) {
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }
}
