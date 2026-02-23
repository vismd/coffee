const sdk = require('node-appwrite');

// Safe responder that works across Appwrite runtimes
function sendJson(res, body, status = 200) {
  if (res && typeof res.json === 'function') {
    try { console.log('FUNCTION_RESPONSE', JSON.stringify({ status, body })); } catch (e) {}
    return res.json(body, status);
  }
  if (res && typeof res.end === 'function') {
    try { res.statusCode = status; } catch (e) {}
    try { res.end(JSON.stringify(body)); } catch (e) {}
    try { console.log('FUNCTION_RESPONSE', JSON.stringify({ status, body })); } catch (e) {}
    return { status, body };
  }
  console.log('FUNCTION_FALLBACK_RESPONSE', JSON.stringify({ status, body }));
  return { status, body };
}

module.exports = async function (req, res) {
  const reply = (body, status = 200) => sendJson(res, body, status);

  try {
    const incoming = (req && req.req) ? req.req : req;

    // Parse payload from multiple possible runtime shapes
    let payload = {};
    try {
      if (incoming && incoming.payload) payload = JSON.parse(incoming.payload || '{}');
      else if (incoming && incoming.body) payload = (typeof incoming.body === 'string') ? JSON.parse(incoming.body || '{}') : incoming.body;
      else if (incoming && incoming.args) payload = (typeof incoming.args === 'string') ? JSON.parse(incoming.args || '{}') : incoming.args;
      else if (incoming && incoming.variables) payload = incoming.variables;
      else if (incoming && incoming.query) payload = incoming.query;
    } catch (e) {
      console.warn('Failed to parse payload, continuing with empty object', e);
      payload = {};
    }

    const token = payload.token || payload.claim_token || incoming?.token || incoming?.claim_token;
    if (!token) return reply({ error: 'missing token' }, 400);

    // Appwrite client setup (uses service key from env)
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const users = new sdk.Users(client);

    const collClaims = process.env.CLAIMS_COLLECTION || 'claims';
    const collMembers = process.env.MEMBERS_COLLECTION || 'members';

    // 1) Read claim document (SDK first, fallback to REST GET)
    let claim;
    try {
      claim = await databases.getDocument(process.env.DB_ID, collClaims, token);
    } catch (e) {
      // Known SDK issue in some runtimes; try REST GET
      try {
        const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
        const url = `${endpoint}/databases/${process.env.DB_ID}/collections/${collClaims}/documents/${token}`;
        const resp = await fetch(url, { method: 'GET', headers: { 'X-Appwrite-Project': process.env.APPWRITE_PROJECT, 'X-Appwrite-Key': process.env.APPWRITE_API_KEY } });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${JSON.stringify(data)}`);
        claim = data;
      } catch (fetchErr) {
        console.error('Failed to fetch claim document', fetchErr);
        return reply({ error: 'invalid token', details: fetchErr.message }, 400);
      }
    }
    if (!claim) return reply({ error: 'invalid token' }, 400);

    // Expiry check
    if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
      await databases.deleteDocument(process.env.DB_ID, collClaims, token).catch(()=>{});
      return reply({ error: 'token expired' }, 400);
    }

    // 2) Fetch member document referenced by claim.memberId
    let memberDoc;
    try {
      memberDoc = await databases.getDocument(process.env.DB_ID, collMembers, claim.memberId);
    } catch (e) {
      try {
        const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
        const url = `${endpoint}/databases/${process.env.DB_ID}/collections/${collMembers}/documents/${claim.memberId}`;
        const resp = await fetch(url, { method: 'GET', headers: { 'X-Appwrite-Project': process.env.APPWRITE_PROJECT, 'X-Appwrite-Key': process.env.APPWRITE_API_KEY } });
        const data = await resp.json();
        if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${JSON.stringify(data)}`);
        memberDoc = data;
      } catch (fetchErr) {
        console.error('Failed to fetch member document', fetchErr);
        return reply({ error: 'no linked user', details: fetchErr.message }, 400);
      }
    }
    if (!memberDoc) return reply({ error: 'no linked user' }, 400);

    // Determine canonical Appwrite UID if present
    let memberAppwriteUid = memberDoc.appwrite_uid || null;

    // Scanner UID (the device making the claim request)
    const scannerUid = payload.scannerUid || payload.scanner_uid || payload.scanner || incoming?.scannerUid;

    // Helper: create JWT for a given appwrite UID via SDK or REST fallback
    const createJwtForUid = async (uid) => {
      if (!uid) return null;
      // Try SDK if available
      try {
        if (typeof users.createJWT === 'function') {
          return await users.createJWT(uid);
        }
      } catch (e) {
        console.warn('users.createJWT SDK call failed, falling back to REST', e);
      }

      // REST fallbacks (try a few endpoint shapes to handle API/version differences)
      // Normalize endpoint: strip any trailing / or trailing /v1 to avoid double /v1 in URLs
      const endpointRaw = (process.env.APPWRITE_ENDPOINT || '');
      const baseEndpoint = endpointRaw.replace(/\/v1\/?$/,'').replace(/\/$/, '');
      const tryUrls = [
        `${baseEndpoint}/v1/users/${uid}/jwt`,
        `${baseEndpoint}/users/${uid}/jwt`,
        `${baseEndpoint}/v1/users/${uid}/sessions/jwt`,
        `${baseEndpoint}/users/${uid}/sessions/jwt`
      ];
      for (const url of tryUrls) {
        try {
          const resp = await fetch(url, { method: 'POST', headers: { 'X-Appwrite-Project': process.env.APPWRITE_PROJECT, 'X-Appwrite-Key': process.env.APPWRITE_API_KEY } });
          const text = await resp.text().catch(()=>null);
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          if (resp.ok && data) return data;
          console.warn('JWT endpoint attempt failed', { url, status: resp.status, body: data || text });
        } catch (e) {
          console.warn('JWT fetch error for', url, e);
        }
      }
      return null;
    };

    // Helper: extract a JWT string from various response shapes
    const unwrapJwt = (resp) => {
      if (!resp) return undefined;
      if (typeof resp === 'string') return resp;
      if (resp.jwt) return resp.jwt;
      if (resp.token) return resp.token;
      if (resp.access_token) return resp.access_token;
      if (resp.secret) return resp.secret;
      return undefined;
    };

    // If a scanner UID is provided: link or respect existing canonical mapping
    if (scannerUid) {
      try {
        if (memberAppwriteUid) {
          // Do not overwrite existing canonical UID — just mint JWT for that UID
          const jwtResp = await createJwtForUid(memberAppwriteUid);
          await databases.deleteDocument(process.env.DB_ID, collClaims, token).catch(()=>{});
          return reply({ linked: true, memberId: memberDoc.$id, appwrite_uid: memberAppwriteUid, jwt: unwrapJwt(jwtResp) }, 200);
        }

        // No canonical UID yet: set appwrite_uid to scannerUid (SDK then REST fallback)
        try {
          await databases.updateDocument(process.env.DB_ID, collMembers, memberDoc.$id, { appwrite_uid: scannerUid });
          memberDoc.appwrite_uid = scannerUid;
          memberAppwriteUid = scannerUid;
        } catch (updErr) {
          // REST PATCH fallback
          const endpoint = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
          const url = `${endpoint}/databases/${process.env.DB_ID}/collections/${collMembers}/documents/${memberDoc.$id}`;
          const fetchBody = { data: { appwrite_uid: scannerUid } };
          const resp = await fetch(url, { method: 'PATCH', headers: { 'X-Appwrite-Project': process.env.APPWRITE_PROJECT, 'X-Appwrite-Key': process.env.APPWRITE_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(fetchBody) });
          const data = await resp.json();
          if (!resp.ok) throw new Error(`update fetch failed: ${resp.status} ${JSON.stringify(data)}`);
          memberDoc.appwrite_uid = scannerUid;
          memberAppwriteUid = scannerUid;
        }

        // Create JWT for the newly associated UID
        const jwtResp = await createJwtForUid(memberAppwriteUid);
        await databases.deleteDocument(process.env.DB_ID, collClaims, token).catch(()=>{});
        return reply({ linked: true, memberId: memberDoc.$id, appwrite_uid: memberAppwriteUid, jwt: unwrapJwt(jwtResp) }, 200);
      } catch (linkErr) {
        console.error('Failed to link scanner UID', linkErr);
        return reply({ error: 'server error', details: linkErr.message }, 500);
      }
    }

    // No scannerUid provided: attempt to mint a JWT for existing canonical UID and return it
    try {
      const jwtResp = await createJwtForUid(memberAppwriteUid);
      await databases.deleteDocument(process.env.DB_ID, collClaims, token).catch(()=>{});
      return reply({ memberId: memberDoc.$id, appwrite_uid: memberAppwriteUid, jwt: unwrapJwt(jwtResp) }, 200);
    } catch (e) {
      console.error('Failed to create JWT for member', e);
      await databases.deleteDocument(process.env.DB_ID, collClaims, token).catch(()=>{});
      return reply({ memberId: memberDoc.$id }, 200);
    }

  } catch (err) {
    console.error('Function error', err);
    return reply({ error: 'server error', details: err.message }, 500);
  }
};