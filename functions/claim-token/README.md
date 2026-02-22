# Claim Token Appwrite Function

This Appwrite Cloud Function validates a one-time claim token, looks up the linked member, creates a JWT for that member's Appwrite user id, consumes the claim, and returns the JWT.

## Files
- `index.js` - function code
- `package.json` - Node dependencies

## Environment Variables
Set the following in the Appwrite Function settings:
- `APPWRITE_ENDPOINT` - e.g. `https://fra.cloud.appwrite.io/v1`
- `APPWRITE_PROJECT` - your project id
- `APPWRITE_API_KEY` - service key (secret)
- `DB_ID` - your database id
- `MEMBERS_COLLECTION` - defaults to `members`
- `CLAIMS_COLLECTION` - defaults to `claims`

## Deploy Steps (Appwrite Console)
1. Open your Appwrite console -> Functions -> Create Function.
2. Choose runtime `Node.js 18` (or supported Node runtime) and set the entrypoint to `index.js`.
3. Upload the `index.js` and `package.json` files (zip them if required).
4. Add the environment variables above.
5. Set permissions so the function can be executed by the client (or keep restricted and use `functions.createExecution` from the client with an API key if desired).
6. Deploy.

## How the client uses it
- Client creates a claim document in `claims` collection and builds a QR that points to `https://your.site/?claim_token=CLAIM_ID`.
- Scanning device opens that URL; client detects `claim_token` and calls `functions.createExecution(FUNCTION_ID, JSON.stringify({ token: claim_token }))`.
- The function returns `{ jwt: '...' }`. Client calls `client.setJWT(jwt)` and reloads to become the same Appwrite user.

Security notes
- Keep `APPWRITE_API_KEY` secret; it must not be embedded in client code.
- Claims are single-use and short-lived.
