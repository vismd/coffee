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

    if (!memberDoc) return reply({ error: 'no linked user' }, 400);

    // Determine canonical Appwrite user id for this member (prefer single-field, then array)
    let memberAppwriteUid = null;
    if (memberDoc.appwrite_uid) memberAppwriteUid = memberDoc.appwrite_uid;
    else if (Array.isArray(memberDoc.appwrite_uids) && memberDoc.appwrite_uids.length) memberAppwriteUid = memberDoc.appwrite_uids[0];

    // If the scanner provided its Appwrite UID, link it to the member record.
    const scannerUid = payload.scannerUid || payload.scanner_uid || payload.scanner || incoming?.scannerUid;
    if (scannerUid) {
      try {
        // If the member is already associated with this UID, skip update
        if (String(memberDoc.appwrite_uid || '') === String(scannerUid)) {
          console.log('Scanner UID already linked as appwrite_uid');
        } else {
          // Overwrite/create the single `appwrite_uid` field to permanently associate member with this device UID
          try {
            await databases.updateDocument(process.env.DB_ID, membersColl, memberDoc.$id, { appwrite_uid: scannerUid });
            console.log('UPDATED_MEMBER_APPWRITE_UID_VIA_SDK', memberDoc.$id, scannerUid);
          } catch (updErr) {
            console.error('SDK updateDocument failed, falling back to REST', updErr);
            const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
            const url = `${endpoint}/databases/${process.env.DB_ID}/collections/${membersColl}/documents/${memberDoc.$id}`;
            try {
              const fetchBody = { data: { appwrite_uid: scannerUid } };
              const resp = await fetch(url, {
                method: 'PATCH',
                headers: {
                  'X-Appwrite-Project': process.env.APPWRITE_PROJECT,
                  'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(fetchBody)
              });
              const data = await resp.json();
              if (!resp.ok) throw new Error(`update fetch failed: ${resp.status} ${JSON.stringify(data)}`);
              console.log('UPDATED_MEMBER_VIA_FETCH', JSON.stringify({ id: data.$id || data.id }));
            } catch (fetchErr) {
              console.error('update fetch failed', fetchErr);
              throw fetchErr;
            }
          }
          // reflect change locally
          memberDoc.appwrite_uid = scannerUid;
        }

        // After linking, set canonical to the scanner UID
        memberAppwriteUid = scannerUid;

        // Attempt to create a JWT for the canonical Appwrite user id (server-side)
        let jwtResp = null;
        if (memberAppwriteUid) {
          try {
            if (typeof users.createJWT === 'function') {
              jwtResp = await users.createJWT(memberAppwriteUid);
            } else {
              // REST fallback to create JWT
              const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
              const url = `${endpoint}/users/${memberAppwriteUid}/jwt`;
              const resp = await fetch(url, {
                method: 'POST',
                headers: {
                  'X-Appwrite-Project': process.env.APPWRITE_PROJECT,
                  'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
                  'Content-Type': 'application/json'
                }
              });
              const data = await resp.json();
              if (!resp.ok) throw new Error(`jwt fetch failed: ${resp.status} ${JSON.stringify(data)}`);
              jwtResp = data;
            }
            console.log('CREATED_JWT_FOR', memberAppwriteUid);
          } catch (jwtErr) {
            console.error('Failed to create JWT for', memberAppwriteUid, jwtErr);
            jwtResp = null;
          }
        }

        // Consume claim
        await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});
        return reply({ linked: true, memberId: memberDoc.$id, jwt: jwtResp ? jwtResp.jwt : undefined }, 200);
      } catch (linkErr) {
        console.error('Failed to link scanner UID', linkErr);
        return reply({ error: 'server error', details: linkErr.message }, 500);
      }
    }

    // If no scannerUid provided, attempt to mint a JWT for the canonical appwrite UID and return it
    let jwtResp = null;
    if (!memberAppwriteUid && memberDoc.appwrite_uids && memberDoc.appwrite_uids.length) {
      memberAppwriteUid = memberDoc.appwrite_uids[0];
    }
    if (memberAppwriteUid) {
      try {
        if (typeof users.createJWT === 'function') {
          jwtResp = await users.createJWT(memberAppwriteUid);
        } else {
          const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
          const url = `${endpoint}/users/${memberAppwriteUid}/jwt`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'X-Appwrite-Project': process.env.APPWRITE_PROJECT,
              'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
              'Content-Type': 'application/json'
            }
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(`jwt fetch failed: ${resp.status} ${JSON.stringify(data)}`);
          jwtResp = data;
        }
        console.log('CREATED_JWT_FOR', memberAppwriteUid);
      } catch (jwtErr) {
        console.error('Failed to create JWT for', memberAppwriteUid, jwtErr);
        jwtResp = null;
      }
    }

    await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});
    return reply({ memberId: memberDoc.$id, jwt: jwtResp ? jwtResp.jwt : undefined }, 200);
  } catch (err) {
    console.error(err);
    return reply({ error: 'server error', details: err.message }, 500);
  }
};