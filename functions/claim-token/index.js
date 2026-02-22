const sdk = require('node-appwrite');

module.exports = async function (req, res) {
  try {
    const payload = JSON.parse(req.payload || '{}');
    const token = payload.token || payload.claim_token;
    if (!token) return res.json({ error: 'missing token' }, 400);

    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT)
      .setKey(process.env.APPWRITE_API_KEY);

    const databases = new sdk.Databases(client);
    const account = new sdk.Account(client);

    // Read claim doc
    const claim = await databases.getDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token);
    if (!claim) return res.json({ error: 'invalid token' }, 400);

    // Expiry check
    if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
      await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});
      return res.json({ error: 'token expired' }, 400);
    }

    const memberDoc = await databases.getDocument(process.env.DB_ID, process.env.MEMBERS_COLLECTION || 'members', claim.memberId);
    if (!memberDoc || !memberDoc.appwrite_uid) return res.json({ error: 'no linked user' }, 400);

    // Create JWT for that user
    const jwtResp = await account.createJWT(memberDoc.appwrite_uid);

    // Consume claim
    await databases.deleteDocument(process.env.DB_ID, process.env.CLAIMS_COLLECTION || 'claims', token).catch(()=>{});

    return res.json({ jwt: jwtResp.jwt });
  } catch (err) {
    console.error(err);
    return res.json({ error: 'server error', details: err.message }, 500);
  }
};