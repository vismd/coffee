const sdk = require('node-appwrite');

// Safe responder: Appwrite runtimes normally provide res.json,
// but some runners or wrappers may not. Use a fallback that logs
// a predictable marker so the execution output is still visible.
function sendJson(res, body, status = 200) {
  if (res && typeof res.json === 'function') {
    // res.json may return something the runtime expects; return an object for consistency
    const out = res.json(body, status);
    // Emit a stdout marker that makes the response visible in logs/executions
    try { console.log('FUNCTION_RESPONSE', JSON.stringify({ status, body })); } catch (e) {}
    return out === undefined ? { status, body } : out;
  }

  // Older or custom runtimes may provide res.end
  if (res && typeof res.end === 'function') {
    try {
      res.statusCode = status;
    } catch (e) {}
    // write and flush the response then return a consistent object
    try { res.end(JSON.stringify(body)); } catch (e) { /* ignore */ }
    try { console.log('FUNCTION_RESPONSE', JSON.stringify({ status, body })); } catch (e) {}
    return { status, body };
  }

  // Fallback: print to stdout with a clear marker for logs
  console.log('FUNCTION_FALLBACK_RESPONSE', JSON.stringify({ status, body }));
  try { console.log('FUNCTION_RESPONSE', JSON.stringify({ status, body })); } catch (e) {}
  // Return a value the runtime can observe to avoid "Return statement missing" errors
  return { status, body };
}

