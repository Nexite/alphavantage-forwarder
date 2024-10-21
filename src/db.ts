import sqlite3 from 'sqlite3';
import fs from 'fs';

export const db = new sqlite3.Database(
    fs.existsSync('database_dev.sqlite') ? 'database_dev.sqlite' : 'database.sqlite'
);

export const createTables = () => {
    // Create tickers table
    db.run(`CREATE TABLE IF NOT EXISTS tickers (name TEXT PRIMARY KEY NOT NULL, last_call DATETIME, times_called INTEGER);`);
    // Create ips table
    db.run(`CREATE TABLE IF NOT EXISTS ips (ip TEXT PRIMARY KEY NOT NULL, last_call DATETIME, times_called INTEGER);`);
}

export const ticker = (ticker: string) => {
    const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

    db.get('SELECT * FROM tickers WHERE name = ?', [ticker], (err, row) => {
        if (err) {
            console.error('Error querying database:', err);
            return;
        }

        if (row) {
            // Ticker exists, update times_called and last_call
            db.run('UPDATE tickers SET times_called = times_called + 1, last_call = ? WHERE name = ?', [currentDateTime, ticker], (err) => {
                if (err) {
                    console.error('Error updating ticker:', err);
                }
            });
        } else {
            // Ticker doesn't exist, insert new record
            db.run('INSERT INTO tickers (name, last_call, times_called) VALUES (?, ?, 1)', [ticker, currentDateTime], (err) => {
                if (err) {
                    console.error('Error inserting new ticker:', err);
                }
            });
        }
    });
}

export const ip = (ip: string) => {
    const currentDateTime = new Date().toISOString().slice(0, 19).replace('T', ' ');

    db.get('SELECT * FROM ips WHERE ip = ?', [ip], (err, row: any) => {
        if (err) {
            console.error('Error querying database:', err);
            return;
        }

        if (row) {
            // Ticker exists, update times_called and last_call if last call is more than 15 minutes ago
            const mins = 15;
            if (new Date(row.last_call).getTime() < Date.now() - mins * 60 * 1000) {
                db.run('UPDATE ips SET times_called = times_called + 1, last_call = ? WHERE ip = ?', [currentDateTime, ip], (err) => {
                    if (err) {
                        console.error('Error updating ip:', err);
                    }
                });
            }
        }
        else {
            // Ticker doesn't exist, insert new record
            db.run('INSERT INTO ips (ip, last_call, times_called) VALUES (?, ?, 1)', [ip, currentDateTime], (err) => {
                if (err) {
                    console.error('Error inserting new ip:', err);
                }
            });
        }
    })
}