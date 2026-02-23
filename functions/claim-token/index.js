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
    const payloadStr = (req && req.payload) ? req.payload : '{}';
    const payload = JSON.parse(payloadStr || '{}');
    const token = payload.token || payload.claim_token;
    if (!token) return reply({ error: 'missing token' }, 400);

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const account = new sdk.Account(client);

    // Read claim doc
    const claim = await databases.getDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token);
    if (!claim) return reply({ error: 'invalid token' }, 400);

    // Expiry check
    if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
      await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});
      return reply({ error: 'token expired' }, 400);
    }

    const memberDoc = await databases.getDocument(process.env.DB_ID, process.env.MEMBERS_COLLECTION || 'members', claim.memberId);
    if (!memberDoc || !memberDoc.appwrite_uid) return reply({ error: 'no linked user' }, 400);

    // Create JWT for that user
    const jwtResp = await account.createJWT(memberDoc.appwrite_uid);

    // Consume claim
    await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});

    return reply({ jwt: jwtResp.jwt }, 200);
  } catch (err) {
    console.error(err);
    return reply({ error: 'server error', details: err.message }, 500);
  }
};