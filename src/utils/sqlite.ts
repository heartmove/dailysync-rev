import { AESKEY_DEFAULT, DB_FILE_PATH, DOWNLOAD_DIR, GARMIN_USERNAME_DEFAULT } from '../constant';
import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';

const CryptoJS = require('crypto-js');

const GARMIN_USERNAME = process.env.GARMIN_USERNAME ?? GARMIN_USERNAME_DEFAULT;
const AESKEY = process.env.AESKEY ?? AESKEY_DEFAULT;

export const initDB = async () => {
    const db = await getDB();
    await db.exec(`CREATE TABLE IF NOT EXISTS garmin_session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user VARCHAR(20),
            region VARCHAR(20),
            session  TEXT
        )`);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS sync_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user VARCHAR(20),
            region VARCHAR(20),
            name VARCHAR(200),
            syncType VARCHAR(200)
        )`)
};

export const getDB = async () => {
    return await open({
        filename: DB_FILE_PATH,
        driver: sqlite3.Database,
    });
};

export const saveSessionToDB = async (type: 'CN' | 'GLOBAL', session: Record<string, any>) => {
    const db = await getDB();
    const encryptedSessionStr = encryptSession(session);
    await db.run(
        `INSERT INTO garmin_session (user,region,session) VALUES (?,?,?)`,
        GARMIN_USERNAME, type, encryptedSessionStr,
    );
};

export const updateSessionToDB = async (type: 'CN' | 'GLOBAL', session: Record<string, any>) => {
    const db = await getDB();
    const encryptedSessionStr = encryptSession(session);
    await db.run(
        'UPDATE garmin_session SET session = ? WHERE user = ? AND region = ?',
        encryptedSessionStr,
        GARMIN_USERNAME,
        type,
    );
};

export const getSessionFromDB = async (type: 'CN' | 'GLOBAL'): Promise<Record<string, any> | undefined> => {
    const db = await getDB();
    const queryResult = await db.get(
        'SELECT session FROM garmin_session WHERE user = ? AND region = ? ',
        GARMIN_USERNAME, type,
    );
    if (!queryResult) {
        return undefined;
    }
    const encryptedSessionStr = queryResult?.session;
    // return {}
    return decryptSession(encryptedSessionStr);
};

export const encryptSession = (session: Record<string, any>): string => {
    const sessionStr = JSON.stringify(session);
    return CryptoJS.AES.encrypt(sessionStr, AESKEY).toString();
};
export const decryptSession = (sessionStr: string): Record<string, any> => {
    const bytes = CryptoJS.AES.decrypt(sessionStr, AESKEY);
    const session = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(session);
};


export const saveSyncConfigToDB = async (type: 'CN' | 'GLOBAL', syncType: string, name: string) => {
    const db = await getDB();
    await db.run(
        `INSERT INTO sync_config (user,region,name,syncType) VALUES (?,?,?,?)`,
        GARMIN_USERNAME, type, name, syncType,
    );
};

export const updateSyncConfigToDB = async (type: 'CN' | 'GLOBAL', syncType: string, name: string) => {
    const db = await getDB();
    await db.run(
        'UPDATE sync_config SET name = ? WHERE user = ? AND region = ? AND syncType = ?',
        name,
        GARMIN_USERNAME,
        type,
        syncType,
    );
};

export const getSyncConfigFromDB = async (type: 'CN' | 'GLOBAL', syncType: string): Promise<String> => {
    const db = await getDB();
    const queryResult = await db.get(
        'SELECT name FROM sync_config WHERE user = ? AND region = ? AND syncType = ? ',
        GARMIN_USERNAME, type, syncType
    );
    if (!queryResult) {
        return "";
    }

    return queryResult.name
};
