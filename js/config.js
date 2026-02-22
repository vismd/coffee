const { Client, Account, Databases, Storage, Functions, ID, Query } = Appwrite;

const client = new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('699b182300263577e8a8'); 

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);
const functions = new Functions(client);

const DB_ID = '699b2904001d13c834d3';
const COLL_MEMBERS = 'members';
const COLL_LOGS = 'logs';
const COLL_GLOBAL = 'global_config'; // Store group balance here
const COLL_CLAIMS = 'claims'; // single-use claim tokens collection
const BUCKET_ID = '699b36f4000ca06321c8';

// Deploy the Appwrite Function described in functions/claim-token/README.md
// then set its ID here so the client can execute it to exchange a claim token for a JWT.
const CLAIM_FUNCTION_ID = '699b5f6d0008efc5c19c';