module.exports = async function (req, res) {
  const reply = (body, status) => sendJson(res, body, status);

  try {
    // Some runtimes wrap the real request in a `req` property (we saw a wrapper object). Normalize it.
    const incoming = (req && req.req) ? req.req : req;

    // Diagnostic: log incoming request shape (avoid logging large or sensitive fields)
    try {
      console.log('REQ_KEYS', Object.keys(incoming || {}).slice(0,50));
      // Print a small snapshot of common fields that may contain payload
      const snap = {
        payloadType: typeof (incoming && incoming.payload),
        bodyType: typeof (incoming && incoming.body),
        argsType: typeof (incoming && incoming.args),
        variablesType: typeof (incoming && incoming.variables),
        queryType: typeof (incoming && incoming.query)
      };
      console.log('REQ_SNAPSHOT', JSON.stringify(snap));
    } catch (e) {
      console.warn('Failed to snapshot request shape', e);
    }
    // Support multiple runtime shapes: incoming.payload (string), incoming.body, incoming.variables, incoming.args, incoming.query
    let payload = {};
    try {
      if (incoming && incoming.payload) {
        payload = JSON.parse(incoming.payload || '{}');
      } else if (incoming && incoming.body) {
        payload = (typeof incoming.body === 'string') ? JSON.parse(incoming.body || '{}') : incoming.body;
      } else if (incoming && incoming.args) {
        payload = (typeof incoming.args === 'string') ? JSON.parse(incoming.args || '{}') : incoming.args;
      } else if (incoming && incoming.variables) {
        payload = incoming.variables;
      } else if (incoming && incoming.query) {
        payload = incoming.query;
      }
    } catch (e) {
      console.warn('Failed to parse incoming payload shape, continuing with empty payload', e);
      payload = {};
    }

    const token = payload.token || payload.claim_token || incoming?.token || incoming?.claim_token;

    console.log('EXTRACTED_TOKEN', token ? '[REDACTED]' : null);

    // Log environment configuration (names only) to ensure we're pointing to the right collections
    try {
      console.log('ENV', JSON.stringify({ DB_ID: !!process.env.DB_ID, CLAIMS_COLLECTION: process.env.CLAIMS_COLLECTION || 'claims', MEMBERS_COLLECTION: process.env.MEMBERS_COLLECTION || 'members' }));
    } catch (e) {
      console.warn('Failed to log env snapshot', e);
    }
    if (!token) return reply({ error: 'missing token' }, 400);

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const account = new sdk.Account(client);
    const users = new sdk.Users(client);

    // Read claim doc
    // Read claim doc
    let claim;
    const collName = process.env.CLAIMS_COLLECTION || 'claims';
    try {
      console.log('ATTEMPT_GET_DOCUMENT', JSON.stringify({ db: String(process.env.DB_ID).slice(-8), collection: collName, tokenLength: String(token).length, tokenSample: String(token).slice(0,8) }));
      claim = await databases.getDocument(process.env.DB_ID, collName, token);
      console.log('CLAIM_DOC', JSON.stringify({ id: claim.$id || null, memberId: claim.memberId || null, expiresAt: claim.expiresAt || null }));
    } catch (e) {
      console.error('Failed to read claim document', e);
      // Known SDK issue: some runtimes throw "request cannot have request body" for GET via SDK
      if (e && typeof e.message === 'string' && e.message.includes('request cannot have request body')) {
        try {
          // Fallback: call Appwrite REST API directly using fetch (Node 18+ runtime)
          const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
          const url = `${endpoint}/databases/${process.env.DB_ID}/collections/${collName}/documents/${token}`;
          console.log('FALLBACK_FETCH_URL', url);
          const fetchResp = await fetch(url, {
            method: 'GET',
            headers: {
              'X-Appwrite-Project': process.env.APPWRITE_PROJECT,
              'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
              'Content-Type': 'application/json'
            }
          });
          const data = await fetchResp.json();
          if (!fetchResp.ok) throw new Error(`fetch failed: ${fetchResp.status} ${JSON.stringify(data)}`);
          claim = data;
          console.log('CLAIM_DOC_FALLBACK', JSON.stringify({ id: claim.$id || null, memberId: claim.memberId || null, expiresAt: claim.expiresAt || null }));
        } catch (fetchErr) {
          console.error('Fallback fetch failed', fetchErr);
          return reply({ error: 'invalid token', details: fetchErr.message }, 400);
        }
      } else {
        return reply({ error: 'invalid token', details: e.message }, 400);
      }
    }
    if (!claim) return reply({ error: 'invalid token' }, 400);

    // Expiry check
    if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
      await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});
      return reply({ error: 'token expired' }, 400);
    }

    let memberDoc;
    const membersColl = process.env.MEMBERS_COLLECTION || 'members';
    try {
      memberDoc = await databases.getDocument(process.env.DB_ID, membersColl, claim.memberId);
      console.log('MEMBER_DOC', JSON.stringify({ id: memberDoc.$id || null, appwrite_uid: !!(memberDoc && memberDoc.appwrite_uid) }));
    } catch (e) {
      console.error('Failed to read member document', e);
      if (e && typeof e.message === 'string' && e.message.includes('request cannot have request body')) {
        try {
          // Fallback: REST GET directly
          const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
          const url = `${endpoint}/databases/${process.env.DB_ID}/collections/${membersColl}/documents/${claim.memberId}`;
          console.log('FALLBACK_MEMBER_FETCH_URL', url);
          const fetchResp = await fetch(url, {
            method: 'GET',
            headers: {
              'X-Appwrite-Project': process.env.APPWRITE_PROJECT,
              'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
              'Content-Type': 'application/json'
            }
          });
          const data = await fetchResp.json();
          if (!fetchResp.ok) throw new Error(`fetch failed: ${fetchResp.status} ${JSON.stringify(data)}`);
          memberDoc = data;
          console.log('MEMBER_DOC_FALLBACK', JSON.stringify({ id: memberDoc.$id || null, appwrite_uid: !!(memberDoc && memberDoc.appwrite_uid) }));
        } catch (fetchErr) {
          console.error('Fallback member fetch failed', fetchErr);
          return reply({ error: 'no linked user', details: fetchErr.message }, 400);
        }
      } else {
        return reply({ error: 'no linked user', details: e.message }, 400);
      }
    }

    if (!memberDoc || !memberDoc.appwrite_uid) return reply({ error: 'no linked user' }, 400);

    // Create JWT for that user using SDK (preferable) and fall back to REST if needed
    let jwtResp;
    try {
      jwtResp = await users.createJWT(memberDoc.appwrite_uid);
      console.log('CREATE_JWT_SDK', JSON.stringify(jwtResp));
    } catch (e) {
      console.error('users.createJWT failed', e);
      // Fallback: try the REST endpoint (some Appwrite versions differ)
      try {
        const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
        const url = `${endpoint}/users/${memberDoc.appwrite_uid}/jwt`;
        console.log('CREATE_JWT_URL_FALLBACK', url);
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'X-Appwrite-Project': process.env.APPWRITE_PROJECT,
            'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
            'Content-Type': 'application/json'
          }
        });
        const data = await resp.json();
        console.log('CREATE_JWT_RESPONSE_FALLBACK', JSON.stringify({ status: resp.status, body: data }));
        if (!resp.ok) throw new Error(`createJWT fetch failed: ${resp.status} ${JSON.stringify(data)}`);
        jwtResp = data;
      } catch (fetchErr) {
        console.error('Failed to create JWT via fallback', fetchErr);
        return reply({ error: 'server error', details: fetchErr.message }, 500);
      }
    }

    // Consume claim
    await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});

    return reply({ jwt: jwtResp.jwt }, 200);
  } catch (err) {
    console.error(err);
    return reply({ error: 'server error', details: err.message }, 500);
  }
};