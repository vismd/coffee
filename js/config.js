const { Client, Account, Databases, Storage, ID, Query } = Appwrite;

const client = new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('699b182300263577e8a8'); 

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

const DB_ID = 'coffee_db';
const COLL_MEMBERS = 'members';
const COLL_LOGS = 'logs';
const COLL_GLOBAL = 'global_config'; // Store group balance here
const BUCKET_ID = 'receipts';